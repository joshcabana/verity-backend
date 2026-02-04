import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, typography } from '../theme/tokens';

type MessageBubbleProps = {
  text: string;
  isMine: boolean;
  timestamp?: string;
};

export default function MessageBubble({ text, isMine, timestamp }: MessageBubbleProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.row, isMine ? styles.rowMine : styles.rowTheirs]}>
      <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
        <Text style={[styles.text, isMine ? styles.textMine : styles.textTheirs]}>
          {text}
        </Text>
      </View>
      {timestamp ? <Text style={styles.time}>{timestamp}</Text> : null}
    </View>
  );
}

const createStyles = (colors: {
  text: string;
  muted: string;
  primary: string;
  card: string;
}) =>
  StyleSheet.create({
    row: {
      marginBottom: spacing.sm,
      maxWidth: '80%',
    },
    rowMine: {
      alignSelf: 'flex-end',
    },
    rowTheirs: {
      alignSelf: 'flex-start',
    },
    bubble: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: 16,
    },
    bubbleMine: {
      backgroundColor: colors.primary,
      borderTopRightRadius: 4,
    },
    bubbleTheirs: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 4,
    },
    text: {
      fontSize: typography.sm,
    },
    textMine: {
      color: '#FFFFFF',
    },
    textTheirs: {
      color: colors.text,
    },
    time: {
      fontSize: typography.xs,
      color: colors.muted,
      marginTop: spacing.xs,
      alignSelf: 'flex-end',
    },
  });
