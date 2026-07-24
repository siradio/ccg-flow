function errorHandler(err, req, res, next) {
  if (!err.status || err.status >= 500) console.error(err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: err.publicMessage || 'Erreur serveur.' });
}

module.exports = { errorHandler };
