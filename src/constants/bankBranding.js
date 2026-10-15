const BANK_BRANDING_MAP = {
  ing: {
    displayName: 'ING',
    primaryColor: '#ff6200',
    secondaryColor: '#ffb066',
    iconName: 'business-outline',
    gradientColors: ['#fff4e8', '#ff8a3d'],
    aliases: ['ing bank'],
  },
  rabobank: {
    displayName: 'Rabobank',
    primaryColor: '#0057b8',
    secondaryColor: '#ff8a3d',
    iconName: 'business-outline',
    gradientColors: ['#e8f1ff', '#3b82f6'],
    aliases: ['rabo bank', 'rabo'],
  },
  'abn-amro': {
    displayName: 'ABN AMRO',
    primaryColor: '#f4b400',
    secondaryColor: '#7c3aed',
    iconName: 'business-outline',
    gradientColors: ['#fff8db', '#f59e0b'],
    aliases: ['abn amro bank'],
  },
  bunq: {
    displayName: 'bunq',
    primaryColor: '#00a86b',
    secondaryColor: '#8ce99a',
    iconName: 'business-outline',
    gradientColors: ['#ecfdf5', '#10b981'],
    aliases: [],
  },
  'asn-bank': {
    displayName: 'ASN Bank',
    primaryColor: '#1f7a3f',
    secondaryColor: '#86efac',
    iconName: 'business-outline',
    gradientColors: ['#edfdf3', '#22c55e'],
    aliases: ['asn'],
  },
  sns: {
    displayName: 'SNS',
    primaryColor: '#f97316',
    secondaryColor: '#fdba74',
    iconName: 'business-outline',
    gradientColors: ['#fff1e6', '#fb923c'],
    aliases: ['sns bank'],
  },
  'regiobank': {
    displayName: 'RegioBank',
    primaryColor: '#2f855a',
    secondaryColor: '#86efac',
    iconName: 'business-outline',
    gradientColors: ['#effdf5', '#22c55e'],
    aliases: ['regio bank'],
  },
  triodos: {
    displayName: 'Triodos',
    primaryColor: '#1f6b4d',
    secondaryColor: '#8bd3a4',
    iconName: 'business-outline',
    gradientColors: ['#eefcf5', '#10b981'],
    aliases: ['triodos bank'],
  },
  revolut: {
    displayName: 'Revolut',
    primaryColor: '#2962ff',
    secondaryColor: '#8ab4ff',
    iconName: 'business-outline',
    gradientColors: ['#eef4ff', '#3b82f6'],
    aliases: [],
  },
  n26: {
    displayName: 'N26',
    primaryColor: '#0f172a',
    secondaryColor: '#94a3b8',
    iconName: 'business-outline',
    gradientColors: ['#e5e7eb', '#334155'],
    aliases: [],
  },
  'deutsche-bank': {
    displayName: 'Deutsche Bank',
    primaryColor: '#0f4c81',
    secondaryColor: '#60a5fa',
    iconName: 'business-outline',
    gradientColors: ['#e8f1fb', '#2563eb'],
    aliases: ['deutsche bank ag'],
  },
  barclays: {
    displayName: 'Barclays',
    primaryColor: '#003d7a',
    secondaryColor: '#93c5fd',
    iconName: 'business-outline',
    gradientColors: ['#e8f2ff', '#1d4ed8'],
    aliases: [],
  },
  hsbc: {
    displayName: 'HSBC',
    primaryColor: '#db0011',
    secondaryColor: '#fda4af',
    iconName: 'business-outline',
    gradientColors: ['#fff1f2', '#ef4444'],
    aliases: ['hsbc uk'],
  },
  lloyds: {
    displayName: 'Lloyds',
    primaryColor: '#0a6c3d',
    secondaryColor: '#86efac',
    iconName: 'business-outline',
    gradientColors: ['#eefcf5', '#16a34a'],
    aliases: ['lloyds bank'],
  },
};

const DEFAULT_BANK_BRANDING = {
  displayName: 'Bank',
  primaryColor: '#2563eb',
  secondaryColor: '#93c5fd',
  iconName: 'business-outline',
  gradientColors: ['#eff6ff', '#60a5fa'],
  aliases: [],
};

function normalizeBankKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getBankBranding(bankName) {
  const normalized = normalizeBankKey(bankName);
  const exactMatch = BANK_BRANDING_MAP[normalized];
  if (exactMatch) {
    return exactMatch;
  }

  const aliasMatch = Object.values(BANK_BRANDING_MAP).find((entry) => {
    const aliases = Array.isArray(entry.aliases) ? entry.aliases : [];
    return aliases.some((alias) => normalizeBankKey(alias) === normalized);
  });

  if (aliasMatch) {
    return aliasMatch;
  }

  return {
    ...DEFAULT_BANK_BRANDING,
    displayName: String(bankName || '').trim() || DEFAULT_BANK_BRANDING.displayName,
  };
}

export { BANK_BRANDING_MAP, DEFAULT_BANK_BRANDING, getBankBranding };
