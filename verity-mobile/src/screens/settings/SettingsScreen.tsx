import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Constants from 'expo-constants';
import ThemedButton from '../../components/ThemedButton';
import ThemedCard from '../../components/ThemedCard';
import { createThemedInputStyles } from '../../components/themedStyles';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing, typography } from '../../theme/tokens';

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? process.env.API_URL ?? 'http://localhost:3000';

export default function SettingsScreen() {
  const navigation = useNavigation();
  const { user, token, logout, setUser } = useAuth();
  const { colors, mode, toggleMode } = useTheme();

  const [tokenBalance, setTokenBalance] = useState<number | null>(user?.tokenBalance ?? null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [emailInput, setEmailInput] = useState(user?.email ?? '');
  const [phoneInput, setPhoneInput] = useState(user?.phone ?? '');
  const [emailCodeInput, setEmailCodeInput] = useState('');
  const [phoneCodeInput, setPhoneCodeInput] = useState('');

  const appVersion = useMemo(
    () => Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? '1.0.0',
    [],
  );

  const authenticatedFetch = useCallback(
    async (path: string, options?: RequestInit) => {
      if (!token) {
        throw new Error('Missing auth token');
      }
      const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(options?.headers ?? {}),
        },
      });
      if (response.status === 401 || response.status === 403) {
        Alert.alert('Session expired', 'Please log in again.');
        await logout();
        return null;
      }
      return response;
    },
    [token, logout],
  );

  const fetchBalance = useCallback(async () => {
    if (!token) {
      return;
    }
    setLoadingBalance(true);
    try {
      const response = await authenticatedFetch('/tokens/balance');
      if (!response) {
        return;
      }
      const data = await response.json();
      setTokenBalance(data.tokenBalance ?? 0);
      await setUser({ ...(user ?? { id: '' }), tokenBalance: data.tokenBalance ?? 0 });
    } catch (error) {
      Alert.alert('Balance unavailable', 'Unable to refresh your token balance.');
    } finally {
      setLoadingBalance(false);
    }
  }, [authenticatedFetch, token, user, setUser]);

  useFocusEffect(
    useCallback(() => {
      void fetchBalance();
    }, [fetchBalance]),
  );

  const handleVerifyEmail = async () => {
    if (!emailInput.trim()) {
      Alert.alert('Email required', 'Enter a valid email address.');
      return;
    }
    if (!emailCodeInput.trim()) {
      Alert.alert('Code required', 'Enter the verification code for your email.');
      return;
    }
    try {
      const response = await authenticatedFetch('/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({
          email: emailInput.trim(),
          code: emailCodeInput.trim(),
        }),
      });
      if (!response) {
        return;
      }
      if (!response.ok) {
        Alert.alert('Verification failed', 'Unable to verify email right now.');
        return;
      }
      const updated = await response.json();
      await setUser({ ...(user ?? { id: updated.id }), email: updated.email });
      Alert.alert('Email verified', 'Your email has been saved.');
    } catch {
      Alert.alert('Verification failed', 'Unable to verify email right now.');
    }
  };

  const handleVerifyPhone = async () => {
    if (!phoneInput.trim()) {
      Alert.alert('Phone required', 'Enter a valid phone number.');
      return;
    }
    if (!phoneCodeInput.trim()) {
      Alert.alert('Code required', 'Enter the verification code for your phone.');
      return;
    }
    try {
      const response = await authenticatedFetch('/auth/verify-phone', {
        method: 'POST',
        body: JSON.stringify({
          phone: phoneInput.trim(),
          code: phoneCodeInput.trim(),
        }),
      });
      if (!response) {
        return;
      }
      if (!response.ok) {
        Alert.alert('Verification failed', 'Unable to verify phone right now.');
        return;
      }
      const updated = await response.json();
      await setUser({ ...(user ?? { id: updated.id }), phone: updated.phone });
      Alert.alert('Phone verified', 'Your phone number has been saved.');
    } catch {
      Alert.alert('Verification failed', 'Unable to verify phone right now.');
    }
  };

  const handleLogout = async () => {
    await logout();
    navigation.reset({
      index: 0,
      routes: [{ name: 'Onboarding' as never }],
    });
  };

  const styles = useMemo(() => createStyles(colors), [colors]);
  const inputStyles = useMemo(() => createThemedInputStyles(colors), [colors]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Settings</Text>

      <ThemedCard style={styles.cardSpacing}>
        <Text style={styles.sectionTitle}>Profile</Text>
        <Text style={styles.label}>Display name</Text>
        <Text style={styles.value}>{user?.displayName ?? 'Anonymous'}</Text>
        <ThemedButton
          label="Edit Profile"
          onPress={() => navigation.navigate('ProfileEdit' as never)}
        />
      </ThemedCard>

      <ThemedCard style={styles.cardSpacing}>
        <Text style={styles.sectionTitle}>Token Balance</Text>
        <Text style={styles.value}>
          {loadingBalance ? 'Refreshing...' : `${tokenBalance ?? 0} tokens`}
        </Text>
        <ThemedButton
          label="Refresh Balance"
          variant="secondary"
          onPress={fetchBalance}
          style={styles.buttonSpacing}
        />
      </ThemedCard>

      <ThemedCard style={styles.cardSpacing}>
        <Text style={styles.sectionTitle}>Verification</Text>
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={[inputStyles.input, styles.inputSpacing]}
          value={emailInput}
          onChangeText={setEmailInput}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@email.com"
          placeholderTextColor={colors.muted}
        />
        <TextInput
          style={[inputStyles.input, styles.inputSpacing]}
          value={emailCodeInput}
          onChangeText={setEmailCodeInput}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Email verification code"
          placeholderTextColor={colors.muted}
        />
        <ThemedButton
          label="Verify Email"
          variant="secondary"
          onPress={handleVerifyEmail}
          style={styles.buttonSpacing}
        />

        <Text style={styles.label}>Phone</Text>
        <TextInput
          style={[inputStyles.input, styles.inputSpacing]}
          value={phoneInput}
          onChangeText={setPhoneInput}
          keyboardType="phone-pad"
          placeholder="+1 555 555 5555"
          placeholderTextColor={colors.muted}
        />
        <TextInput
          style={[inputStyles.input, styles.inputSpacing]}
          value={phoneCodeInput}
          onChangeText={setPhoneCodeInput}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Phone verification code"
          placeholderTextColor={colors.muted}
        />
        <ThemedButton label="Verify Phone" variant="secondary" onPress={handleVerifyPhone} />
      </ThemedCard>

      <ThemedCard style={styles.cardSpacing}>
        <Text style={styles.sectionTitle}>Privacy</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Dark mode</Text>
          <Switch
            value={mode === 'dark'}
            onValueChange={toggleMode}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={mode === 'dark' ? colors.card : colors.background}
          />
        </View>
        <ThemedButton
          label="Privacy Controls"
          variant="secondary"
          onPress={() => Alert.alert('Privacy', 'More controls coming soon.')}
          style={styles.buttonSpacing}
        />
        <ThemedButton
          label="Report / Block"
          variant="secondary"
          onPress={() => Alert.alert('Report/Block', 'Report & block flow coming soon.')}
        />
      </ThemedCard>

      <ThemedCard style={styles.cardSpacing}>
        <Text style={styles.sectionTitle}>Account</Text>
        <ThemedButton
          label="Log out"
          variant="danger"
          onPress={handleLogout}
          style={styles.buttonSpacing}
        />
        <ThemedButton
          label="Delete Account"
          variant="dangerOutline"
          onPress={() => navigation.navigate('DeleteAccount' as never)}
        />
      </ThemedCard>

      <Text style={styles.footer}>Version {appVersion}</Text>
    </ScrollView>
  );
}

const createStyles = (colors: {
  background: string;
  card: string;
  text: string;
  muted: string;
  border: string;
  primary: string;
  danger: string;
  dangerSoft: string;
}) =>
  StyleSheet.create({
    container: {
      padding: spacing.xl,
      paddingBottom: spacing.xxxl,
      backgroundColor: colors.background,
      flexGrow: 1,
    },
    title: {
      fontSize: typography.xxl,
      fontWeight: '700',
      color: colors.text,
      marginBottom: spacing.lg,
    },
    sectionTitle: {
      fontSize: typography.md,
      fontWeight: '600',
      color: colors.text,
      marginBottom: spacing.md,
    },
    label: {
      fontSize: typography.xs,
      color: colors.muted,
      marginBottom: spacing.xs + 2,
    },
    value: {
      fontSize: typography.md,
      color: colors.text,
      marginBottom: spacing.md,
    },
    inputSpacing: {
      marginBottom: spacing.sm + 2,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    cardSpacing: {
      marginBottom: spacing.lg,
    },
    footer: {
      textAlign: 'center',
      color: colors.muted,
      marginTop: spacing.md,
    },
    buttonSpacing: {
      marginBottom: spacing.sm,
    },
  });
