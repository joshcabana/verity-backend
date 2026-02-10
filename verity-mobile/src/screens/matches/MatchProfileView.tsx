import React, { useMemo } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import PhotoCarousel from '../../components/PhotoCarousel';
import ThemedButton from '../../components/ThemedButton';
import type { RootStackParamList } from '../../navigation/AppNavigator';
import {
  useAcknowledgeRevealMutation,
  useMatchRevealQuery,
} from '../../queries/useChatQuery';
import { useTheme } from '../../theme/ThemeProvider';
import { lineHeights, spacing, typography } from '../../theme/tokens';
import type { PartnerReveal } from '../../types/reveal';

type MatchProfileParams = {
  matchId?: string;
  partnerReveal?: PartnerReveal;
};

type MatchProfileNavigation = NativeStackNavigationProp<RootStackParamList>;

export default function MatchProfileView() {
  const route = useRoute();
  const navigation = useNavigation<MatchProfileNavigation>();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const params = route.params as MatchProfileParams | undefined;
  const matchId = params?.matchId;
  const revealQuery = useMatchRevealQuery(matchId, {
    enabled: Boolean(matchId),
  });
  const acknowledgeRevealMutation = useAcknowledgeRevealMutation(matchId);
  const partnerReveal = revealQuery.data?.partnerReveal ?? params?.partnerReveal ?? null;

  if (!matchId) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Match not found</Text>
        <Text style={styles.subtitle}>This profile is unavailable.</Text>
      </View>
    );
  }

  if (revealQuery.isLoading && !partnerReveal) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.subtitle}>Loading profile reveal...</Text>
      </View>
    );
  }

  if (revealQuery.isError || !partnerReveal) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Profile unavailable</Text>
        <Text style={styles.subtitle}>
          We could not load this reveal right now.
        </Text>
      </View>
    );
  }

  const handleStartChat = async () => {
    try {
      if (!revealQuery.data?.revealAcknowledged) {
        await acknowledgeRevealMutation.mutateAsync();
      }
      navigation.navigate('Chat', { matchId });
    } catch {
      Alert.alert('Unable to continue', 'Please try again in a moment.');
    }
  };
  const photos = partnerReveal.primaryPhotoUrl
    ? [partnerReveal.primaryPhotoUrl]
    : [];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <PhotoCarousel photos={photos} />

      <View style={styles.headerRow}>
        <Text style={styles.name}>{partnerReveal.displayName ?? 'Anonymous'}</Text>
        {partnerReveal.age ? <Text style={styles.age}>{partnerReveal.age}</Text> : null}
      </View>

      {partnerReveal.bio ? <Text style={styles.bio}>{partnerReveal.bio}</Text> : null}

      <Text style={styles.subtitle}>
        Acknowledge this profile reveal before messaging.
      </Text>

      <ThemedButton
        label={acknowledgeRevealMutation.isPending ? 'Starting chat...' : 'Start chat'}
        variant="primary"
        onPress={handleStartChat}
        disabled={acknowledgeRevealMutation.isPending}
      />
    </ScrollView>
  );
}

const createStyles = (colors: {
  text: string;
  muted: string;
  background: string;
  card: string;
  border: string;
  primary: string;
}) =>
  StyleSheet.create({
    container: {
      padding: spacing.xl,
      backgroundColor: colors.background,
      flexGrow: 1,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
      backgroundColor: colors.background,
    },
    title: {
      fontSize: typography.lg,
      fontWeight: '700',
      color: colors.text,
      marginBottom: spacing.sm,
    },
    subtitle: {
      fontSize: typography.sm,
      color: colors.muted,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      marginBottom: spacing.sm,
    },
    name: {
      fontSize: typography.xl,
      fontWeight: '700',
      color: colors.text,
      marginRight: spacing.sm,
    },
    age: {
      fontSize: typography.md,
      color: colors.muted,
    },
    bio: {
      fontSize: typography.sm,
      color: colors.text,
      lineHeight: lineHeights.base,
      marginBottom: spacing.lg,
    },
  });
