import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function SectionCard({ title, children }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e1e1e1',
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8
  },
  content: {
    marginTop: 4
  }
});
