// Devises gérées dans CCG Flow (source unique). `label` inclut le sigle, pour l'affichage
// dans les listes et cases à cocher ; `symbol` pour un affichage compact éventuel.
export const CURRENCIES = [
  { code: 'GNF', label: 'GNF', symbol: 'GNF' },
  { code: 'USD', label: 'USD ($)', symbol: '$' },
  { code: 'EUR', label: 'EUR (€)', symbol: '€' },
  { code: 'XOF', label: 'FCFA (XOF)', symbol: 'FCFA' },
];
export const CURRENCY_CODES = CURRENCIES.map(c => c.code);
export const currencyLabel = (code) => (CURRENCIES.find(c => c.code === code)?.label || code);
