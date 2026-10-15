const CURRENCY_RATES = { EUR: 1, USD: 1.09, GBP: 0.86 };
const CURRENCY_SYMBOLS = { EUR: '€', USD: '$', GBP: '£' };

export const ACCOUNT_COLOR_PALETTE = [
  '#FFD8A8', // pastel orange
  '#FFABAB', // pastel red
  '#FFF9C4', // pastel yellow
  '#C8E6C9', // pastel green
  '#B3E5FC', // pastel blue
  '#D1C4E9', // pastel purple
  '#F8BBD0', // pastel pink
  '#D7CCC8', // pastel brown
  '#CFD8DC', // pastel grey
  '#000000', // black
  '#546E7A', // dark grey
  '#5D4037', // dark brown
];

export const DEFAULT_ACCOUNT_COLORS = {
  Bank: '#FFD8A8',
  Cash: '#CDECCF',
  Investment: '#C8E6C9',
  Crypto: '#FFF9C4',
  Savings: '#CFD8DC',
};

export function getReadableTextColor(hex) {
  if (!hex) return '#0f172a';
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.55 ? '#ffffff' : '#0f172a';
}

export function formatCurrency(value, currency) {
  const rate = CURRENCY_RATES[currency] || 1;
  const symbol = CURRENCY_SYMBOLS[currency] || '$';
  const converted = (Number(value) || 0) * rate;
  return `${symbol}${converted.toFixed(2)}`;
}
