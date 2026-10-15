import { useEffect, useState } from 'react';
import { InputAccessoryView, Keyboard, KeyboardAvoidingView, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export function KeyboardAwareModalOverlay({ style, children, keyboardDoneLabel }) {
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'ios') return undefined;

    const onFrame = (event) => {
      const keyboardHeight = Math.max(0, Number(event?.endCoordinates?.height) || 0);
      setKeyboardInset(keyboardHeight);
    };

    const onHide = () => setKeyboardInset(0);

    const frameSubscription = Keyboard.addListener('keyboardWillChangeFrame', onFrame);
    const hideSubscription = Keyboard.addListener('keyboardWillHide', onHide);

    return () => {
      frameSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  return (
    <KeyboardAvoidingView
      style={[
        style,
        Platform.OS === 'ios' && keyboardInset > 0 ? styles.keyboardOpen : null,
        Platform.OS === 'ios' && keyboardInset > 0 ? { paddingBottom: keyboardInset + (keyboardDoneLabel ? 44 : 0) } : null,
      ]}
      behavior={Platform.OS === 'android' ? 'height' : undefined}
    >
      {children}
      {Platform.OS === 'ios' && keyboardInset > 0 && keyboardDoneLabel ? (
        <View style={[styles.accessoryBar, styles.modalAccessoryBar, { bottom: keyboardInset }]}>
          <TouchableOpacity style={styles.doneButton} onPress={Keyboard.dismiss} accessibilityRole="button">
            <Text style={styles.doneText}>{keyboardDoneLabel}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

export function IOSKeyboardDoneAccessory({ nativeID, label = 'Done' }) {
  if (Platform.OS !== 'ios') return null;

  return (
    <InputAccessoryView nativeID={nativeID}>
      <View style={styles.accessoryBar}>
        <TouchableOpacity style={styles.doneButton} onPress={Keyboard.dismiss}>
          <Text style={styles.doneText}>{label}</Text>
        </TouchableOpacity>
      </View>
    </InputAccessoryView>
  );
}

const styles = StyleSheet.create({
  keyboardOpen: {
    justifyContent: 'flex-end',
  },
  modalAccessoryBar: { position: 'absolute', left: 0, right: 0, width: 'auto', height: 44, zIndex: 10 },
  accessoryBar: {
    backgroundColor: '#f8fafc',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  doneButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  doneText: {
    color: '#0f5132',
    fontSize: 16,
    fontWeight: '700',
  },
});
