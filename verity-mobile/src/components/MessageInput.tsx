import React, { useMemo } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import ThemedButton from './ThemedButton';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, typography } from '../theme/tokens';

type MessageInputProps = {
  value: string;
  onChange: (text: string) => void;
  onSend: () => void;
  disabled?: boolean;
  sending?: boolean;
};

export default function MessageInput({
  value,
  onChange,
  onSend,
  disabled = false,
  sending = false,
}: MessageInputProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder="Type a message"
        placeholderTextColor={colors.muted}
        editable={!disabled}
      />
      <ThemedButton
        label={sending ? '...' : 'Send'}
        onPress={onSend}
        disabled={disabled || sending || !value.trim()}
        style={styles.button}
      />
    </View>
  );
}

const createStyles = (colors: {
  background: string;
  border: string;
  text: string;
  muted: string;
}) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
    },
    input: {
      flex: 1,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      color: colors.text,
      fontSize: typography.sm,
      marginRight: spacing.sm,
    },
    button: {
      minWidth: 80,
    },
  });
