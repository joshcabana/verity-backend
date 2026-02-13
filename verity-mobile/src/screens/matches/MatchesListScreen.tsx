import React, { useEffect, useMemo } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import PhotoCarousel from '../../components/PhotoCarousel';
import ThemedCard from '../../components/ThemedCard';
import ThemedScreen from '../../components/ThemedScreen';
import { useWebSocket } from '../../hooks/useWebSocket';
import type { RootStackParamList } from '../../navigation/AppNavigator';
import { MatchItem, useMatchesQuery } from '../../queries/useMatchesQuery';
import { useTheme } from '../../theme/ThemeProvider';
import { lineHeights, spacing, typography } from '../../theme/tokens';
import type { PartnerReveal } from '../../types/reveal';

type MatchesNavigation = NativeStackNavigationProp<RootStackParamList>;

export default function MatchesListScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<MatchesNavigation>();
  const { data, isFetching } = useMatchesQuery();
  const { videoSocket } = useWebSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!videoSocket) {
      return;
    }
    const handleMutual = (payload?: {
      matchId?: string;
      id?: string;
      partnerReveal?: PartnerReveal;
    }) => {
      void queryClient.invalidateQueries({ queryKey: ['matches'] });
      const matchId = payload?.matchId ?? payload?.id;
      if (matchId) {
        navigation.navigate('MatchProfile', {
          matchId,
          partnerReveal: payload?.partnerReveal,
        });
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
        {isFetching
          ? 'Refreshing matches...'
          : 'Your mutual matches appear here.'}
      </Text>

      <FlatList
        data={data ?? []}
        keyExtractor={(item) => item.matchId}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() =>
              navigation.navigate('MatchProfile', { matchId: item.matchId })
            }
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
  const partner = match.partnerReveal;
  const photos = partner?.primaryPhotoUrl ? [partner.primaryPhotoUrl] : [];

  return (
    <ThemedCard style={styles.card}>
      <PhotoCarousel photos={photos} />
      <View style={styles.headerRow}>
        <Text style={styles.name}>{partner?.displayName ?? 'New match'}</Text>
        {partner?.age ? <Text style={styles.age}>{partner.age}</Text> : null}
      </View>
      {partner?.bio ? (
        <Text style={styles.bio}>{partner.bio}</Text>
      ) : (
        <Text style={styles.placeholder}>
          Open this match to view the profile reveal.
        </Text>
      )}
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
    placeholder: {
      fontSize: typography.sm,
      color: colors.muted,
      lineHeight: lineHeights.base,
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
