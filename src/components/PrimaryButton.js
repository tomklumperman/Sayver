import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function PrimaryButton({
  title,
  onPress,
  disabled,
  style,
  textStyle,
  gradientColors,
  disableShine = false,
  borderColor,
}) {
  const resolvedColors = disabled
    ? ['#d1d5db', '#cbd5e1']
    : Array.isArray(gradientColors) && gradientColors.length > 0
      ? gradientColors
      : ['#34d399', '#10b981', '#059669'];

  return (
    <TouchableOpacity
      style={[styles.buttonOuter, disabled && styles.disabledButton, style]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <LinearGradient
        colors={resolvedColors}
        locations={[0, 0.55, 1]}
        start={[0, 0]}
        end={[1, 1]}
        style={[styles.buttonInner, borderColor ? { borderColor } : null]}
      >
        {!disableShine ? <View pointerEvents="none" style={styles.shine} /> : null}
        <Text style={[styles.buttonText, disabled && styles.buttonTextDisabled, textStyle]}>{title}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  buttonOuter: {
    borderRadius: 12,
    shadowColor: '#064e3b',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 18,
    elevation: 6,
  },
  buttonInner: {
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  shine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '55%',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  disabledButton: {
    opacity: 0.65,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
    textShadowColor: 'rgba(0,0,0,0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  buttonTextDisabled: {
    color: '#334155',
  },
});
