import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import PhotoCarousel from '../../components/PhotoCarousel';
import ThemedButton from '../../components/ThemedButton';
import ThemedCard from '../../components/ThemedCard';
import type { RootStackParamList } from '../../navigation/AppNavigator';
import { MatchItem, useMatchesQuery } from '../../queries/useMatchesQuery';
import { useTheme } from '../../theme/ThemeProvider';
import { lineHeights, spacing, typography } from '../../theme/tokens';

type MatchProfileParams = {
  matchId?: string;
  match?: MatchItem;
};

type MatchProfileNavigation = NativeStackNavigationProp<RootStackParamList>;

export default function MatchProfileView() {
  const route = useRoute();
  const navigation = useNavigation<MatchProfileNavigation>();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const params = route.params as MatchProfileParams | undefined;
  const { data } = useMatchesQuery();

  const match =
    params?.match ?? data?.find((item) => item.id === params?.matchId) ?? null;

  if (!match) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Match not found</Text>
        <Text style={styles.subtitle}>This profile is unavailable.</Text>
      </View>
    );
  }

  const partner = match.partner;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <PhotoCarousel photos={partner.photos ?? []} />

      <View style={styles.headerRow}>
        <Text style={styles.name}>{partner.displayName ?? 'Anonymous'}</Text>
        {partner.age ? <Text style={styles.age}>{partner.age}</Text> : null}
      </View>

      {partner.bio ? <Text style={styles.bio}>{partner.bio}</Text> : null}

      {partner.interests?.length ? (
        <ThemedCard style={styles.card}>
          <Text style={styles.sectionTitle}>Interests</Text>
          <View style={styles.tags}>
            {partner.interests.map((interest) => (
              <View key={interest} style={styles.tag}>
                <Text style={styles.tagText}>{interest}</Text>
              </View>
            ))}
          </View>
        </ThemedCard>
      ) : null}

      <ThemedButton
        label="Open chat"
        variant="primary"
        onPress={() => navigation.navigate('Chat', { matchId: match.id })}
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
    card: {
      marginBottom: spacing.lg,
    },
    sectionTitle: {
      fontSize: typography.sm,
      fontWeight: '600',
      color: colors.text,
      marginBottom: spacing.sm,
    },
    tags: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    tag: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: 999,
      backgroundColor: colors.border,
      marginRight: spacing.sm,
      marginBottom: spacing.sm,
    },
    tagText: {
      fontSize: typography.xs,
      color: colors.text,
      fontWeight: '600',
    },
  });
