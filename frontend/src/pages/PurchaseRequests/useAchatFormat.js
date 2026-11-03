import { useEffect, useState } from 'react';
import client from '../../api/client';

// Nombre de décimales du module Achat — paramétrable (app_settings.achats_decimales, défaut 4,
// borné 0→8 par la capacité de la base, cf. migration 105). Fournit un formateur de montant et le
// pas des champs numériques cohérents avec ce réglage, pour éviter toute valeur codée en dur.
export function useAchatFormat() {
  const [decimals, setDecimals] = useState(4);
  useEffect(() => {
    client.get('/settings')
      .then(r => { const n = Number(r.data.achats_decimales); if (Number.isInteger(n) && n >= 0 && n <= 8) setDecimals(n); })
      .catch(() => {});
  }, []);
  const money = (n) => (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: decimals });
  const step = decimals > 0 ? `0.${'0'.repeat(decimals - 1)}1` : '1';
  return { decimals, money, step };
}
