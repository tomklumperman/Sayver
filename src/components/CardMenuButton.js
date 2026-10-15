import { StyleSheet, Text, TouchableOpacity } from 'react-native';

export default function CardMenuButton({
  onPress,
  disabled = false,
  iconColor = '#334155',
  accessibilityLabel = 'Open account actions',
  containerStyle,
  textStyle,
  activeOpacity = 0.86,
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      activeOpacity={activeOpacity}
      style={[styles.menuButton, containerStyle]}
    >
      <Text style={[styles.menuIcon, { color: iconColor }, textStyle]}>☰</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  menuButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  menuIcon: {
    fontSize: 15,
    fontWeight: '700',
  },
});