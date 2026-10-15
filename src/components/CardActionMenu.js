import { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';

export default function CardActionMenu({
  visible,
  title,
  items = [],
  cancelLabel = 'Cancel',
  onSelect,
  onClose,
}) {
  const animation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animation, {
      toValue: visible ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [animation, visible]);

  const overlayStyle = {
    opacity: animation.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    }),
  };

  const sheetStyle = {
    opacity: animation,
    transform: [
      {
        translateY: animation.interpolate({
          inputRange: [0, 1],
          outputRange: [18, 0],
        }),
      },
      {
        scale: animation.interpolate({
          inputRange: [0, 1],
          outputRange: [0.96, 1],
        }),
      },
    ],
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[styles.overlay, overlayStyle]}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <Animated.View style={[styles.sheet, sheetStyle]}>
              <View style={styles.handle} />
              <Text style={styles.title}>{title}</Text>
              <View style={styles.items}>
                {items.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.item, item.destructive && styles.itemDanger]}
                    activeOpacity={0.88}
                    onPress={() => onSelect(item.id)}
                  >
                    <Text style={[styles.itemText, item.destructive && styles.itemDangerText]}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={[styles.item, styles.cancelItem]} activeOpacity={0.88} onPress={onClose}>
                <Text style={[styles.itemText, styles.cancelText]}>{cancelLabel}</Text>
              </TouchableOpacity>
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  sheet: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.18,
    shadowRadius: 30,
    elevation: 18,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.12)',
    marginBottom: 14,
  },
  title: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: '#64748b',
    marginBottom: 10,
  },
  items: {
    gap: 8,
  },
  item: {
    minHeight: 52,
    borderRadius: 16,
    paddingHorizontal: 16,
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  itemText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
  itemDanger: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  itemDangerText: {
    color: '#b91c1c',
  },
  cancelItem: {
    marginTop: 12,
    backgroundColor: '#eef2ff',
    borderColor: '#c7d2fe',
  },
  cancelText: {
    color: '#4338ca',
  },
});