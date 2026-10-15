import * as Linking from 'expo-linking';
import { getAuth } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { IOSKeyboardDoneAccessory } from '../components/ModalKeyboardSupport';
import { subscribeToUserDocument } from '../firebase/firestore';
import { beginCoinbaseOAuth, connectCryptoWallet } from '../services/cryptoAccounts';

const ACCESSORY_ID = 'crypto-wallet-connect-input-accessory';
const NETWORKS = [
  { id: 'ethereum', name: 'Ethereum', nativeSymbol: 'ETH' },
  { id: 'solana', name: 'Solana', nativeSymbol: 'SOL' },
  { id: 'base', name: 'Base', nativeSymbol: 'ETH' },
];
const COPY = {
  en: {
    title: 'Connect crypto account', walletMode: 'Wallet', coinbaseMode: 'Coinbase', selectNetwork: 'Select network', address: 'Public wallet address',
    warningTitle: 'Public address only', warning: 'Never enter a private key or seed/recovery phrase. Sayver will never ask for them.',
    connect: 'Connect wallet', connecting: 'Checking wallet…', invalid: 'Enter a valid public address for the selected network.',
    permission: 'Photo and private-key information are not required. Only public wallet addresses are accepted.',
    failedTitle: 'Could not connect wallet', tryAgain: 'Check the public address and try again.', done: 'Done',
    connectCoinbase: 'Connect Coinbase read-only', coinbaseAccess: 'Sayver requests read-only account access. It cannot trade, transfer, deposit, or withdraw.',
    coinbaseFailed: 'Could not connect Coinbase. Please try again.', coinbaseComplete: 'Coinbase account connected.',
    coinbaseOAuthNotice: 'Coinbase OAuth requires an approved Coinbase developer application.',
  },
  nl: {
    title: 'Crypto-account koppelen', walletMode: 'Wallet', coinbaseMode: 'Coinbase', selectNetwork: 'Kies een netwerk', address: 'Openbaar walletadres',
    warningTitle: 'Alleen openbaar adres', warning: 'Vul nooit een privésleutel of seed-/herstelzin in. Sayver zal hier nooit om vragen.',
    connect: 'Wallet koppelen', connecting: 'Wallet controleren…', invalid: 'Vul een geldig openbaar adres voor het gekozen netwerk in.',
    permission: 'Foto- en privésleutelgegevens zijn niet nodig. Alleen openbare walletadressen worden geaccepteerd.',
    failedTitle: 'Wallet koppelen mislukt', tryAgain: 'Controleer het openbare adres en probeer het opnieuw.', done: 'Gereed',
    connectCoinbase: 'Coinbase alleen-lezen koppelen', coinbaseAccess: 'Sayver vraagt alleen-lezen toegang tot rekeningen. Handelen, overboeken, storten en opnemen kan niet.',
    coinbaseFailed: 'Coinbase koppelen is mislukt. Probeer het opnieuw.', coinbaseComplete: 'Coinbase-account gekoppeld.',
    coinbaseOAuthNotice: 'Coinbase OAuth vereist een goedgekeurde Coinbase-ontwikkelaarsapp.',
  },
};

function isValidAddress(network, value) {
  const address = value.trim();
  if (network === 'ethereum' || network === 'base') return /^0x[a-fA-F0-9]{40}$/.test(address);
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

export default function CryptoWalletConnectScreen({ navigation }) {
  const [connectionType, setConnectionType] = useState('wallet');
  const [network, setNetwork] = useState('ethereum');
  const [publicAddress, setPublicAddress] = useState('');
  const [language, setLanguage] = useState('en');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const user = getAuth().currentUser;
  const strings = COPY[language] || COPY.en;
  const addressValid = isValidAddress(network, publicAddress);

  useEffect(() => {
    if (!user?.uid) return undefined;
    return subscribeToUserDocument(user.uid, (snapshot) => {
      setLanguage(snapshot.data()?.languagePreference === 'nl' ? 'nl' : 'en');
    });
  }, [user?.uid]);

  useEffect(() => {
    const handleCoinbaseRedirect = (url) => {
      const parsed = Linking.parse(url);
      const status = parsed?.queryParams?.coinbase;
      if (!String(parsed?.path || '').endsWith('coinbase-connected') || !status) return;
      if (status === 'success') {
        Alert.alert(strings.coinbaseComplete);
        navigation.navigate('MainTabs');
      } else {
        setError(strings.coinbaseFailed);
      }
    };

    const subscription = Linking.addEventListener('url', ({ url }) => handleCoinbaseRedirect(url));
    Linking.getInitialURL().then((url) => {
      if (url) handleCoinbaseRedirect(url);
    }).catch(() => {});
    return () => subscription.remove();
  }, [navigation, language]);

  const handleConnect = async () => {
    if (!addressValid || connecting) {
      setError(strings.invalid);
      return;
    }
    setConnecting(true);
    setError('');
    try {
      await connectCryptoWallet(network, publicAddress.trim());
      navigation.navigate('MainTabs', { justConnectedCrypto: true });
    } catch (connectError) {
      setError(connectError?.message || strings.tryAgain);
      Alert.alert(strings.failedTitle, connectError?.message || strings.tryAgain);
    } finally {
      setConnecting(false);
    }
  };

  const handleConnectCoinbase = async () => {
    if (connecting) return;
    setConnecting(true);
    setError('');
    try {
      const appRedirectUri = Linking.createURL('coinbase-connected');
      const result = await beginCoinbaseOAuth(appRedirectUri);
      if (!result?.authorizationUrl) throw new Error(strings.coinbaseFailed);
      await Linking.openURL(result.authorizationUrl);
    } catch (coinbaseError) {
      const code = typeof coinbaseError?.code === 'string' ? coinbaseError.code : null;
      const message = typeof coinbaseError?.message === 'string' ? coinbaseError.message : '';
      setError(code ? `${strings.coinbaseFailed} (${code}): ${message}` : message || strings.coinbaseFailed);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{strings.title}</Text>
        <View style={styles.networkRow}>
          {[
            { id: 'wallet', label: strings.walletMode },
            { id: 'coinbase', label: strings.coinbaseMode },
          ].map((item) => (
            <TouchableOpacity
              key={item.id}
              accessibilityRole="button"
              accessibilityState={{ selected: connectionType === item.id }}
              style={[styles.networkOption, connectionType === item.id ? styles.networkOptionActive : null]}
              onPress={() => {
                setConnectionType(item.id);
                setError('');
              }}
            >
              <Text style={[styles.networkText, connectionType === item.id ? styles.networkTextActive : null]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {connectionType === 'wallet' ? (
          <>
        <Text style={styles.label}>{strings.selectNetwork}</Text>
        <View style={styles.networkRow}>
          {NETWORKS.map((item) => (
            <TouchableOpacity
              key={item.id}
              accessibilityRole="button"
              accessibilityState={{ selected: network === item.id }}
              style={[styles.networkOption, network === item.id ? styles.networkOptionActive : null]}
              onPress={() => setNetwork(item.id)}
            >
              <Text style={[styles.networkText, network === item.id ? styles.networkTextActive : null]}>{item.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.label}>{strings.address}</Text>
        <TextInput
          value={publicAddress}
          onChangeText={(value) => {
            setPublicAddress(value);
            setError('');
          }}
          placeholder={network === 'solana' ? 'Solana address, e.g. 7xKX...' : '0x...'}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          inputAccessoryViewID={ACCESSORY_ID}
          style={styles.input}
        />
        <View style={styles.warningBox}>
          <Text style={styles.warningTitle}>{strings.warningTitle}</Text>
          <Text style={styles.warningText}>{strings.warning}</Text>
        </View>
          </>
        ) : (
          <View style={styles.warningBox}>
            <Text style={styles.warningTitle}>{strings.coinbaseMode}</Text>
            <Text style={styles.warningText}>{strings.coinbaseAccess}</Text>
            <Text style={styles.warningFootnote}>{strings.coinbaseOAuthNotice}</Text>
          </View>
        )}
        {error ? <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text> : null}
        <TouchableOpacity
          style={[styles.connectButton, ((connectionType === 'wallet' && !addressValid) || connecting) ? styles.connectButtonDisabled : null]}
          onPress={connectionType === 'wallet' ? handleConnect : handleConnectCoinbase}
          disabled={(connectionType === 'wallet' && !addressValid) || connecting}
          accessibilityState={{ disabled: (connectionType === 'wallet' && !addressValid) || connecting }}
        >
          {connecting ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.connectButtonText}>{connectionType === 'wallet' ? strings.connect : strings.connectCoinbase}</Text>}
        </TouchableOpacity>
      </ScrollView>
      <IOSKeyboardDoneAccessory nativeID={ACCESSORY_ID} label={strings.done} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f9fc' },
  content: { padding: 20, paddingBottom: 40 },
  title: { color: '#0f172a', fontSize: 23, fontWeight: '800', marginBottom: 22 },
  label: { color: '#334155', fontSize: 14, fontWeight: '700', marginBottom: 9 },
  networkRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  networkOption: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#ffffff', paddingHorizontal: 6 },
  networkOptionActive: { borderColor: '#0f5132', backgroundColor: '#dcfce7' },
  networkText: { color: '#475569', fontSize: 13, fontWeight: '700' },
  networkTextActive: { color: '#0f5132' },
  input: { minHeight: 50, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, backgroundColor: '#ffffff', color: '#0f172a', paddingHorizontal: 13, fontSize: 15, marginBottom: 18 },
  warningBox: { borderWidth: 1, borderColor: '#f59e0b', backgroundColor: '#fffbeb', borderRadius: 10, padding: 13, marginBottom: 16 },
  warningTitle: { color: '#78350f', fontWeight: '800', marginBottom: 4 },
  warningText: { color: '#78350f', fontSize: 13, lineHeight: 19 },
  warningFootnote: { color: '#92400e', fontSize: 12, lineHeight: 17, marginTop: 7 },
  errorText: { color: '#b91c1c', fontSize: 13, fontWeight: '600', marginBottom: 12 },
  connectButton: { minHeight: 48, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f5132', paddingHorizontal: 16 },
  connectButtonDisabled: { opacity: 0.48 },
  connectButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
});
