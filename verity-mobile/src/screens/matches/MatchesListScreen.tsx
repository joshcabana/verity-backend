import React, { useEffect, useMemo } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import PhotoCarousel from '../../components/PhotoCarousel';
import ThemedCard from '../../components/ThemedCard';
import ThemedScreen from '../../components/ThemedScreen';
import { useWebSocket } from '../../hooks/useWebSocket';
import { MatchItem, useMatchesQuery } from '../../queries/useMatchesQuery';
import { useTheme } from '../../theme/ThemeProvider';
import { lineHeights, spacing, typography } from '../../theme/tokens';

export default function MatchesListScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation();
  const { data, isFetching } = useMatchesQuery();
  const { videoSocket } = useWebSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!videoSocket) {
      return;
    }
    const handleMutual = (payload?: { matchId?: string; id?: string }) => {
      void queryClient.invalidateQueries({ queryKey: ['matches'] });
      const matchId = payload?.matchId ?? payload?.id;
      if (matchId) {
        navigation.navigate('Chat' as never, { matchId } as never);
      }
    };
    videoSocket.on('match:mutual', handleMutual);
    return () => {
      videoSocket.off('match:mutual', handleMutual);
    };
  }, [videoSocket, navigation, queryClient]);

  return (
    <ThemedScreen>
      <Text style={styles.title}>Matches</Text>
      <Text style={styles.subtitle}>
        {isFetching ? 'Refreshing matches...' : 'Your mutual matches appear here.'}
      </Text>

      <FlatList
        data={data ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => navigation.navigate('Chat' as never, { matchId: item.id } as never)}
          >
            <MatchCard match={item} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              No matches yet. Go live to meet someone new.
            </Text>
          </View>
        }
      />
    </ThemedScreen>
  );
}

function MatchCard({ match }: { match: MatchItem }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const partner = match.partner;

  return (
    <ThemedCard style={styles.card}>
      <PhotoCarousel photos={partner.photos ?? []} />
      <View style={styles.headerRow}>
        <Text style={styles.name}>{partner.displayName ?? 'Anonymous'}</Text>
        {partner.age ? <Text style={styles.age}>{partner.age}</Text> : null}
      </View>
      {partner.bio ? <Text style={styles.bio}>{partner.bio}</Text> : null}
      {partner.interests?.length ? (
        <View style={styles.tags}>
          {partner.interests.map((interest) => (
            <View key={interest} style={styles.tag}>
              <Text style={styles.tagText}>{interest}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </ThemedCard>
  );
}

const createStyles = (colors: {
  background: string;
  text: string;
  muted: string;
  border: string;
  card: string;
}) =>
  StyleSheet.create({
    title: {
      fontSize: typography.xl,
      fontWeight: '700',
      color: colors.text,
      marginBottom: spacing.sm,
    },
    subtitle: {
      color: colors.muted,
      fontSize: typography.sm,
      marginBottom: spacing.lg,
    },
    card: {
      marginBottom: spacing.lg,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      marginBottom: spacing.xs,
    },
    name: {
      fontSize: typography.lg,
      fontWeight: '700',
      color: colors.text,
      marginRight: spacing.sm,
    },
    age: {
      fontSize: typography.sm,
      color: colors.muted,
    },
    bio: {
      fontSize: typography.sm,
      color: colors.text,
      lineHeight: lineHeights.base,
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
    empty: {
      padding: spacing.lg,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    emptyText: {
      color: colors.muted,
      fontSize: typography.sm,
      textAlign: 'center',
    },
  });
