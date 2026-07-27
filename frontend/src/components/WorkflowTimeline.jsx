const STATUS_TO_MIN_ORDRE = {
  brouillon: 0,
  en_attente_validation_besoin: 1,
  soumise: 2,
  en_analyse_achat: 3,
  devis_en_cours: 4,
  devis_selectionne: 5,
  en_validation: null, // résolu via current_step_code
  validee: 10,
  bon_commande_genere: 10,
  rejetee: null,
};

export default function WorkflowTimeline({ pr, steps }) {
  if (!steps?.length) return null;
  const sorted = [...steps].sort((a, b) => a.ordre - b.ordre);

  let currentOrdre;
  if (pr.status === 'en_validation' || pr.status === 'rejetee') {
    const cs = sorted.find(s => s.code === pr.current_step_code);
    currentOrdre = cs ? cs.ordre : sorted[sorted.length - 1].ordre + 1;
  } else {
    currentOrdre = STATUS_TO_MIN_ORDRE[pr.status] ?? 0;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {pr.status === 'rejetee' && (
        <div className="alert alert-danger" style={{ marginBottom: 8 }}>
          Demande refusée définitivement.
        </div>
      )}
      {sorted.map(step => {
        const approval = [...(pr.approvals || [])].reverse().find(a => a.step_code === step.code);
        let state = 'pending';
        if (step.ordre < currentOrdre) state = 'done';
        else if (step.ordre === currentOrdre) state = 'current';
        if (approval?.statut === 'refusee' && step.ordre === currentOrdre - 0 && pr.status !== 'bon_commande_genere') {
          // laissé tel quel : "done" prime visuellement une fois revalidé, le refus reste visible dans l'historique
        }
        const colors = {
          done: { bg: '#dcfce7', fg: '#166534', label: '✓' },
          current: { bg: '#dbeafe', fg: '#1e40af', label: '●' },
          pending: { bg: '#f3f4f6', fg: '#6b7280', label: '○' },
        }[state];
        return (
          <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 24, height: 24, borderRadius: '50%', background: colors.bg, color: colors.fg, fontSize: 13,
            }}>{colors.label}</span>
            <span style={{ fontWeight: state === 'current' ? 600 : 400 }}>{step.nom}</span>
            {approval?.statut === 'refusee' && (
              <span style={{ color: 'var(--color-danger)', fontSize: 12 }}>— refusé précédemment : {approval.commentaire}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
