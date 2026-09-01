import { useI18n } from '../i18n/I18nContext';

const STATUS_TO_MIN_ORDRE = {
  brouillon: 0,
  // Depuis la migration 054, l'ordre est : 1 = Soumission par le demandeur, 2 = Validation de
  // l'expression de besoin, 3 = Analyse par le service achat, etc.
  en_attente_validation_besoin: 2,
  soumise: 3,
  en_analyse_achat: 3,
  devis_en_cours: 4,
  devis_selectionne: 5,
  en_validation: null, // résolu via current_step_code
  validee: 10,
  bon_commande_genere: 10,
  rejetee: null,
};

export default function WorkflowTimeline({ pr, steps }) {
  const { t } = useI18n();
  if (!steps?.length) return null;
  const sorted = [...steps].sort((a, b) => a.ordre - b.ordre);

  let currentOrdre;
  if (pr.status === 'en_validation' || pr.status === 'en_validation_dga' || pr.status === 'rejetee') {
    // en_validation_dga : current_step_code vaut 'validation_dga' (étape finale, après generation_bc,
    // qui apparaît donc « faite » = BC généré, la DGA étant l'étape courante).
    const cs = sorted.find(s => s.code === pr.current_step_code);
    currentOrdre = cs ? cs.ordre : sorted[sorted.length - 1].ordre + 1;
  } else {
    currentOrdre = STATUS_TO_MIN_ORDRE[pr.status] ?? 0;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {pr.status === 'rejetee' && (
        <div className="alert alert-danger" style={{ marginBottom: 8 }}>
          {t('prd.rejectedFinal')}
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
          done: { bg: 'var(--status-green-bg)', fg: 'var(--status-green-fg)', label: '✓' },
          current: { bg: 'var(--status-blue-bg)', fg: 'var(--status-blue-fg)', label: '●' },
          pending: { bg: 'var(--status-neutral-bg)', fg: 'var(--color-text-muted)', label: '○' },
        }[state];
        return (
          <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 24, height: 24, borderRadius: '50%', background: colors.bg, color: colors.fg, fontSize: 13,
            }}>{colors.label}</span>
            <span style={{ fontWeight: state === 'current' ? 600 : 400 }}>{step.nom}</span>
            {approval?.statut === 'refusee' && (
              <span style={{ color: 'var(--color-danger)', fontSize: 12 }}>— {t('prd.rejectedBefore', { comment: approval.commentaire })}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
