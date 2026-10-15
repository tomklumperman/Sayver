import { getAuth } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { subscribeToUserDocument } from '../firebase/firestore';

const STRINGS = {
  en: ['Savings Overview', 'This is where savings account summaries, goals, and balances will appear.'],
  nl: ['Spaargeldoverzicht', 'Hier verschijnen overzichten, doelen en saldi van je spaarrekeningen.'],
};

export default function SavingsScreen() {
  const [language, setLanguage] = useState('en');
  useEffect(() => {
    const uid = getAuth().currentUser?.uid;
    if (!uid) return undefined;
    return subscribeToUserDocument(uid, (snapshot) => {
      setLanguage(snapshot.data()?.languagePreference === 'nl' ? 'nl' : 'en');
    });
  }, []);
  const strings = STRINGS[language] || STRINGS.en;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{strings[0]}</Text>
      <Text style={styles.text}>{strings[1]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 12 },
  text: { fontSize: 16, color: '#555' }
});
