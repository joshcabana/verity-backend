import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import ThemedButton from '../../components/ThemedButton';
import ThemedCard from '../../components/ThemedCard';
import { createThemedInputStyles } from '../../components/themedStyles';
import { useAuth } from '../../hooks/useAuth';
import { apiJson } from '../../services/api';
import { useTheme } from '../../theme/ThemeProvider';
import { lineHeights, spacing, typography } from '../../theme/tokens';

type UserProfileResponse = {
  id: string;
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

export default function ProfileEditScreen() {
  const navigation = useNavigation();
  const { user, token, setUser, logout } = useAuth();
  const { colors } = useTheme();

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [age, setAge] = useState(user?.age ? String(user.age) : '');
  const [gender, setGender] = useState(user?.gender ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [interests, setInterests] = useState(
    user?.interests ? user.interests.join(', ') : '',
  );
  const [saving, setSaving] = useState(false);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const inputStyles = useMemo(() => createThemedInputStyles(colors), [colors]);

  const handleSave = async () => {
    if (!displayName.trim()) {
      Alert.alert('Display name required', 'Please enter a display name.');
      return;
    }
    if (!token) {
      Alert.alert('Session expired', 'Please log in again.');
      await logout();
      return;
    }

    const payload = {
      displayName: displayName.trim(),
      age: age ? Number.parseInt(age, 10) : undefined,
      gender: gender.trim() || undefined,
      bio: bio.trim() || undefined,
      interests: interests
        ? interests
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
        : [],
    };

    setSaving(true);
    try {
      const response = await apiJson<UserProfileResponse>('/users/me', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      if (response.status === 401 || response.status === 403) {
        Alert.alert('Session expired', 'Please log in again.');
        await logout();
        return;
      }

      if (!response.ok) {
        Alert.alert('Save failed', 'Unable to update your profile right now.');
        return;
      }

      const updated = response.data;
      if (!updated?.id) {
        Alert.alert('Save failed', 'Unable to update your profile right now.');
        return;
      }

      await setUser({ ...(user ?? { id: updated.id }), ...updated });
      Alert.alert('Saved', 'Your profile has been updated.');
      navigation.goBack();
    } catch {
      Alert.alert('Network error', 'Unable to update your profile right now.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Edit Profile</Text>

      <Text style={styles.label}>Display name</Text>
      <TextInput
        style={inputStyles.input}
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="Your name"
        placeholderTextColor={colors.muted}
      />

      <Text style={styles.label}>Age</Text>
      <TextInput
        style={inputStyles.input}
        value={age}
        onChangeText={setAge}
        keyboardType="number-pad"
        placeholder="Age"
        placeholderTextColor={colors.muted}
      />

      <Text style={styles.label}>Gender</Text>
      <TextInput
        style={inputStyles.input}
        value={gender}
        onChangeText={setGender}
        placeholder="Gender"
        placeholderTextColor={colors.muted}
      />

      <Text style={styles.label}>Interests</Text>
      <TextInput
        style={inputStyles.input}
        value={interests}
        onChangeText={setInterests}
        placeholder="e.g. Travel, Music, Food"
        placeholderTextColor={colors.muted}
      />

      <Text style={styles.label}>Bio</Text>
      <TextInput
        style={[inputStyles.input, inputStyles.textArea]}
        value={bio}
        onChangeText={setBio}
        placeholder="Optional bio"
        placeholderTextColor={colors.muted}
        multiline
      />

      <ThemedCard style={styles.helperCard} padding={12}>
        <Text style={styles.helperText}>
          Photos are managed during onboarding. Full profile visibility only unlocks after a
          mutual match.
        </Text>
      </ThemedCard>

      <ThemedButton
        label={saving ? 'Saving...' : 'Save Changes'}
        onPress={handleSave}
        disabled={saving}
      />
    </ScrollView>
  );
}

const createStyles = (colors: { background: string; text: string; muted: string }) =>
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
      marginBottom: spacing.lg,
    },
    label: {
      fontSize: typography.xs,
      color: colors.muted,
      marginBottom: spacing.xs + 2,
    },
    helperCard: {
      marginBottom: spacing.lg,
    },
    helperText: {
      color: colors.muted,
      fontSize: typography.xs,
      lineHeight: lineHeights.base,
    },
  });
