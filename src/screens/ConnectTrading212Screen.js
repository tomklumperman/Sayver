import { getAuth } from 'firebase/auth';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Linking,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity
} from 'react-native';
import { IOSKeyboardDoneAccessory } from '../components/ModalKeyboardSupport';
import PrimaryButton from '../components/PrimaryButton';
import { subscribeToUserDocument } from '../firebase/firestore';
import { connectTrading212 } from '../services/investmentAccounts';

const API_KEY_GUIDE_URL = 'https://docs.trading212.com/';
const CONNECT_ACCESSORY_ID = 'connect-trading212-input-accessory';
const TRADING212_TRANSLATIONS = {
  en: {
    title: 'Connect Trading 212', description: 'Generate a read-only API key in the Trading 212 app under Settings → API (Beta), then paste it below.',
    help: 'How do I get this?', apiKey: 'API key', apiSecret: 'API secret',
    error: 'Could not connect to Trading 212. Check your API key and secret.', connecting: 'Connecting...', connect: 'Connect', done: 'Done',
  },
  nl: {
    title: 'Trading 212 koppelen', description: 'Maak in de Trading 212-app een API-sleutel met alleen-lezenrechten via Instellingen → API (Beta) en plak deze hieronder.',
    help: 'Hoe kom ik hieraan?', apiKey: 'API-sleutel', apiSecret: 'API-geheim',
    error: 'Koppelen met Trading 212 is mislukt. Controleer je API-sleutel en API-geheim.', connecting: 'Bezig met koppelen...', connect: 'Koppelen', done: 'Gereed',
  },
};

export default function ConnectTrading212Screen({ navigation }) {
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [language, setLanguage] = useState('en');
  const strings = TRADING212_TRANSLATIONS[language] || TRADING212_TRANSLATIONS.en;

  useEffect(() => {
    const uid = getAuth().currentUser?.uid;
    if (!uid) return undefined;
    return subscribeToUserDocument(uid, (snapshot) => {
      setLanguage(snapshot.data()?.languagePreference === 'nl' ? 'nl' : 'en');
    });
  }, []);

  const canSubmit = apiKey.trim().length > 0 && apiSecret.trim().length > 0 && !submitting;

  const handleConnect = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');

    try {
      await connectTrading212(apiKey, apiSecret);
      setApiKey('');
      setApiSecret('');
      navigation.navigate('MainTabs', { justConnectedInvestment: 'trading212' });
    } catch (err) {
      setError(strings.error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{strings.title}</Text>
      <Text style={styles.description}>
        {strings.description}
      </Text>

      <TouchableOpacity onPress={() => Linking.openURL(API_KEY_GUIDE_URL)} style={styles.helpLink}>
        <Text style={styles.helpLinkText}>{strings.help}</Text>
      </TouchableOpacity>

      <Text style={styles.label}>{strings.apiKey}</Text>
      <TextInput
        value={apiKey}
        onChangeText={setApiKey}
        placeholder={strings.apiKey}
        placeholderTextColor="#94a3b8"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        importantForAutofill="no"
        inputAccessoryViewID={CONNECT_ACCESSORY_ID}
        style={styles.input}
      />

      <Text style={styles.label}>{strings.apiSecret}</Text>
      <TextInput
        value={apiSecret}
        onChangeText={setApiSecret}
        placeholder={strings.apiSecret}
        placeholderTextColor="#94a3b8"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        importantForAutofill="no"
        secureTextEntry
        inputAccessoryViewID={CONNECT_ACCESSORY_ID}
        style={styles.input}
      />

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <PrimaryButton
        title={submitting ? strings.connecting : strings.connect}
        onPress={handleConnect}
        disabled={!canSubmit}
        style={styles.connectButton}
      />

      {submitting ? <ActivityIndicator style={styles.spinner} color="#059669" /> : null}
      <IOSKeyboardDoneAccessory nativeID={CONNECT_ACCESSORY_ID} label={strings.done} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '800', color: '#0f172a', marginBottom: 8 },
  description: { fontSize: 14, color: '#475569', marginBottom: 6, lineHeight: 20 },
  helpLink: { marginBottom: 20, alignSelf: 'flex-start' },
  helpLinkText: { fontSize: 13, fontWeight: '700', color: '#059669' },
  label: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 6, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    padding: 14,
    fontSize: 16,
    color: '#0f172a',
    marginBottom: 16,
    backgroundColor: '#ffffff',
  },
  errorText: { color: '#dc2626', fontSize: 13, fontWeight: '600', marginBottom: 12 },
  connectButton: { marginTop: 8 },
  spinner: { marginTop: 16 },
});
