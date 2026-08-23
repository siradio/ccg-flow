const express = require('express');
const multer = require('multer');
const { pool, all, one, run } = require('../../db');
const blob = require('../../storage/blob');
const { requireAuth } = require('../../middleware/auth');
const { requireSubModule } = require('../../middleware/permissions');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } });
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg']);
const STATUTS = new Set(['ok', 'ko', 'na']);

// Module Logistique — Checklists chauffeurs : gestion des MODÈLES (modèle + items ordonnés).
// Lecture pour tout détenteur du sous-module ; création/édition/suppression gatées.
const router = express.Router();
router.use(requireAuth);

// Nettoie et ordonne les items reçus du formulaire (libellés non vides uniquement).
function cleanItems(items) {
  return (Array.isArray(items) ? items : [])
    .map(it => (typeof it === 'string' ? it : (it && it.libelle) || '').trim())
    .filter(Boolean)
    .map((libelle, i) => ({ libelle, ordre: i + 1 }));
}

router.get('/templates', requireSubModule('logistique.checklists'), async (req, res, next) => {
  try {
    const templates = await all('SELECT id, nom, type, actif, created_at FROM checklist_templates ORDER BY nom');
    const items = await all('SELECT id, template_id, libelle, ordre FROM checklist_template_items ORDER BY template_id, ordre');
    res.json(templates.map(t => ({ ...t, items: items.filter(i => i.template_id === t.id) })));
  } catch (e) { next(e); }
});

router.post('/templates', requireSubModule('logistique.checklists', 'ajout'), async (req, res, next) => {
  const { nom, type, items } = req.body || {};
  if (!nom || !nom.trim()) return res.status(400).json({ error: 'Le nom du modèle est obligatoire.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [t] } = await client.query(
      'INSERT INTO checklist_templates (nom, type, actif) VALUES ($1,$2,$3) RETURNING id, nom, type, actif, created_at',
      [nom.trim(), (type || 'Départ'), true]
    );
    for (const it of cleanItems(items)) {
      await client.query('INSERT INTO checklist_template_items (template_id, libelle, ordre) VALUES ($1,$2,$3)', [t.id, it.libelle, it.ordre]);
    }
    await client.query('COMMIT');
    const list = await all('SELECT id, libelle, ordre FROM checklist_template_items WHERE template_id = $1 ORDER BY ordre', [t.id]);
    res.status(201).json({ ...t, items: list });
  } catch (e) { await client.query('ROLLBACK'); next(e); }
  finally { client.release(); }
});

// Mise à jour : entête + REMPLACEMENT complet des items (simple et prévisible ; les réalisations
// passées gardent leur propre copie des items, donc rien n'est perdu côté historique).
router.put('/templates/:id', requireSubModule('logistique.checklists', 'edition'), async (req, res, next) => {
  const { nom, type, actif, items } = req.body || {};
  const id = Number(req.params.id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [existing] } = await client.query('SELECT * FROM checklist_templates WHERE id = $1', [id]);
    if (!existing) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Modèle introuvable.' }); }
    const { rows: [t] } = await client.query(
      'UPDATE checklist_templates SET nom = $1, type = $2, actif = $3 WHERE id = $4 RETURNING id, nom, type, actif, created_at',
      [(nom && nom.trim()) || existing.nom, type || existing.type, actif === undefined ? existing.actif : !!actif, id]
    );
    if (items !== undefined) {
      await client.query('DELETE FROM checklist_template_items WHERE template_id = $1', [id]);
      for (const it of cleanItems(items)) {
        await client.query('INSERT INTO checklist_template_items (template_id, libelle, ordre) VALUES ($1,$2,$3)', [id, it.libelle, it.ordre]);
      }
    }
    await client.query('COMMIT');
    const list = await all('SELECT id, libelle, ordre FROM checklist_template_items WHERE template_id = $1 ORDER BY ordre', [id]);
    res.json({ ...t, items: list });
  } catch (e) { await client.query('ROLLBACK'); next(e); }
  finally { client.release(); }
});

router.delete('/templates/:id', requireSubModule('logistique.checklists', 'edition'), async (req, res, next) => {
  try {
    await run('DELETE FROM checklist_templates WHERE id = $1', [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ─── Réalisations (runs) ────────────────────────────────────────────────────────────────────
async function getRunDetail(id) {
  const runRow = await one(
    `SELECT r.*, v.immatriculation AS vehicle_immat, d.nom AS driver_nom, d.prenom AS driver_prenom
     FROM checklist_runs r
     JOIN vehicles v ON v.id = r.vehicle_id
     LEFT JOIN drivers d ON d.id = r.driver_id
     WHERE r.id = $1`, [id]);
  if (!runRow) return null;
  const items = await all(
    `SELECT id, libelle, statut, commentaire, ordre, (photo IS NOT NULL OR photo_key IS NOT NULL) AS has_photo
     FROM checklist_run_items WHERE run_id = $1 ORDER BY ordre`, [id]);
  return { ...runRow, items };
}

// Liste des checklists réalisées, avec un résumé OK/KO par réalisation.
router.get('/runs', requireSubModule('logistique.checklists'), async (req, res, next) => {
  try {
    res.json(await all(
      `SELECT r.id, r.template_nom, r.type, r.realise_le, r.notes, r.vehicle_id,
              v.immatriculation AS vehicle_immat, d.nom AS driver_nom, d.prenom AS driver_prenom,
              COUNT(ri.id) FILTER (WHERE ri.statut = 'ok')::int AS n_ok,
              COUNT(ri.id) FILTER (WHERE ri.statut = 'ko')::int AS n_ko,
              COUNT(ri.id)::int AS n_total
       FROM checklist_runs r
       JOIN vehicles v ON v.id = r.vehicle_id
       LEFT JOIN drivers d ON d.id = r.driver_id
       LEFT JOIN checklist_run_items ri ON ri.run_id = r.id
       ${req.query.vehicle_id ? 'WHERE r.vehicle_id = $1' : ''}
       GROUP BY r.id, v.immatriculation, d.nom, d.prenom
       ORDER BY r.realise_le DESC`,
      req.query.vehicle_id ? [Number(req.query.vehicle_id)] : []
    ));
  } catch (e) { next(e); }
});

router.get('/runs/:id', requireSubModule('logistique.checklists'), async (req, res, next) => {
  try {
    const detail = await getRunDetail(Number(req.params.id));
    if (!detail) return res.status(404).json({ error: 'Réalisation introuvable.' });
    res.json(detail);
  } catch (e) { next(e); }
});

// Démarre une réalisation : recopie les items du modèle (snapshot) avec le statut « na » par défaut.
router.post('/runs', requireSubModule('logistique.checklists', 'ajout'), async (req, res, next) => {
  const { template_id, vehicle_id, driver_id, mission_id, notes } = req.body || {};
  if (!template_id || !vehicle_id) return res.status(400).json({ error: 'Modèle et véhicule obligatoires.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [tmpl] } = await client.query('SELECT * FROM checklist_templates WHERE id = $1', [Number(template_id)]);
    if (!tmpl) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Modèle introuvable.' }); }
    const { rows: [r] } = await client.query(
      `INSERT INTO checklist_runs (template_id, template_nom, type, vehicle_id, driver_id, mission_id, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [tmpl.id, tmpl.nom, tmpl.type, Number(vehicle_id), driver_id ? Number(driver_id) : null, mission_id ? Number(mission_id) : null, (notes || '').trim() || null, req.user.id]
    );
    const { rows: items } = await client.query('SELECT libelle, ordre FROM checklist_template_items WHERE template_id = $1 ORDER BY ordre', [tmpl.id]);
    for (const it of items) {
      await client.query('INSERT INTO checklist_run_items (run_id, libelle, ordre, statut) VALUES ($1,$2,$3,\'na\')', [r.id, it.libelle, it.ordre]);
    }
    await client.query('COMMIT');
    res.status(201).json(await getRunDetail(r.id));
  } catch (e) { await client.query('ROLLBACK'); next(e); }
  finally { client.release(); }
});

// Enregistre le remplissage : notes + statut/commentaire de chaque item (les photos ont leur propre
// endpoint, car elles s'envoient en multipart dès qu'elles sont choisies).
router.put('/runs/:id', requireSubModule('logistique.checklists', 'ajout'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await one('SELECT id FROM checklist_runs WHERE id = $1', [id]);
    if (!existing) return res.status(404).json({ error: 'Réalisation introuvable.' });
    const { notes, items } = req.body || {};
    if (notes !== undefined) await run('UPDATE checklist_runs SET notes = $1 WHERE id = $2', [(notes || '').trim() || null, id]);
    for (const it of (Array.isArray(items) ? items : [])) {
      if (!it || !it.id) continue;
      const statut = STATUTS.has(it.statut) ? it.statut : 'na';
      await run('UPDATE checklist_run_items SET statut = $1, commentaire = $2 WHERE id = $3 AND run_id = $4',
        [statut, (it.commentaire || '').trim() || null, Number(it.id), id]);
    }
    res.json(await getRunDetail(id));
  } catch (e) { next(e); }
});

router.delete('/runs/:id', requireSubModule('logistique.checklists', 'edition'), async (req, res, next) => {
  try { await run('DELETE FROM checklist_runs WHERE id = $1', [Number(req.params.id)]); res.json({ ok: true }); }
  catch (e) { next(e); }
});

// Photo d'un item de réalisation (preuve). Octets en BYTEA, servis avec authentification.
router.get('/run-items/:id/photo', requireSubModule('logistique.checklists'), async (req, res, next) => {
  try {
    const row = await one('SELECT photo, photo_mime, photo_key FROM checklist_run_items WHERE id = $1', [Number(req.params.id)]);
    if (!row || (!row.photo && !row.photo_key)) return res.status(404).json({ error: 'Aucune photo.' });
    const buf = row.photo_key ? await blob.getBuffer(row.photo_key) : row.photo;
    res.setHeader('Content-Type', row.photo_mime || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.send(buf);
  } catch (e) { next(e); }
});

router.put('/run-items/:id/photo', requireSubModule('logistique.checklists', 'ajout'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Fichier manquant.' });
    if (!ALLOWED_MIME.has(req.file.mimetype)) return res.status(400).json({ error: 'Formats acceptés : PNG ou JPEG.' });
    const key = await blob.putBuffer(req.file.buffer, req.file.mimetype, 'checklists');
    await run('UPDATE checklist_run_items SET photo = $1, photo_key = $2, photo_mime = $3 WHERE id = $4', [key ? null : req.file.buffer, key, req.file.mimetype, Number(req.params.id)]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/run-items/:id/photo', requireSubModule('logistique.checklists', 'ajout'), async (req, res, next) => {
  try { await run('UPDATE checklist_run_items SET photo = NULL, photo_mime = NULL WHERE id = $1', [Number(req.params.id)]); res.json({ ok: true }); }
  catch (e) { next(e); }
});

module.exports = router;
