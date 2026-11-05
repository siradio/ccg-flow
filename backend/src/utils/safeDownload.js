// Durcissement du service de fichiers uploadés (pièces jointes) contre le XSS stocké.
// Problème : un fichier dont le type est `text/html` ou `image/svg+xml`, servi avec ce type et
// `inline`, s'exécute dans l'origine de l'application quand un autre utilisateur l'ouvre.
// Parade : seuls des types sûrs (PDF, images bitmap) sont servis tels quels et en `inline` ; tout
// autre type est forcé en `application/octet-stream` + `attachment` (téléchargement, jamais rendu),
// et on ajoute `X-Content-Type-Options: nosniff` pour empêcher le navigateur de deviner le type.
const SAFE_INLINE = new Set([
  'application/pdf',
  'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp',
]);

// Pose les en-têtes de réponse sûrs pour servir une pièce jointe. `filename` est encodé.
function setSafeDownloadHeaders(res, mimetype, filename) {
  const mt = String(mimetype || '').toLowerCase();
  const safe = SAFE_INLINE.has(mt);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', safe ? mimetype : 'application/octet-stream');
  res.setHeader('Content-Disposition', `${safe ? 'inline' : 'attachment'}; filename="${encodeURIComponent(filename || 'fichier')}"`);
}

module.exports = { SAFE_INLINE, setSafeDownloadHeaders };
