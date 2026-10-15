import { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';

function roundToCents(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export default function AmountAllocationSlider({
  value = 0,
  max = 0,
  onChange,
  accentColor = '#0f5132',
  valueLabel,
  maxLabel,
  disabled = false,
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const dragStartXRef = useRef(0);
  const dragStartValueXRef = useRef(0);
  const dragUsesThumbRef = useRef(false);
  const safeMax = Math.max(0, Number(max) || 0);
  const safeValue = Math.max(0, Math.min(safeMax, Number(value) || 0));
  const ratio = safeMax > 0 ? safeValue / safeMax : 0;
  const knobOffset = useMemo(() => {
    if (trackWidth <= 0) return 0;
    return ratio * trackWidth;
  }, [ratio, trackWidth]);

  const commitFromLocation = (locationX) => {
    if (disabled || safeMax <= 0 || trackWidth <= 0 || typeof onChange !== 'function') {
      return;
    }
    const clampedX = Math.max(0, Math.min(trackWidth, Number(locationX) || 0));
    const nextRatio = clampedX / trackWidth;
    onChange(roundToCents(nextRatio * safeMax));
  };

  const getClampedX = (locationX) => Math.max(0, Math.min(trackWidth, Number(locationX) || 0));

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onStartShouldSetPanResponderCapture: () => !disabled,
        onMoveShouldSetPanResponder: (_, gestureState) => !disabled && Math.abs(gestureState.dx) >= 0,
        onMoveShouldSetPanResponderCapture: () => !disabled,
        onPanResponderGrant: (event, gestureState) => {
          const touchX = getClampedX(event.nativeEvent.locationX);
          const currentThumbX = ratio * trackWidth;
          dragStartXRef.current = Number(gestureState?.x0) || 0;
          dragStartValueXRef.current = currentThumbX;
          dragUsesThumbRef.current = Math.abs(touchX - currentThumbX) <= 20;
          if (!dragUsesThumbRef.current) {
            commitFromLocation(touchX);
          }
        },
        onPanResponderMove: (event, gestureState) => {
          if (dragUsesThumbRef.current) {
            const nextX = dragStartValueXRef.current + ((Number(gestureState?.moveX) || 0) - dragStartXRef.current);
            commitFromLocation(nextX);
            return;
          }
          commitFromLocation(event.nativeEvent.locationX);
        },
        onPanResponderRelease: () => {
          dragUsesThumbRef.current = false;
        },
        onPanResponderTerminate: () => {
          dragUsesThumbRef.current = false;
        },
      }),
    [commitFromLocation, disabled, ratio, trackWidth]
  );

  return (
    <View style={styles.container}>
      <View style={styles.labelsRow}>
        <Text style={styles.currentLabel}>{valueLabel}</Text>
        <Text style={styles.maxLabel}>{maxLabel}</Text>
      </View>
      <View
        style={[styles.trackWrap, disabled && styles.trackWrapDisabled]}
        onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
        {...panResponder.panHandlers}
      >
        <View style={styles.trackBase} />
        <View style={[styles.trackFill, { width: `${ratio * 100}%`, backgroundColor: accentColor }]} />
        <View
          style={[
            styles.knob,
            {
              left: knobOffset,
              backgroundColor: accentColor,
              borderColor: accentColor,
            },
            disabled && styles.knobDisabled,
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 14,
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  currentLabel: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '700',
  },
  maxLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
  },
  trackWrap: {
    height: 28,
    width: '100%',
    justifyContent: 'center',
  },
  trackWrapDisabled: {
    opacity: 0.5,
  },
  trackBase: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
  },
  trackFill: {
    position: 'absolute',
    left: 0,
    height: 8,
    borderRadius: 999,
  },
  knob: {
    position: 'absolute',
    top: '50%',
    width: 20,
    height: 20,
    borderRadius: 10,
    marginLeft: -10,
    marginTop: -10,
    borderWidth: 3,
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  knobDisabled: {
    borderColor: '#94a3b8',
  },
});