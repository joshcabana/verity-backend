import React, { useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import ThemedButton from '../../components/ThemedButton';
import ThemedCard from '../../components/ThemedCard';
import ImagePickerComponent from '../../components/ImagePickerComponent';
import MultiSelectInterests from '../../components/MultiSelectInterests';
import { createThemedInputStyles } from '../../components/themedStyles';
import { useAuth } from '../../hooks/useAuth';
import { apiJson } from '../../services/api';
import { useTheme } from '../../theme/ThemeProvider';
import { lineHeights, spacing, typography } from '../../theme/tokens';

type UserProfilePayload = {
  id?: string;
  displayName?: string | null;
  age?: number | null;
  gender?: string | null;
  interests?: string[] | null;
  bio?: string | null;
  photos?: string[] | null;
  email?: string | null;
  phone?: string | null;
  tokenBalance?: number | null;
};

type SignupAnonymousResponse = {
  user?: UserProfilePayload;
  userId?: string;
  accessToken?: string;
};

const INTEREST_OPTIONS = [
  'Travel',
  'Music',
  'Food',
  'Fitness',
  'Art',
  'Tech',
  'Movies',
  'Gaming',
  'Outdoors',
  'Books',
];

export default function ProfileSetupScreen() {
  const navigation = useNavigation();
  const { setToken, setUser, logout } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const inputStyles = useMemo(() => createThemedInputStyles(colors), [colors]);

  const [displayName, setDisplayName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [bio, setBio] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!displayName.trim()) {
      Alert.alert('Display name required', 'Please enter a display name.');
      return;
    }

    if (age && Number.isNaN(Number.parseInt(age, 10))) {
      Alert.alert('Invalid age', 'Please enter a valid age.');
      return;
    }

    setSubmitting(true);
    try {
      const signup = await apiJson<SignupAnonymousResponse>(
        '/auth/signup-anonymous',
        { method: 'POST' },
      );

      const accessToken = signup.data?.accessToken;
      const userId = signup.data?.user?.id ?? signup.data?.userId;
      if (!signup.ok || !accessToken || !userId) {
        Alert.alert(
          'Signup failed',
          'Unable to create your account. Please try again.',
        );
        return;
      }

      await setToken(accessToken);
      await setUser({
        ...(signup.data?.user ?? {}),
        id: userId,
        displayName: displayName.trim(),
      });

      const payload = {
        displayName: displayName.trim(),
        age: age ? Number.parseInt(age, 10) : undefined,
        gender: gender.trim() || undefined,
        interests,
        photos,
        bio: bio.trim() || undefined,
      };

      const profile = await apiJson<UserProfilePayload>('/users/me', {
        method: 'PATCH',
        body: JSON.stringify(payload),
        tokenOverride: accessToken,
      });

      if (profile.status === 401 || profile.status === 403) {
        Alert.alert('Session expired', 'Please log in again.');
        await logout();
        return;
      }

      if (!profile.ok) {
        Alert.alert('Profile update failed', 'Please try again.');
        return;
      }

      await setUser({
        ...(signup.data?.user ?? {}),
        ...(profile.data ?? {}),
        id: userId,
        displayName: displayName.trim(),
      });
      navigation.getParent()?.reset({
        index: 0,
        routes: [{ name: 'Main' as never }],
      });
    } catch {
      Alert.alert(
        'Network error',
        'Unable to complete onboarding. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Set up your profile</Text>
      <Text style={styles.subtitle}>
        Your profile stays private until a mutual match. Share just enough to
        stand out.
      </Text>

      <Text style={styles.label}>Display name</Text>
      <TextInput
        style={inputStyles.input}
        placeholder="Display name"
        placeholderTextColor={colors.muted}
        value={displayName}
        onChangeText={setDisplayName}
      />

      <View style={styles.inlineRow}>
        <View style={[styles.inlineField, styles.inlineFieldSpacing]}>
          <Text style={styles.label}>Age</Text>
          <TextInput
            style={inputStyles.input}
            placeholder="Age"
            placeholderTextColor={colors.muted}
            value={age}
            keyboardType="number-pad"
            onChangeText={setAge}
          />
        </View>
        <View style={styles.inlineField}>
          <Text style={styles.label}>Gender</Text>
          <TextInput
            style={inputStyles.input}
            placeholder="Gender"
            placeholderTextColor={colors.muted}
            value={gender}
            onChangeText={setGender}
          />
        </View>
      </View>

      <Text style={styles.label}>Interests</Text>
      <MultiSelectInterests
        options={INTEREST_OPTIONS}
        selected={interests}
        onChange={setInterests}
      />

      <ThemedCard style={styles.cardSpacing}>
        <Text style={styles.sectionTitle}>Photos (up to 4)</Text>
        <ImagePickerComponent images={photos} onChange={setPhotos} max={4} />
      </ThemedCard>

      <Text style={styles.label}>Bio (optional)</Text>
      <TextInput
        style={[inputStyles.input, inputStyles.textArea]}
        placeholder="Short bio"
        placeholderTextColor={colors.muted}
        value={bio}
        onChangeText={setBio}
        multiline
      />

      <ThemedButton
        label={submitting ? 'Creating profile...' : 'Create Profile'}
        onPress={handleSubmit}
        disabled={submitting}
        testID="onboarding-submit"
      />
    </ScrollView>
  );
}

const createStyles = (colors: {
  text: string;
  muted: string;
  background: string;
}) =>
  StyleSheet.create({
    container: {
      padding: spacing.xl,
      backgroundColor: colors.background,
      flexGrow: 1,
    },
    title: {
      fontSize: typography.xl,
      fontWeight: '700',
      color: colors.text,
      marginBottom: spacing.sm,
    },
    subtitle: {
      fontSize: typography.sm,
      color: colors.muted,
      lineHeight: lineHeights.base,
      marginBottom: spacing.lg,
    },
    label: {
      fontSize: typography.xs,
      color: colors.muted,
      marginBottom: spacing.xs + 2,
    },
    sectionTitle: {
      fontSize: typography.md,
      fontWeight: '600',
      color: colors.text,
      marginBottom: spacing.sm,
    },
    cardSpacing: {
      marginBottom: spacing.lg,
    },
    inlineRow: {
      flexDirection: 'row',
    },
    inlineField: {
      flex: 1,
    },
    inlineFieldSpacing: {
      marginRight: spacing.md,
    },
  });
