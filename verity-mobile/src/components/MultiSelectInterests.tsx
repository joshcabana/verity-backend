import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, typography } from '../theme/tokens';

type MultiSelectInterestsProps = {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
};

export default function MultiSelectInterests({
  options,
  selected,
  onChange,
}: MultiSelectInterestsProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const toggle = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((item) => item !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  return (
    <View style={styles.container}>
      {options.map((option) => {
        const isActive = selected.includes(option);
        return (
          <TouchableOpacity
            key={option}
            style={[styles.pill, isActive && styles.pillActive]}
            onPress={() => toggle(option)}
          >
            <Text style={[styles.pillText, isActive && styles.pillTextActive]}>
              {option}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const createStyles = (colors: {
  border: string;
  text: string;
  muted: string;
  primary: string;
  background: string;
}) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginBottom: spacing.lg,
    },
    pill: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      marginRight: spacing.sm,
      marginBottom: spacing.sm,
    },
    pillActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
    pillText: {
      fontSize: typography.xs,
      color: colors.text,
      fontWeight: '600',
    },
    pillTextActive: {
      color: '#FFFFFF',
    },
  });
