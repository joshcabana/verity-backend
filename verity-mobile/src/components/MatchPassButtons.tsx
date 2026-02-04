import React from 'react';
import { StyleSheet, View } from 'react-native';
import ThemedButton from './ThemedButton';
import { spacing } from '../theme/tokens';

type MatchPassButtonsProps = {
  onMatch: () => void;
  onPass: () => void;
  disabled?: boolean;
  loading?: boolean;
};

export default function MatchPassButtons({
  onMatch,
  onPass,
  disabled = false,
  loading = false,
}: MatchPassButtonsProps) {
  return (
    <View style={styles.container}>
      <ThemedButton
        label={loading ? 'Submitting...' : 'Pass'}
        variant="outline"
        onPress={onPass}
        disabled={disabled || loading}
        style={[styles.button, styles.buttonSpacing]}
      />
      <ThemedButton
        label={loading ? 'Submitting...' : 'Match'}
        variant="primary"
        onPress={onMatch}
        disabled={disabled || loading}
        style={styles.button}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
  },
  button: {
    flex: 1,
  },
  buttonSpacing: {
    marginRight: spacing.sm,
  },
});
