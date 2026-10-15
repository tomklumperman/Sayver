import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

export const CRYPTO_BRANDS = {
  ethereum: { name: 'Ethereum', accent: '#627EEA' },
  base: { name: 'Base', accent: '#0052FF' },
  solana: { name: 'Solana', accent: '#9945FF' },
  bitcoin: { name: 'Bitcoin', accent: '#F7931A' },
  coinbase: { name: 'Coinbase', accent: '#0052FF' },
};

export function getCryptoBrandKey(account) {
  if (account?.source === 'exchange' && account?.provider === 'coinbase') return 'coinbase';
  const networkAliases = {
    ethereum: 'ethereum',
    eth: 'ethereum',
    'eth-mainnet': 'ethereum',
    'ethereum-mainnet': 'ethereum',
    sol: 'solana',
    solana: 'solana',
    'solana-mainnet': 'solana',
    base: 'base',
    'base-mainnet': 'base',
    btc: 'bitcoin',
    bitcoin: 'bitcoin',
  };
  for (const value of [account?.network, account?.networkName]) {
    const normalized = String(value || '').trim().toLowerCase().replace(/\s+/g, '-');
    const brand = networkAliases[normalized];
    if (brand) return brand;
  }
  return null;
}

export default function CryptoBrandLogo({ brand, size = 28, inverted = false }) {
  if (brand === 'ethereum') {
    return <MaterialCommunityIcons name="ethereum" size={size} color={inverted ? '#ffffff' : CRYPTO_BRANDS.ethereum.accent} accessibilityLabel="Ethereum" />;
  }
  if (brand === 'bitcoin') {
    return <MaterialCommunityIcons name="bitcoin" size={size} color={CRYPTO_BRANDS.bitcoin.accent} accessibilityLabel="Bitcoin" />;
  }
  if (brand === 'solana') {
    return (
      <Svg width={size} height={size * 0.78} viewBox="0 0 398 312" accessibilityLabel="Solana">
        <Defs>
          <LinearGradient id="solanaGradient" x1="360" y1="-37" x2="141" y2="383" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#00FFA3" />
            <Stop offset="1" stopColor="#DC1FFF" />
          </LinearGradient>
        </Defs>
        <Path fill="url(#solanaGradient)" d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1l62.7-62.7z" />
        <Path fill="url(#solanaGradient)" d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z" />
        <Path fill="url(#solanaGradient)" d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z" />
      </Svg>
    );
  }
  if (brand === 'base') {
    return (
      <Svg width={size} height={size} viewBox="0 0 111 111" accessibilityLabel="Base">
        <Path
          fill="#0052FF"
          d="M54.921 110.034C85.359 110.034 110.034 85.402 110.034 55.017C110.034 24.6319 85.359 0 54.921 0C26.0432 0 2.35281 22.1714 0 50.3923H72.8467V59.6416H0C2.35281 87.8625 26.0432 110.034 54.921 110.034Z"
        />
      </Svg>
    );
  }
  if (brand === 'coinbase') {
    const background = inverted ? '#ffffff' : '#0052FF';
    const mark = inverted ? '#0052FF' : '#ffffff';
    return (
      <Svg width={size} height={size} viewBox="0 0 1024 1024" accessibilityLabel="Coinbase">
        <Circle cx="512" cy="512" r="512" fill={background} />
        <Path
          fill={mark}
          d="M512.147 692C412.697 692 332.146 611.45 332.146 512C332.146 412.55 412.697 332 512.147 332C601.247 332 675.197 396.95 689.447 482H870.797C855.497 297.2 700.846 152 512.147 152C313.396 152 152.146 313.25 152.146 512C152.146 710.75 313.396 872 512.147 872C700.846 872 855.497 726.8 870.797 542H689.297C675.047 627.05 601.247 692 512.147 692Z"
        />
      </Svg>
    );
  }
  return <MaterialCommunityIcons name="wallet-outline" size={size} color="#0f5132" accessibilityLabel="Wallet" />;
}
