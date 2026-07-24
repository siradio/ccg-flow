function formatRequestNumber(entityCode, id, date = new Date()) {
  return `DA-${entityCode}-${date.getFullYear()}-${String(id).padStart(4, '0')}`;
}

function formatOrderNumber(entityCode, id, date = new Date()) {
  return `BC-${entityCode}-${date.getFullYear()}-${String(id).padStart(4, '0')}`;
}

module.exports = { formatRequestNumber, formatOrderNumber };
