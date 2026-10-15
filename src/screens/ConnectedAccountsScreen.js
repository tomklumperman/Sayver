import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { getAuth } from 'firebase/auth';
import { useEffect, useRef, useState } from 'react';
import {
    Alert,
    FlatList,
    Pressable,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    useColorScheme,
} from 'react-native';
import CardActionMenu from '../components/CardActionMenu';
import { getBankBranding } from '../constants/bankBranding';
import { formatCurrency } from '../constants/colors';
import { subscribeToConnectedWallets, subscribeToUserDocument, updateConnectedWalletSync } from '../firebase/firestore';
import { connectAndStoreTrueLayerAccounts, getTrueLayerAuthUrl, syncAllConnectedWallets, syncConnectedWalletBalance } from '../services/connectedWallets';
import { convertCurrencyAmount } from '../services/currency';

const CONNECTED_TRANSLATIONS = {
  en: {
    never: 'Never', actions: 'Account actions', details: 'Open details', rename: 'Rename account', rearrange: 'Rearrange accounts', delete: 'Delete account',
    todo: 'TODO', unavailableDetails: 'Open details is not available yet.', unavailableRename: 'Rename account is not available yet.',
    rearrangeFromHome: 'Rearrange accounts is available from the Home screen.', unavailableDelete: 'Delete account is not available yet.',
    bankConnected: 'Bank connected', connectedAccountOne: '1 bank account connected via TrueLayer.', connectedAccountMany: '{count} bank accounts connected via TrueLayer.', unableToConnect: 'Unable to connect bank',
    tryAgain: 'Please try again.', trueLayerMissing: 'TrueLayer config missing', verifyTrueLayer: 'Please verify TrueLayer backend and app config.',
    syncFailed: 'Sync failed', refreshWalletFailed: 'Could not refresh this wallet.', refreshFailed: 'Refresh failed', refreshAccountsFailed: 'Could not refresh connected bank accounts.',
    lastSynced: 'Last synced', refresh: 'Refresh', connectBank: 'Connect Bank',
    helper: 'Connect your bank with TrueLayer sandbox. Your bank credentials stay with the bank and only read-only data is shared.',
    opening: 'Opening...', connectBankAccount: 'Connect Bank Account', connectedBankAccounts: 'Connected bank accounts',
    noAccounts: 'No connected bank accounts yet.', cancel: 'Cancel', bankAccount: 'Bank account',
  },
  nl: {
    never: 'Nooit', actions: 'Rekeningopties', details: 'Details openen', rename: 'Rekening hernoemen', rearrange: 'Rekeningen ordenen', delete: 'Rekening verwijderen',
    todo: 'Nog niet beschikbaar', unavailableDetails: 'Rekeningdetails zijn nog niet beschikbaar.', unavailableRename: 'Rekening hernoemen is nog niet beschikbaar.',
    rearrangeFromHome: 'Je kunt rekeningen ordenen vanaf het startscherm.', unavailableDelete: 'Rekening verwijderen is nog niet beschikbaar.',
    bankConnected: 'Bank gekoppeld', connectedAccountOne: '1 bankrekening gekoppeld via TrueLayer.', connectedAccountMany: '{count} bankrekeningen gekoppeld via TrueLayer.', unableToConnect: 'Bank koppelen mislukt',
    tryAgain: 'Probeer het opnieuw.', trueLayerMissing: 'TrueLayer-configuratie ontbreekt', verifyTrueLayer: 'Controleer de TrueLayer-backend en app-configuratie.',
    syncFailed: 'Synchronisatie mislukt', refreshWalletFailed: 'Deze rekening kon niet worden vernieuwd.', refreshFailed: 'Vernieuwen mislukt', refreshAccountsFailed: 'Gekoppelde bankrekeningen konden niet worden vernieuwd.',
    lastSynced: 'Laatst gesynchroniseerd', refresh: 'Vernieuwen', connectBank: 'Bank koppelen',
    helper: 'Koppel je bank via de TrueLayer-sandbox. Je bankgegevens blijven bij je bank; alleen-lezengegevens worden gedeeld.',
    opening: 'Wordt geopend...', connectBankAccount: 'Bankrekening koppelen', connectedBankAccounts: 'Gekoppelde bankrekeningen',
    noAccounts: 'Nog geen bankrekeningen gekoppeld.', cancel: 'Annuleren', bankAccount: 'Bankrekening',
  },
};

function formatLastSynced(lastSyncedAt, language) {
  if (!lastSyncedAt?.toDate) {
    return CONNECTED_TRANSLATIONS[language].never;
  }
  return lastSyncedAt.toDate().toLocaleString(language === 'nl' ? 'nl-NL' : 'en-GB');
}

export default function ConnectedAccountsScreen() {
  const colorScheme = useColorScheme();
  const auth = getAuth();
  const user = auth.currentUser;
  const [connectedAccounts, setConnectedAccounts] = useState([]);
  const [currency, setCurrency] = useState('EUR');
  const [language, setLanguage] = useState('en');
  const [convertedWalletBalances, setConvertedWalletBalances] = useState({});
  const [connecting, setConnecting] = useState(false);
  const [syncingWalletId, setSyncingWalletId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [menuState, setMenuState] = useState(null);
  const handledCodesRef = useRef(new Set());
  const isDark = colorScheme === 'dark';
  const strings = CONNECTED_TRANSLATIONS[language] || CONNECTED_TRANSLATIONS.en;

  const handleAccountMenuAction = (action, wallet) => {
    switch (action) {
      case 'details':
        Alert.alert(strings.todo, strings.unavailableDetails);
        break;
      case 'rename':
        Alert.alert(strings.todo, strings.unavailableRename);
        break;
      case 'rearrange':
        Alert.alert(strings.todo, strings.rearrangeFromHome);
        break;
      case 'delete':
        Alert.alert(strings.todo, strings.unavailableDelete);
        break;
      default:
        break;
    }
  };

  const showAccountMenu = (wallet) => {
    setMenuState({
      wallet,
      title: strings.actions,
      items: [
        { id: 'details', label: strings.details },
        { id: 'rename', label: strings.rename },
        { id: 'rearrange', label: strings.rearrange },
        { id: 'delete', label: strings.delete, destructive: true },
      ],
    });
  };

  const closeAccountMenu = () => setMenuState(null);

  const handleAccountMenuSelect = (choice) => {
    const currentMenu = menuState;
    if (!currentMenu) {
      closeAccountMenu();
      return;
    }

    closeAccountMenu();
    handleAccountMenuAction(choice, currentMenu.wallet);
  };

  useEffect(() => {
    if (!user?.uid) {
      return undefined;
    }

    const unsubscribeUser = subscribeToUserDocument(user.uid, (docSnapshot) => {
      const data = docSnapshot.data();
      setCurrency(data?.currencyPreference || 'EUR');
      setLanguage(data?.languagePreference === 'nl' ? 'nl' : 'en');
    });

    const unsubscribe = subscribeToConnectedWallets(user.uid, (items) => {
      const bankItems = items.filter((item) => {
        const provider = (item?.provider || '').toLowerCase();
        return provider === 'truelayer';
      });
      setConnectedAccounts(bankItems);
    });

    return () => {
      if (unsubscribeUser) unsubscribeUser();
      if (unsubscribe) unsubscribe();
    };
  }, [user?.uid]);

  useEffect(() => {
    let cancelled = false;

    const syncWalletConversions = async () => {
      if (!Array.isArray(connectedAccounts) || connectedAccounts.length === 0) {
        if (!cancelled) {
          setConvertedWalletBalances({});
        }
        return;
      }

      const entries = await Promise.all(
        connectedAccounts.map(async (wallet) => {
          const nativeAmount = Number(wallet?.totalBalance) || 0;
          const nativeCurrency = wallet?.currency || currency;

          try {
            const convertedAmount = await convertCurrencyAmount(nativeAmount, nativeCurrency, currency);
            return [wallet.id, convertedAmount];
          } catch (error) {
            console.warn(`Unable to convert connected wallet ${wallet?.id || 'unknown'} to ${currency}:`, error?.message || error);
            return [wallet.id, nativeCurrency === currency ? nativeAmount : 0];
          }
        })
      );

      if (!cancelled) {
        setConvertedWalletBalances(Object.fromEntries(entries));
      }
    };

    syncWalletConversions();

    return () => {
      cancelled = true;
    };
  }, [connectedAccounts, currency]);

  useEffect(() => {
    const subscription = Linking.addEventListener('url', async ({ url }) => {
      if (!user?.uid) {
        return;
      }

      const parsed = Linking.parse(url);
      const code = typeof parsed?.queryParams?.code === 'string' ? parsed.queryParams.code : null;

      if (!code) {
        return;
      }

      if (handledCodesRef.current.has(code)) {
        return;
      }
      handledCodesRef.current.add(code);

      setConnecting(true);
      try {
        const syncedCount = await connectAndStoreTrueLayerAccounts(user.uid, code);
        const message = syncedCount === 1 ? strings.connectedAccountOne : strings.connectedAccountMany.replace('{count}', String(syncedCount));
        Alert.alert(strings.bankConnected, message);
      } catch (error) {
        Alert.alert(strings.unableToConnect, error?.message || strings.tryAgain);
      } finally {
        setConnecting(false);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [user?.uid, strings]);

  const handleOpenTrueLayerLink = async () => {
    setConnecting(true);
    try {
      const url = await getTrueLayerAuthUrl(user?.uid);
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert(strings.trueLayerMissing, error?.message || strings.verifyTrueLayer);
    } finally {
      setConnecting(false);
    }
  };

  const handleRefreshWallet = async (wallet) => {
    if (!user?.uid || !wallet?.id) {
      return;
    }

    setSyncingWalletId(wallet.id);
    try {
      await updateConnectedWalletSync(user.uid, wallet.id, { syncStatus: 'syncing', syncMessage: null });
      await syncConnectedWalletBalance(user.uid, wallet, { forceRefresh: true });
    } catch (error) {
      Alert.alert(strings.syncFailed, error?.message || strings.refreshWalletFailed);
    } finally {
      setSyncingWalletId(null);
    }
  };

  const handlePullToRefresh = async () => {
    if (!user?.uid) {
      return;
    }

    setRefreshing(true);
    try {
      await syncAllConnectedWallets(user.uid, connectedAccounts);
    } catch (error) {
      Alert.alert(strings.refreshFailed, error?.message || strings.refreshAccountsFailed);
    } finally {
      setRefreshing(false);
    }
  };

  const renderAccount = ({ item }) => (
    <Pressable
      style={({ pressed }) => [styles.walletCardPressable, pressed && styles.walletCardPressed]}
      onPress={() => undefined}
    >
      {({ pressed }) => {
        const branding = getBankBranding(item.bankName || item.accountDisplayName || item.nickname || 'Bank');
        const accentColors = branding.gradientColors || [branding.primaryColor, branding.secondaryColor];
        const convertedBalance = convertedWalletBalances[item.id];
        return (
          <View
            style={[
              styles.walletCard,
              {
                backgroundColor: isDark ? 'rgba(15,23,42,0.9)' : 'rgba(255,255,255,0.94)',
                borderColor: isDark ? 'rgba(148,163,184,0.22)' : 'rgba(148,163,184,0.16)',
                shadowColor: branding.primaryColor,
                transform: [{ scale: pressed ? 0.985 : 1 }],
              },
            ]}
          >
            <LinearGradient
              colors={accentColors}
              start={[0, 0]}
              end={[1, 0]}
              style={styles.walletAccentStrip}
            />
            <View style={[styles.walletPatternOrb, { backgroundColor: `${branding.primaryColor}18` }]} />
            <View style={[styles.walletPatternOrbSecondary, { backgroundColor: `${branding.secondaryColor}12` }]} />

            <View style={styles.walletTopRow}>
              <View style={styles.walletBrandRow}>
                <View style={[styles.walletIconPill, { backgroundColor: `${branding.primaryColor}14`, borderColor: `${branding.primaryColor}24` }]}>
                  <Ionicons name={branding.iconName} size={16} color={branding.primaryColor} />
                </View>
                <View style={styles.walletBrandTextWrap}>
                  <Text style={[styles.walletBrandTitle, { color: isDark ? '#f8fafc' : '#0f172a' }]}>{branding.displayName}</Text>
                  <Text style={[styles.walletAccountName, { color: isDark ? '#cbd5e1' : '#475569' }]}>{item.accountDisplayName || item.nickname || strings.bankAccount}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.walletMenuButton}
                onPress={() => showAccountMenu(item)}
                accessibilityLabel={strings.actions}
                activeOpacity={0.86}
              >
                <Text style={[styles.walletMenuIcon, { color: isDark ? '#e2e8f0' : '#334155' }]}>☰</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.walletValue, { color: isDark ? '#f8fafc' : '#0f172a' }]}>{formatCurrency(typeof convertedBalance === 'number' ? convertedBalance : item.totalBalance || 0, currency)}</Text>

            <Text style={[styles.walletAddress, { color: isDark ? '#cbd5e1' : '#64748b' }]}>{item.bankName || 'Bank'}{item.accountIdentifier ? ` • ${item.accountIdentifier}` : ''}</Text>

            <View style={styles.walletFooter}>
              <Text style={[styles.walletMeta, { color: isDark ? '#94a3b8' : '#64748b' }]}>{strings.lastSynced}: {formatLastSynced(item.lastSyncedAt, language)}</Text>
              <TouchableOpacity
                style={[styles.refreshButton, isDark && styles.refreshButtonDark, syncingWalletId === item.id && styles.refreshButtonDisabled]}
                onPress={() => handleRefreshWallet(item)}
                disabled={syncingWalletId === item.id}
              >
                <Text style={styles.refreshButtonText}>{syncingWalletId === item.id ? '...' : strings.refresh}</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      }}
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <CardActionMenu
        visible={!!menuState}
        title={menuState?.title}
        items={menuState?.items || []}
        cancelLabel={strings.cancel}
        onClose={closeAccountMenu}
        onSelect={handleAccountMenuSelect}
      />
      <Text style={styles.heading}>{strings.connectBank}</Text>
      <Text style={styles.helperText}>
        {strings.helper}
      </Text>
      <TouchableOpacity style={styles.primaryButton} onPress={handleOpenTrueLayerLink} disabled={connecting}>
        <Text style={styles.primaryButtonText}>{connecting ? strings.opening : strings.connectBankAccount}</Text>
      </TouchableOpacity>

      <Text style={styles.subHeading}>{strings.connectedBankAccounts}</Text>
      <FlatList
        data={connectedAccounts}
        keyExtractor={(item) => item.id}
        renderItem={renderAccount}
        refreshControl={(
          <RefreshControl refreshing={refreshing} onRefresh={handlePullToRefresh} />
        )}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<Text style={styles.emptyText}>{strings.noAccounts}</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f9fc',
    paddingHorizontal: 20,
    paddingTop: 22,
  },
  heading: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 12,
  },
  helperText: {
    color: '#475569',
    marginBottom: 10,
    lineHeight: 20,
  },
  subHeading: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 22,
    marginBottom: 10,
  },
  primaryButton: {
    backgroundColor: '#84cc16',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  listContent: {
    paddingBottom: 24,
  },
  emptyText: {
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 4,
    marginBottom: 0,
    textAlign: 'center',
    marginTop: 24,
  },
  walletCardPressable: {
    width: '100%',
    marginBottom: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  walletCardPressed: {
    transform: [{ scale: 0.985 }],
  },
  walletCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    overflow: 'hidden',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 4,
  },
  walletAccentStrip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  walletPatternOrb: {
    position: 'absolute',
    right: -18,
    top: -10,
    width: 66,
    height: 66,
    borderRadius: 33,
  },
  walletPatternOrbSecondary: {
    position: 'absolute',
    left: -24,
    bottom: -20,
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  walletTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  walletBrandRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    paddingRight: 10,
  },
  walletIconPill: {
    width: 28,
    height: 28,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  walletBrandTextWrap: {
    flex: 1,
  },
  walletBrandTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  walletAccountName: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
  },
  walletMenuButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  walletMenuIcon: { fontSize: 15, fontWeight: '700' },
  walletAddress: {
    marginTop: 10,
    fontSize: 12,
  },
  walletValue: {
    marginTop: 12,
    fontWeight: '900',
    fontSize: 24,
    letterSpacing: -0.3,
  },
  walletFooter: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  walletMeta: {
    fontSize: 12,
    flex: 1,
    paddingRight: 10,
  },
  refreshButton: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: 'rgba(6,95,70,0.18)',
  },
  refreshButtonDark: {
    backgroundColor: 'rgba(16,185,129,0.16)',
  },
  refreshButtonText: {
    color: '#065f46',
    fontSize: 12,
    fontWeight: '700',
  },
  refreshButtonDisabled: {
    opacity: 0.6,
  },
});
