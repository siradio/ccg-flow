// Numérotation séquentielle annuelle des objets DSI (INC-2026-000123, PRJ-…, RSK-…).
// Compteur atomique par (scope, année) dans dsi_counters : UPDATE ... RETURNING sous verrou de
// ligne (transaction), sans course entre requêtes concurrentes. À appeler DANS une transaction
// existante en passant le `tx` de withTransaction (le numéro et l'objet sont ainsi cohérents).
async function nextRef(tx, { scope, prefix, year = new Date().getFullYear(), pad = 6 }) {
  // upsert du compteur puis incrément atomique.
  await tx.run(
    `INSERT INTO dsi_counters (scope, annee, last_value) VALUES ($1, $2, 0)
     ON CONFLICT (scope, annee) DO NOTHING`,
    [scope, year]
  );
  const row = await tx.one(
    `UPDATE dsi_counters SET last_value = last_value + 1
     WHERE scope = $1 AND annee = $2 RETURNING last_value`,
    [scope, year]
  );
  const seq = row.last_value;
  return `${prefix}-${year}-${String(seq).padStart(pad, '0')}`;
}

module.exports = { nextRef };
