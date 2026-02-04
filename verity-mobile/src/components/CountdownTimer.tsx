import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, typography } from '../theme/tokens';

type CountdownTimerProps = {
  durationSeconds: number;
  isActive: boolean;
  onComplete: () => void;
  testID?: string;
};

export default function CountdownTimer({
  durationSeconds,
  isActive,
  onComplete,
  testID,
}: CountdownTimerProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [remaining, setRemaining] = useState(durationSeconds);
  const completedRef = useRef(false);

  useEffect(() => {
    setRemaining(durationSeconds);
    completedRef.current = false;
  }, [durationSeconds]);

  useEffect(() => {
    if (!isActive) {
      return;
    }
    if (remaining <= 0) {
      if (!completedRef.current) {
        completedRef.current = true;
        onComplete();
      }
      return;
    }
    const timer = setInterval(() => {
      setRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [isActive, remaining, onComplete]);

  const progress = Math.max(0, remaining) / durationSeconds;
  const size = 120;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <View style={styles.container} testID={testID}>
      <Svg width={size} height={size}>
        <Circle
          stroke="rgba(255,255,255,0.15)"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          stroke={colors.primary}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </Svg>
      <View style={styles.center}>
        <Text style={styles.label}>Time</Text>
        <Text style={styles.value}>{Math.max(0, remaining)}s</Text>
      </View>
    </View>
  );
}

const createStyles = (colors: { text: string; muted: string }) =>
  StyleSheet.create({
    container: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    center: {
      position: 'absolute',
      alignItems: 'center',
    },
    label: {
      fontSize: typography.xs,
      color: colors.muted,
    },
    value: {
      fontSize: typography.lg,
      fontWeight: '700',
      color: colors.text,
      marginTop: spacing.xs,
    },
  });
