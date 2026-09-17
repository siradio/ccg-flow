const { one, withTransaction } = require('../../db');
const audit = require('../audit/audit.service');
const { httpError } = require('../../utils/httpError');
const { nextRef } = require('./dsi.numbering');
const repo = require('./dsi.tickets.repository');

const STATUTS = ['ouvert', 'affecte', 'en_cours', 'en_attente', 'resolu', 'cloture', 'annule'];

// ── Calcul SLA (calendaire) ─────────────────────────────────────────────────
function computeSla(t) {
  if (!t.sla_resolution_min && !t.sla_prise_en_charge_min) return null;
  const created = new Date(t.created_at).getTime();
  const now = Date.now();
  const seuil = (t.seuil_risque_pct || 80) / 100;
  const state = (targetMin, doneAt) => {
    if (!targetMin) return null;
    const target = created + targetMin * 60000;
    const ref = doneAt ? new Date(doneAt).getTime() : now;
    let st;
    if (ref > target) st = 'depasse';
    else if (!doneAt && ref >= created + seuil * (target - created)) st = 'a_risque';
    else st = 'respecte';
    return { state: st, remainingMin: Math.round((target - ref) / 60000), targetIso: new Date(target).toISOString(), done: !!doneAt };
  };
  const doneRes = t.resolved_at || t.closed_at;
  return {
    priseEnCharge: state(t.sla_prise_en_charge_min, t.taken_at),
    resolution: state(t.sla_resolution_min, doneRes),
  };
}
function withSla(t) { return t ? { ...t, sla: computeSla(t) } : t; }

async function insertEvent(tx, ticketId, { action, from, to, comment, visibilite = 'interne', userId }) {
  await tx.run(
    `INSERT INTO dsi_ticket_events (ticket_id, action, from_value, to_value, comment, visibilite, user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [ticketId, action, from ?? null, to ?? null, comment ?? null, visibilite, userId]);
}

async function copySla(tx, ticketId, priorityId) {
  if (!priorityId) return;
  const sla = await tx.one('SELECT prise_en_charge_min, resolution_min FROM dsi_sla WHERE priority_id = $1 AND actif = true', [priorityId]);
  if (sla) await tx.run('UPDATE dsi_tickets SET sla_prise_en_charge_min=$2, sla_resolution_min=$3 WHERE id=$1', [ticketId, sla.prise_en_charge_min, sla.resolution_min]);
}

async function resolveEntitySite(user, body) {
  let entityId = body.entity_id || null;
  let siteId = body.site_id || null;
  let businessUnitId = body.business_unit_id || null;
  if ((!entityId || !businessUnitId) && user.employee_id) {
    const emp = await one('SELECT entity_id, site_id, business_unit_id FROM employees WHERE id = $1', [user.employee_id]);
    if (emp) { entityId = entityId || emp.entity_id; siteId = siteId || emp.site_id; businessUnitId = businessUnitId || emp.business_unit_id; }
  }
  return { entityId, siteId, businessUnitId };
}

async function create(user, body, { selfService = false } = {}) {
  const objet = (body.objet || '').trim();
  if (!objet) throw httpError(400, "L'objet est obligatoire.");
  const { entityId, siteId, businessUnitId } = await resolveEntitySite(user, body);
  const priorityId = selfService ? null : (body.priority_id || null);
  const created = await withTransaction(async (tx) => {
    const reference = await nextRef(tx, { scope: 'TICKET', prefix: 'INC' });
    const t = await tx.one(
      `INSERT INTO dsi_tickets
        (reference, demandeur_id, category_id, type_id, priority_id, impact, urgence, equipment_id,
         entity_id, business_unit_id, site_id, objet, description, statut)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'ouvert') RETURNING *`,
      [reference, user.id, body.category_id || null, body.type_id || null, priorityId,
       body.impact || null, body.urgence || null, body.equipment_id || null,
       entityId, businessUnitId, siteId, objet, body.description || null]);
    await copySla(tx, t.id, priorityId);
    await insertEvent(tx, t.id, { action: 'creation', to: 'ouvert', visibilite: 'public', userId: user.id });
    return t;
  });
  await audit.logAction({ tableName: 'dsi_tickets', recordId: created.id, action: 'dsi_ticket_create', userId: user.id, details: { reference: created.reference, selfService } });
  return withSla(await repo.getById(created.id));
}

const UPD_FIELDS = ['category_id', 'type_id', 'impact', 'urgence', 'equipment_id', 'entity_id', 'business_unit_id', 'site_id', 'objet', 'description'];
async function update(user, id, body) {
  const t = await repo.getById(id);
  if (!t) throw httpError(404, 'Ticket introuvable.');
  await withTransaction(async (tx) => {
    const cols = UPD_FIELDS.filter(f => body[f] !== undefined);
    if (cols.length) {
      const vals = cols.map(c => (body[c] === '' ? null : body[c]));
      const setClause = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
      await tx.run(`UPDATE dsi_tickets SET ${setClause}, updated_at=now() WHERE id=$${cols.length + 1}`, [...vals, id]);
    }
    if (body.priority_id !== undefined && String(body.priority_id) !== String(t.priority_id)) {
      await tx.run('UPDATE dsi_tickets SET priority_id=$2, updated_at=now() WHERE id=$1', [id, body.priority_id || null]);
      await copySla(tx, id, body.priority_id || null);
      await insertEvent(tx, id, { action: 'priorite', from: t.priorite_code, to: String(body.priority_id || ''), userId: user.id });
    }
  });
  return withSla(await repo.getById(id));
}

async function assign(user, id, technicianId) {
  const t = await repo.getById(id);
  if (!t) throw httpError(404, 'Ticket introuvable.');
  if (!technicianId) throw httpError(400, 'Technicien requis.');
  await withTransaction(async (tx) => {
    const newStatut = t.statut === 'ouvert' ? 'affecte' : t.statut;
    await tx.run(`UPDATE dsi_tickets SET technician_id=$2, statut=$3, assigned_at=COALESCE(assigned_at, now()), updated_at=now() WHERE id=$1`, [id, technicianId, newStatut]);
    await insertEvent(tx, id, { action: 'affectation', to: String(technicianId), userId: user.id });
  });
  await audit.logAction({ tableName: 'dsi_tickets', recordId: id, action: 'dsi_ticket_assign', userId: user.id, details: { technician: technicianId } });
  return withSla(await repo.getById(id));
}

async function setStatus(user, id, statut, comment) {
  const t = await repo.getById(id);
  if (!t) throw httpError(404, 'Ticket introuvable.');
  if (!STATUTS.includes(statut)) throw httpError(400, 'Statut invalide.');
  const reopen = ['resolu', 'cloture'].includes(t.statut) && ['en_cours', 'affecte', 'ouvert'].includes(statut);
  await withTransaction(async (tx) => {
    const sets = ['statut=$2', 'updated_at=now()'];
    if (statut === 'en_cours' && !t.taken_at) sets.push('taken_at=now()');
    if (statut === 'resolu') sets.push('resolved_at=now()');
    if (statut === 'cloture') sets.push('closed_at=now()');
    if (reopen) sets.push('resolved_at=NULL', 'closed_at=NULL');
    await tx.run(`UPDATE dsi_tickets SET ${sets.join(', ')} WHERE id=$1`, [id, statut]);
    const action = statut === 'resolu' ? 'resolution' : statut === 'cloture' ? 'cloture' : reopen ? 'reouverture' : 'statut';
    await insertEvent(tx, id, { action, from: t.statut, to: statut, comment: comment || null, visibilite: 'public', userId: user.id });
  });
  await audit.logAction({ tableName: 'dsi_tickets', recordId: id, action: 'dsi_ticket_status', userId: user.id, details: { from: t.statut, to: statut } });
  return withSla(await repo.getById(id));
}

async function comment(user, id, text, visibilite = 'interne') {
  const t = await repo.getById(id);
  if (!t) throw httpError(404, 'Ticket introuvable.');
  if (!(text || '').trim()) throw httpError(400, 'Commentaire vide.');
  await withTransaction(async (tx) => {
    await insertEvent(tx, id, { action: 'commentaire', comment: text.trim(), visibilite, userId: user.id });
  });
  return withSla(await repo.getById(id));
}

module.exports = { create, update, assign, setStatus, comment, computeSla, withSla };
