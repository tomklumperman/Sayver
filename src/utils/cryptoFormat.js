function getNumberSeparators() {
  try {
    const sample = (1234.5).toLocaleString();
    const match = sample.match(/^1(\D?)234(\D)5$/);
    if (match) return { group: match[1], decimal: match[2] };
  } catch (_error) {}
  return { group: ',', decimal: '.' };
}

// String-based so arbitrary-precision token amounts are never rounded through Number.
export function formatCryptoQuantity(value) {
  const quantity = String(value ?? '');
  const match = quantity.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) return quantity;

  const [, sign, integerPart, fractionalPart = ''] = match;
  const { group, decimal } = getNumberSeparators();
  const groupedInteger = `${sign}${integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, group)}`;
  return fractionalPart ? `${groupedInteger}${decimal}${fractionalPart}` : groupedInteger;
}
