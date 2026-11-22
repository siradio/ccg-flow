import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../../api/client';
import QhseSubnav from './QhseSubnav';
import { useI18n } from '../../i18n/I18nContext';

// Taux de conformité = conformes / (conformes + non conformes), les « en attente / sans spec » étant
// exclus du dénominateur (on ne statue pas sur un verdict non rendu).
function tauxConformite(map) {
  const ok = map.conforme || 0;
  const ko = map.non_conforme || 0;
  if (ok + ko === 0) return null;
  return Math.round((ok / (ok + ko)) * 100);
}

function Tile({ label, value, hint, tone }) {
  const color = tone === 'bad' ? 'var(--status-red-fg, #b4232e)' : tone === 'warn' ? 'var(--status-amber-fg, #b5760a)' : tone === 'good' ? 'var(--status-green-fg, #15803d)' : 'var(--color-text)';
  return (
    <div className="card" style={{ flex: '1 1 160px', minWidth: 150 }}>
      <div className="muted" style={{ fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
      {hint && <div className="muted" style={{ fontSize: 12 }}>{hint}</div>}
    </div>
  );
}

export default function QhseDashboard() {
  const { t } = useI18n();
  const [d, setD] = useState(null);

  useEffect(() => { client.get('/qhse/dashboard').then(r => setD(r.data)).catch(() => {}); }, []);

  if (!d) return <div><QhseSubnav /><p style={{ padding: 16 }}>{t('common.loading') || '…'}</p></div>;
  const tAna = tauxConformite(d.analyses.parConformite);
  const tProd = tauxConformite(d.production.parConformite);
  const tExp = tauxConformite(d.expeditions.parConformite);
  const lotsEntries = Object.entries(d.lots || {});

  return (
    <div>
      <QhseSubnav />
      <h1 className="page-title">{t('qhse.dash.title')}</h1>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <Tile label={t('qhse.dash.analyses')} value={d.analyses.total}
          hint={tAna == null ? t('qhse.dash.noVerdict') : `${tAna}% ${t('qhse.dash.conformes')}`}
          tone={tAna == null ? null : tAna >= 90 ? 'good' : tAna >= 70 ? 'warn' : 'bad'} />
        <Tile label={t('qhse.dash.production')} value={d.production.total}
          hint={tProd == null ? '—' : `${tProd}% ${t('qhse.dash.conformes')}`}
          tone={tProd == null ? null : tProd >= 90 ? 'good' : 'warn'} />
        <Tile label={t('qhse.dash.expeditions')} value={d.expeditions.total}
          hint={tExp == null ? '—' : `${tExp}% ${t('qhse.dash.conformes')}`}
          tone={tExp == null ? null : tExp >= 90 ? 'good' : 'warn'} />
        <Tile label={t('qhse.dash.ncOuvertes')} value={d.nc.ouvertes}
          hint={`${d.nc.total} ${t('qhse.dash.total')}`} tone={d.nc.ouvertes > 0 ? 'warn' : 'good'} />
        <Tile label={t('qhse.dash.capaRetard')} value={d.capaRetard.length}
          tone={d.capaRetard.length > 0 ? 'bad' : 'good'} />
      </div>

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        {/* Non-conformités ouvertes */}
        <div style={{ flex: '1 1 380px' }}>
          <h3>{t('qhse.dash.ncOuvertes')}</h3>
          <div className="table-wrap"><table><thead><tr>
            <th>N°</th><th>{t('qhse.nc.date')}</th><th>{t('qhse.nc.gravite')}</th><th>{t('qhse.ana.statut')}</th>
          </tr></thead><tbody>
            {d.ncOuvertes.map(n => (
              <tr key={n.id}>
                <td><Link to={`/qhse/non-conformites/${n.id}`}>{n.numero}</Link></td>
                <td>{n.date_detection || '—'}</td>
                <td>{n.severity_libelle || '—'}</td>
                <td>{t('qhse.ncstatut.' + n.statut)}</td>
              </tr>
            ))}
            {d.ncOuvertes.length === 0 && <tr><td colSpan={4} className="empty-row">{t('qhse.dash.rien')}</td></tr>}
          </tbody></table></div>
        </div>

        {/* Actions CAPA en retard */}
        <div style={{ flex: '1 1 380px' }}>
          <h3>{t('qhse.dash.capaRetard')}</h3>
          <div className="table-wrap"><table><thead><tr>
            <th>NC</th><th>{t('qhse.nc.action')}</th><th>{t('qhse.nc.responsable')}</th><th>{t('qhse.nc.echeance')}</th>
          </tr></thead><tbody>
            {d.capaRetard.map(a => (
              <tr key={a.id}>
                <td><Link to={`/qhse/non-conformites/${a.nc_id}`}>{a.nc_numero}</Link></td>
                <td>{a.description || '—'}</td>
                <td>{a.responsable || '—'}</td>
                <td style={{ color: 'var(--status-red-fg, #b4232e)' }}>{a.echeance}</td>
              </tr>
            ))}
            {d.capaRetard.length === 0 && <tr><td colSpan={4} className="empty-row">{t('qhse.dash.rien')}</td></tr>}
          </tbody></table></div>
        </div>
      </div>

      {/* Lots sous statut qualité */}
      <h3 style={{ marginTop: 18 }}>{t('qhse.dash.lots')}</h3>
      {lotsEntries.length === 0
        ? <p className="muted">{t('qhse.dash.rien')}</p>
        : <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {lotsEntries.map(([k, n]) => <Tile key={k} label={t('qhse.dec.' + k).startsWith('qhse.') ? k : t('qhse.dec.' + k)} value={n} />)}
          </div>}
    </div>
  );
}
