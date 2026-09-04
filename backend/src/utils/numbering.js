function formatRequestNumber(entityCode, id, date = new Date()) {
  return `DA-${entityCode}-${date.getFullYear()}-${String(id).padStart(4, '0')}`;
}

function formatOrderNumber(entityCode, id, date = new Date()) {
  return `BC-${entityCode}-${date.getFullYear()}-${String(id).padStart(4, '0')}`;
}

// Demandes RH : préfixe par type (ABS/CNG/REC/CDI), ex. ABS-CCG-2026-0007.
function formatRhNumber(prefix, entityCode, id, date = new Date()) {
  return `${prefix}-${entityCode}-${date.getFullYear()}-${String(id).padStart(4, '0')}`;
}

module.exports = { formatRequestNumber, formatOrderNumber, formatRhNumber };
