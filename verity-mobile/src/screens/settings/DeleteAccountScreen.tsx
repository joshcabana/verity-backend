import React, { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import ThemedButton from '../../components/ThemedButton';
import ThemedCard from '../../components/ThemedCard';
import { createThemedInputStyles } from '../../components/themedStyles';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../theme/ThemeProvider';
import { lineHeights, spacing, typography } from '../../theme/tokens';

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? process.env.API_URL ?? 'http://localhost:3000';

export default function DeleteAccountScreen() {
  const navigation = useNavigation();
  const { token, logout } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const inputStyles = useMemo(() => createThemedInputStyles(colors), [colors]);

  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);

  const canDelete = confirmation.trim().toUpperCase() === 'DELETE';

  const handleDelete = async () => {
    if (!canDelete) {
      Alert.alert('Type DELETE', 'Please type DELETE to confirm account deletion.');
      return;
    }
    if (!token) {
      Alert.alert('Session expired', 'Please log in again.');
      await logout();
      navigation.reset({
        index: 0,
        routes: [{ name: 'Onboarding' as never }],
      });
      return;
    }

    setDeleting(true);
    try {
      const response = await fetch(`${API_URL}/users/me`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.status === 401 || response.status === 403) {
        Alert.alert('Session expired', 'Please log in again.');
        await logout();
        navigation.reset({
          index: 0,
          routes: [{ name: 'Onboarding' as never }],
        });
        return;
      }

      if (!response.ok) {
        Alert.alert('Unable to delete', 'Please try again later.');
        return;
      }

      await logout();
      navigation.reset({
        index: 0,
        routes: [{ name: 'Onboarding' as never }],
      });
    } catch {
      Alert.alert('Unable to delete', 'Please try again later.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Delete Account</Text>
        <Text style={styles.subtitle}>
          This action permanently deletes your account, history, and balance. This cannot be
          undone.
        </Text>

        <ThemedCard style={styles.card} padding={16}>
          <Text style={styles.label}>Type DELETE to confirm</Text>
          <TextInput
            style={inputStyles.input}
            value={confirmation}
            onChangeText={setConfirmation}
            autoCapitalize="characters"
            placeholder="DELETE"
            placeholderTextColor={colors.muted}
            testID="delete-account-input"
          />
          <ThemedButton
            label={deleting ? 'Deleting...' : 'Delete Account'}
            variant="danger"
            onPress={handleDelete}
            disabled={!canDelete || deleting}
            testID="confirm-delete-button"
          />
        </ThemedCard>

        <ThemedButton
          label="Cancel"
          variant="outline"
          onPress={() => navigation.goBack()}
          style={styles.cancelButton}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: { background: string; text: string; muted: string }) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: spacing.xl,
      flexGrow: 1,
    },
    title: {
      fontSize: typography.xl,
      fontWeight: '700',
      color: colors.text,
      marginBottom: spacing.md,
    },
    subtitle: {
      color: colors.muted,
      fontSize: typography.sm,
      lineHeight: lineHeights.base,
      marginBottom: spacing.xl,
    },
    card: {
      marginBottom: 16,
    },
    label: {
      color: colors.muted,
      fontSize: typography.xs,
      marginBottom: spacing.sm,
    },
    cancelButton: {
      marginTop: spacing.xs,
    },
  });
