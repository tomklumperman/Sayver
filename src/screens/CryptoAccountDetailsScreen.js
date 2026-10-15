import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { getAuth } from 'firebase/auth';
import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import CryptoBrandLogo, { CRYPTO_BRANDS, getCryptoBrandKey } from '../components/CryptoBrandLogo';
import { formatCurrency } from '../constants/colors';
import { subscribeToUserDocument } from '../firebase/firestore';
import { subscribeToCryptoAccount } from '../services/cryptoAccounts';
import { getBalanceKey, valueCryptoAccountUsd } from '../services/cryptoPrices';
import { getExchangeRate } from '../services/currency';
import { formatCryptoQuantity } from '../utils/cryptoFormat';

const SMALL_BALANCE_USD = 1;

function buildCryptoHoldings(balances, valuation, accent) {
  const priced = balances.map((balance) => ({
    ...balance,
    key: getBalanceKey(balance),
    value: valuation?.tokens?.[getBalanceKey(balance)]?.usdValue,
  })).filter((holding) => Number.isFinite(holding.value) && holding.value > 0)
    .sort((left, right) => right.value - left.value);
  const total = priced.reduce((sum, holding) => sum + holding.value, 0);
  if (!Number.isFinite(total) || total <= 0) return [];
  let offset = 0;
  return priced.map((holding, index) => {
    const tint = priced.length > 1 ? (index / (priced.length - 1)) * 0.7 : 0;
    const color = `#${[1, 3, 5].map((start) => {
      const channel = parseInt(accent.slice(start, start + 2), 16);
      return Math.round(channel + (255 - channel) * tint).toString(16).padStart(2, '0');
    }).join('')}`;
    const percentage = holding.value / total;
    const segment = { ...holding, color, percentage, offset };
    offset += percentage * 2 * Math.PI * 52;
    return segment;
  });
}

const COPY = {
  en: { address: 'Public address', copy: 'Copy address', copied: 'Address copied', balances: 'Token balances', lastSynced: 'Last synced', never: 'Never', syncFailed: 'Last sync failed', loading: 'Loading wallet…', empty: 'No non-zero token balances.', error: 'Could not copy address.', totalValue: 'Total value', valueLoading: 'Calculating value…', valueUnavailable: 'Value unavailable', hideSmall: 'Hide small balances', hideSmallHint: 'Hides tokens worth less than $1 or without a price.', allHidden: 'All tokens are hidden by the small balance filter.', noPrice: 'No price available', unpriced: (count) => `${count} ${count === 1 ? 'token has' : 'tokens have'} no price and ${count === 1 ? 'is' : 'are'} not included in the total.`, exchangeAccount: 'Coinbase account', wallet: 'wallet' },
  nl: { address: 'Openbaar adres', copy: 'Adres kopiëren', copied: 'Adres gekopieerd', balances: 'Tokensaldi', lastSynced: 'Laatst gesynchroniseerd', never: 'Nooit', syncFailed: 'Laatste synchronisatie mislukt', loading: 'Wallet laden…', empty: 'Geen tokens met saldo.', error: 'Adres kopiëren mislukt.', totalValue: 'Totale waarde', valueLoading: 'Waarde berekenen…', valueUnavailable: 'Waarde niet beschikbaar', hideSmall: 'Kleine saldi verbergen', hideSmallHint: 'Verbergt tokens met een waarde onder $1 of zonder prijs.', allHidden: 'Alle tokens zijn verborgen door het filter voor kleine saldi.', noPrice: 'Geen prijs beschikbaar', unpriced: (count) => `${count} ${count === 1 ? 'token heeft' : 'tokens hebben'} geen prijs en ${count === 1 ? 'telt' : 'tellen'} niet mee in het totaal.`, exchangeAccount: 'Coinbase-account', wallet: 'wallet' },
};

function formatLastSynced(value, strings, language) {
  if (!value?.toDate) return strings.never;
  return value.toDate().toLocaleString(language === 'nl' ? 'nl-NL' : 'en-GB');
}

export default function CryptoAccountDetailsScreen({ route }) {
  const { accountId, language = 'en' } = route.params || {};
  const userId = getAuth().currentUser?.uid;
  const [account, setAccount] = useState(null);
  const [currency, setCurrency] = useState('EUR');
  const [valuation, setValuation] = useState(undefined);
  const [usdToEur, setUsdToEur] = useState(null);
  const [hideSmallBalances, setHideSmallBalances] = useState(false);
  const strings = COPY[language] || COPY.en;

  useEffect(() => {
    if (!userId || !accountId) return undefined;
    return subscribeToCryptoAccount(userId, accountId, setAccount);
  }, [userId, accountId]);

  useEffect(() => {
    if (!userId) return undefined;
    return subscribeToUserDocument(userId, (snapshot) => {
      setCurrency(snapshot.data()?.currencyPreference || 'EUR');
    });
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    if (!account) return undefined;
    (async () => {
      try {
        const [result, rate] = await Promise.all([
          valueCryptoAccountUsd(account),
          getExchangeRate('USD', 'EUR').catch(() => null),
        ]);
        if (!cancelled) {
          setValuation(result);
          setUsdToEur(rate);
        }
      } catch (_error) {
        if (!cancelled) setValuation(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [account]);

  const balances = useMemo(() => (Array.isArray(account?.balances) ? account.balances : []), [account]);
  const visibleBalances = useMemo(() => {
    if (!hideSmallBalances) return balances;
    return balances.filter((balance) => {
      const usdValue = valuation?.tokens?.[getBalanceKey(balance)]?.usdValue;
      return typeof usdValue === 'number' && usdValue >= SMALL_BALANCE_USD;
    });
  }, [balances, hideSmallBalances, valuation]);

  // formatCurrency expects EUR-based amounts and applies the user's display currency itself.
  const formatUsd = (usdValue) => (usdToEur ? formatCurrency(usdValue * usdToEur, currency) : null);
  const brandKey = getCryptoBrandKey(account);
  const brand = CRYPTO_BRANDS[brandKey];
  const accent = brand?.accent || '#0f5132';
  const isCoinbase = brandKey === 'coinbase';
  const holdings = buildCryptoHoldings(balances, valuation, accent);
  const holdingsByKey = Object.fromEntries(holdings.map((holding) => [holding.key, holding]));
  const displayBalances = [...visibleBalances].sort((left, right) => (
    (holdingsByKey[getBalanceKey(right)]?.value || 0) - (holdingsByKey[getBalanceKey(left)]?.value || 0)
  ));
  const totalText = valuation === undefined
    ? strings.valueLoading
    : valuation?.pricedCount > 0 && usdToEur
      ? formatUsd(valuation.totalUsd)
      : strings.valueUnavailable;
  const hasTotal = valuation?.pricedCount > 0 && Boolean(usdToEur);

  const handleCopyAddress = async () => {
    if (!account?.publicAddress) return;
    try {
      await Clipboard.setStringAsync(account.publicAddress);
      Alert.alert(strings.copied);
    } catch (_error) {
      Alert.alert(strings.error);
    }
  };

  if (!account) {
    return (
      <View style={styles.loadingScreen}>
        <Text style={styles.loadingText}>{strings.loading}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.walletCard}>
        <View style={[styles.walletAccent, { backgroundColor: accent }]} />
        <View style={[styles.walletHeader, isCoinbase ? styles.coinbaseHeader : null]}>
          <View style={styles.walletLogo}>
            <CryptoBrandLogo brand={brandKey} size={34} inverted={isCoinbase} />
          </View>
          <Text style={[styles.walletName, isCoinbase ? styles.coinbaseHeaderText : null]}>{account.source === 'exchange' ? (account.networkName || brand?.name || account.provider) : `${account.networkName || brand?.name} ${strings.wallet}`}</Text>
        </View>
        <Text style={styles.sectionTitle}>{strings.totalValue}</Text>
        <Text style={[styles.totalValue, hasTotal ? null : styles.totalValueMuted]}>{totalText}</Text>
        {valuation?.unpricedCount > 0 ? <Text style={styles.unpricedNote}>{strings.unpriced(valuation.unpricedCount)}</Text> : null}
        {account.publicAddress ? (
          <>
            <Text style={styles.sectionTitle}>{strings.address}</Text>
            <Text selectable style={styles.address}>{account.publicAddress}</Text>
            <TouchableOpacity style={[styles.copyButton, { backgroundColor: accent }]} onPress={handleCopyAddress}>
              <Ionicons name="copy-outline" size={17} color="#ffffff" />
              <Text style={styles.copyText}>{strings.copy}</Text>
            </TouchableOpacity>
          </>
        ) : null}
        <View style={styles.syncedRow}>
          <Text style={styles.syncedText}>{strings.lastSynced}: {formatLastSynced(account.lastSyncedAt, strings, language)}</Text>
          {account.lastSyncFailed ? <Text style={styles.syncFailed}>{strings.syncFailed}</Text> : null}
        </View>
      </View>

      <Text style={styles.sectionHeading}>{strings.balances}</Text>
      {holdings.length > 0 ? (
        <View style={styles.holdingsChart} accessible accessibilityLabel={language === 'nl' ? 'Verdeling van geprijsde tokens' : 'Priced token allocation'}>
          <Svg width={152} height={152} viewBox="0 0 152 152">
            <G rotation={-90} originX={76} originY={76}>
              {holdings.map((holding) => {
                const circumference = 2 * Math.PI * 52;
                const arcLength = holding.percentage * circumference;
                return (
                  <Circle
                    key={holding.key}
                    cx={76}
                    cy={76}
                    r={52}
                    fill="none"
                    stroke={holding.color}
                    strokeWidth={24}
                    strokeDasharray={`${arcLength} ${circumference - arcLength}`}
                    strokeDashoffset={-holding.offset}
                  />
                );
              })}
            </G>
          </Svg>
        </View>
      ) : null}
      <View style={styles.filterRow}>
        <View style={styles.filterLabelWrap}>
          <Text style={styles.filterLabel}>{strings.hideSmall}</Text>
          <Text style={styles.filterHint}>{strings.hideSmallHint}</Text>
        </View>
        <Switch
          value={hideSmallBalances}
          onValueChange={setHideSmallBalances}
          accessibilityLabel={strings.hideSmall}
          trackColor={{ true: accent }}
        />
      </View>
      {balances.length === 0 ? (
        <Text style={styles.emptyText}>{strings.empty}</Text>
      ) : visibleBalances.length === 0 ? (
        <Text style={styles.emptyText}>{strings.allHidden}</Text>
      ) : displayBalances.map((balance) => {
        const usdValue = valuation?.tokens?.[getBalanceKey(balance)]?.usdValue;
        const fiatText = typeof usdValue === 'number' ? formatUsd(usdValue) : null;
        const holding = holdingsByKey[getBalanceKey(balance)];
        return (
          <View key={getBalanceKey(balance)} style={styles.balanceRow}>
            <View style={[styles.holdingSwatch, { backgroundColor: holding?.color || '#cbd5e1' }]} />
            <View style={styles.balanceMeta}>
              <Text style={styles.balanceSymbol}>{balance.symbol}</Text>
              <Text style={styles.balanceName} numberOfLines={1}>{balance.name}</Text>
            </View>
            <View style={styles.balanceValues}>
              <Text selectable style={styles.balanceAmount}>{formatCryptoQuantity(balance.amount)}</Text>
              {valuation !== undefined ? (
                <Text style={[styles.balanceFiat, fiatText ? null : styles.balanceFiatMissing]}>{fiatText || strings.noPrice}</Text>
              ) : null}
              {holding ? <Text style={styles.holdingPercentage}>{`${(holding.percentage * 100).toFixed(1)}%`}</Text> : null}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 18, paddingBottom: 32 },
  loadingScreen: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f7f9fc' },
  loadingText: { color: '#475569', fontSize: 15 },
  walletCard: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 18, marginBottom: 22, overflow: 'hidden', shadowColor: '#0f172a', shadowOpacity: 0.08, shadowOffset: { width: 0, height: 6 }, shadowRadius: 14, elevation: 3 },
  walletAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 2 },
  walletLogo: { position: 'absolute', top: 16, right: 16 },
  walletHeader: { marginHorizontal: -18, marginTop: -18, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 4, marginBottom: 14, minHeight: 82 },
  coinbaseHeader: { backgroundColor: '#0052FF' },
  coinbaseHeaderText: { color: '#ffffff' },
  walletName: { color: '#0f172a', fontSize: 20, fontWeight: '800', marginBottom: 14, paddingRight: 48 },
  totalValue: { color: '#0f172a', fontSize: 26, fontWeight: '900', marginBottom: 4, fontVariant: ['tabular-nums'] },
  totalValueMuted: { color: '#64748b', fontSize: 17, fontWeight: '700' },
  unpricedNote: { color: '#64748b', fontSize: 11, marginBottom: 14 },
  sectionTitle: { color: '#475569', fontSize: 13, fontWeight: '700', marginBottom: 7 },
  address: { color: '#0f172a', fontSize: 13, lineHeight: 19, marginBottom: 12 },
  copyButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#0f5132', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 14 },
  copyText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  syncedRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 },
  syncedText: { color: '#64748b', fontSize: 11 },
  syncFailed: { color: '#b91c1c', fontSize: 11, fontWeight: '700' },
  sectionHeading: { color: '#0f172a', fontSize: 17, fontWeight: '800', marginBottom: 10 },
  holdingsChart: { alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  holdingSwatch: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  holdingPercentage: { color: '#64748b', fontSize: 12, marginTop: 2, fontVariant: ['tabular-nums'] },
  filterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8 },
  filterLabelWrap: { flex: 1, paddingRight: 12 },
  filterLabel: { color: '#0f172a', fontSize: 14, fontWeight: '700' },
  filterHint: { color: '#64748b', fontSize: 11, marginTop: 2 },
  balanceRow: { minHeight: 58, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingVertical: 9 },
  balanceMeta: { flex: 1, paddingRight: 12 },
  balanceValues: { alignItems: 'flex-end', maxWidth: '60%' },
  balanceFiat: { color: '#475569', fontSize: 12, fontWeight: '600', marginTop: 2, fontVariant: ['tabular-nums'] },
  balanceFiatMissing: { color: '#94a3b8', fontWeight: '500' },
  balanceSymbol: { color: '#0f172a', fontSize: 14, fontWeight: '800' },
  balanceName: { color: '#64748b', fontSize: 12, marginTop: 2 },
  balanceAmount: { color: '#0f172a', fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  emptyText: { color: '#64748b', fontSize: 13, paddingVertical: 12 },
});
