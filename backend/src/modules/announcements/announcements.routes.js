const express = require('express');
const { all, one, run } = require('../../db');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule } = require('../../middleware/permissions');

// Module "Infos & Événements" : annonces (info ou événement) publiées par les personnes autorisées.
// Lecture pour tout détenteur du module ; création (niveau "ajout"), édition/suppression ("edition").
const router = express.Router();
router.use(requireAuth);

router.get('/', requireSubModule('annonces'), async (req, res, next) => {
  try {
    res.json(await all(
      `SELECT a.id, a.titre, a.contenu, a.type, a.date_evenement, a.lieu, a.created_at,
              u.prenom AS author_prenom, u.nom AS author_nom
       FROM announcements a
       LEFT JOIN users u ON u.id = a.created_by
       ORDER BY COALESCE(a.date_evenement, a.created_at::date) DESC, a.created_at DESC`
    ));
  } catch (e) { next(e); }
});

// Normalise le corps : un "info" n'a ni date ni lieu ; un "evenement" peut en avoir.
function parseBody(b) {
  const type = b.type === 'evenement' ? 'evenement' : 'info';
  return {
    titre: (b.titre || '').trim(),
    contenu: (b.contenu || '').trim() || null,
    type,
    date_evenement: type === 'evenement' && b.date_evenement ? b.date_evenement : null,
    lieu: type === 'evenement' && b.lieu ? String(b.lieu).trim() : null,
  };
}

router.post('/', requireSubModule('annonces', 'ajout'), async (req, res, next) => {
  try {
    const f = parseBody(req.body || {});
    if (!f.titre) return res.status(400).json({ error: 'Le titre est obligatoire.' });
    const row = await one(
      `INSERT INTO announcements (titre, contenu, type, date_evenement, lieu, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [f.titre, f.contenu, f.type, f.date_evenement, f.lieu, req.user.id]
    );
    res.status(201).json(row);
  } catch (e) { next(e); }
});

router.put('/:id', requireSubModule('annonces', 'edition'), async (req, res, next) => {
  try {
    const f = parseBody(req.body || {});
    if (!f.titre) return res.status(400).json({ error: 'Le titre est obligatoire.' });
    const row = await one(
      `UPDATE announcements SET titre=$1, contenu=$2, type=$3, date_evenement=$4, lieu=$5 WHERE id=$6 RETURNING *`,
      [f.titre, f.contenu, f.type, f.date_evenement, f.lieu, Number(req.params.id)]
    );
    if (!row) return res.status(404).json({ error: 'Annonce introuvable.' });
    res.json(row);
  } catch (e) { next(e); }
});

router.delete('/:id', requireSubModule('annonces', 'edition'), async (req, res, next) => {
  try {
    await run('DELETE FROM announcements WHERE id = $1', [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
