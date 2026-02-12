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
import { createThemedInputStyles } from '../../components/themedStyles';
import { useAuth } from '../../hooks/useAuth';
import { apiJson } from '../../services/api';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing, typography } from '../../theme/tokens';

const REPORT_REASONS = [
  'Inappropriate behaviour',
  'Harassment or bullying',
  'Spam or scam',
  'Underage user',
  'Other',
] as const;

export default function ReportScreen() {
  const navigation = useNavigation();
  const { logout } = useAuth();
  const { colors } = useTheme();

  const [reportedUserId, setReportedUserId] = useState('');
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const styles = useMemo(() => createStyles(colors), [colors]);
  const inputStyles = useMemo(() => createThemedInputStyles(colors), [colors]);

  const handleSubmit = async () => {
    if (!reportedUserId.trim()) {
      Alert.alert('User ID required', 'Enter the ID of the user to report.');
      return;
    }
    if (!selectedReason) {
      Alert.alert('Reason required', 'Select a reason for the report.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await apiJson('/moderation/reports', {
        method: 'POST',
        body: JSON.stringify({
          reportedUserId: reportedUserId.trim(),
          reason: selectedReason,
          details: details.trim() || undefined,
        }),
      });

      if (response.status === 401 || response.status === 403) {
        Alert.alert('Session expired', 'Please log in again.');
        await logout();
        return;
      }

      if (!response.ok) {
        Alert.alert(
          'Report failed',
          'Unable to submit report. Please try again.',
        );
        return;
      }

      Alert.alert(
        'Report submitted',
        'Thank you. We will review this shortly.',
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch {
      Alert.alert(
        'Report failed',
        'Unable to submit report. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Report a User</Text>

      <ThemedCard style={styles.cardSpacing}>
        <Text style={styles.label}>User ID</Text>
        <TextInput
          style={[inputStyles.input, styles.inputSpacing]}
          value={reportedUserId}
          onChangeText={setReportedUserId}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Paste user ID"
          placeholderTextColor={colors.muted}
          testID="report-user-id"
        />

        <Text style={styles.label}>Reason</Text>
        <View style={styles.reasonGroup}>
          {REPORT_REASONS.map((reason) => (
            <ThemedButton
              key={reason}
              label={reason}
              variant={selectedReason === reason ? 'primary' : 'secondary'}
              onPress={() => setSelectedReason(reason)}
              style={styles.reasonButton}
              testID={`reason-${reason.toLowerCase().replace(/\s+/g, '-')}`}
            />
          ))}
        </View>

        <Text style={styles.label}>Additional details (optional)</Text>
        <TextInput
          style={[inputStyles.input, styles.textArea]}
          value={details}
          onChangeText={setDetails}
          multiline
          numberOfLines={4}
          placeholder="Describe what happened..."
          placeholderTextColor={colors.muted}
          testID="report-details"
        />

        <ThemedButton
          label={submitting ? 'Submitting...' : 'Submit Report'}
          onPress={() => void handleSubmit()}
          disabled={submitting}
          testID="report-submit"
        />
      </ThemedCard>

      <ThemedButton
        label="Cancel"
        variant="secondary"
        onPress={() => navigation.goBack()}
        style={styles.cardSpacing}
      />
    </ScrollView>
  );
}

const createStyles = (colors: {
  background: string;
  text: string;
  muted: string;
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
    label: {
      fontSize: typography.xs,
      color: colors.muted,
      marginBottom: spacing.xs + 2,
    },
    cardSpacing: {
      marginBottom: spacing.lg,
    },
    inputSpacing: {
      marginBottom: spacing.md,
    },
    textArea: {
      marginBottom: spacing.md,
      minHeight: 100,
      textAlignVertical: 'top',
    },
    reasonGroup: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
      marginBottom: spacing.md,
    },
    reasonButton: {
      marginBottom: spacing.xs,
    },
  });
