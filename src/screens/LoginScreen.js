import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { IOSKeyboardDoneAccessory } from '../components/ModalKeyboardSupport';
import PrimaryButton from '../components/PrimaryButton';

const LOGIN_ACCESSORY_ID = 'login-input-accessory';
const LOGIN_TRANSLATIONS = {
  en: { subtitle: 'Smart shared savings.', email: 'Email', password: 'Password', signingIn: 'Signing in...', signIn: 'Sign in', noAccount: 'Don’t have an account?', create: 'Create one', loginFailed: 'Login failed', tryAgain: 'Please try again.' },
  nl: { subtitle: 'Slim samen sparen.', email: 'E-mailadres', password: 'Wachtwoord', signingIn: 'Bezig met inloggen...', signIn: 'Inloggen', noAccount: 'Heb je nog geen account?', create: 'Account aanmaken', loginFailed: 'Inloggen mislukt', tryAgain: 'Probeer het opnieuw.' },
};

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [language, setLanguage] = useState('en');
  const strings = LOGIN_TRANSLATIONS[language] || LOGIN_TRANSLATIONS.en;

  useEffect(() => {
    AsyncStorage.getItem('appLanguagePreference').then((value) => setLanguage(value === 'nl' ? 'nl' : 'en'));
  }, []);

  const handleSignIn = async () => {
    setLoading(true);
    const auth = getAuth();
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (error) {
      Alert.alert(strings.loginFailed, error.message || strings.tryAgain);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Text style={styles.brandTitle}>Sayver</Text>
      <Text style={styles.brandSubtitle}>{strings.subtitle}</Text>
      <View style={styles.formCard}>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder={strings.email}
          placeholderTextColor="#d1f7dc"
          inputAccessoryViewID={LOGIN_ACCESSORY_ID}
          style={styles.input}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder={strings.password}
          placeholderTextColor="#d1f7dc"
          secureTextEntry
          inputAccessoryViewID={LOGIN_ACCESSORY_ID}
          style={styles.input}
        />
        <PrimaryButton title={loading ? strings.signingIn : strings.signIn} onPress={handleSignIn} style={styles.primaryButton} />
        <View style={styles.footerRow}>
          <Text style={styles.footerText}>{strings.noAccount}</Text>
          <TouchableOpacity onPress={() => navigation.navigate('SignUp')}>
            <Text style={styles.linkText}>{strings.create}</Text>
          </TouchableOpacity>
        </View>
      </View>
      <IOSKeyboardDoneAccessory nativeID={LOGIN_ACCESSORY_ID} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#0f5132' },
  brandTitle: { fontSize: 36, fontWeight: '900', color: '#ffffff', marginBottom: 8 },
  brandSubtitle: { fontSize: 16, color: '#d1f7dc', marginBottom: 28 },
  formCard: { backgroundColor: '#ffffff', borderRadius: 12, padding: 24, shadowColor: '#000', shadowOpacity: 0.08, shadowOffset: { width: 0, height: 6 }, shadowRadius: 20, elevation: 6 },
  input: { backgroundColor: '#ffffff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#d1f7dc', marginBottom: 16, color: '#0f172a' },
  primaryButton: { marginBottom: 16 },
  footerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  footerText: { color: '#475569', marginRight: 8 },
  linkText: { color: '#0f5132', fontWeight: '700' },
});
