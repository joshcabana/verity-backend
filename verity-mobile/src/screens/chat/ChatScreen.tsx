import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MessageBubble from '../../components/MessageBubble';
import MessageInput from '../../components/MessageInput';
import ThemedScreen from '../../components/ThemedScreen';
import { useAuth } from '../../hooks/useAuth';
import { useWebSocket } from '../../hooks/useWebSocket';
import {
  ChatMessage,
  useChatQuery,
  useMatchRevealQuery,
  useSendMessageMutation,
} from '../../queries/useChatQuery';
import type { RootStackParamList } from '../../navigation/AppNavigator';
import { useTheme } from '../../theme/ThemeProvider';
import { lineHeights, spacing, typography } from '../../theme/tokens';
import { useQueryClient } from '@tanstack/react-query';

type ChatRouteParams = {
  matchId?: string;
};

type ChatNavigation = NativeStackNavigationProp<RootStackParamList>;

export default function ChatScreen() {
  const route = useRoute();
  const navigation = useNavigation<ChatNavigation>();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { lastMessage } = useWebSocket();

  const params = route.params as ChatRouteParams | undefined;
  const matchId = params?.matchId;

  const [limit, setLimit] = useState(50);
  const [draft, setDraft] = useState('');
  const redirectedToProfileRef = useRef(false);

  const revealQuery = useMatchRevealQuery(matchId, {
    enabled: Boolean(matchId),
  });
  const revealAcknowledged = Boolean(revealQuery.data?.revealAcknowledged);
  const { data, isFetching } = useChatQuery(matchId, limit, {
    enabled: Boolean(matchId && revealAcknowledged),
  });
  const sendMutation = useSendMessageMutation(matchId);

  const listRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    if (!matchId || !revealQuery.data || revealQuery.data.revealAcknowledged) {
      redirectedToProfileRef.current = false;
      return;
    }
    if (redirectedToProfileRef.current) {
      return;
    }
    redirectedToProfileRef.current = true;
    Alert.alert(
      'Profile reveal required',
      'Review the profile reveal before chatting.',
      [
        {
          text: 'View profile',
          onPress: () =>
            navigation.replace('MatchProfile', {
              matchId,
              partnerReveal: revealQuery.data?.partnerReveal,
            }),
        },
      ],
    );
  }, [matchId, revealQuery.data, navigation]);

  useEffect(() => {
    if (!lastMessage || !matchId || lastMessage.matchId !== matchId) {
      return;
    }
    if (!revealAcknowledged) {
      return;
    }
    queryClient.setQueriesData<ChatMessage[]>(
      { queryKey: ['chat', matchId] },
      (existing = []) => {
        if (existing.some((msg) => msg.id === lastMessage.id)) {
          return existing;
        }
        return [...existing, lastMessage];
      },
    );
  }, [lastMessage, matchId, queryClient, revealAcknowledged]);

  useEffect(() => {
    if (!revealAcknowledged || !data?.length) {
      return;
    }
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [data?.length, revealAcknowledged]);

  const handleSend = async () => {
    if (!draft.trim() || !revealAcknowledged) {
      return;
    }
    try {
      await sendMutation.mutateAsync(draft.trim());
      setDraft('');
    } catch (error) {
      if (error instanceof Error && error.message === 'REVEAL_ACK_REQUIRED') {
        navigation.replace('MatchProfile', {
          matchId,
          partnerReveal: revealQuery.data?.partnerReveal,
        });
        return;
      }
      Alert.alert('Send failed', 'Unable to send your message.');
    }
  };

  if (!matchId) {
    return (
      <ThemedScreen center>
        <Text style={styles.title}>Chat unavailable</Text>
        <Text style={styles.subtitle}>Missing match details.</Text>
      </ThemedScreen>
    );
  }

  if (revealQuery.isLoading) {
    return (
      <ThemedScreen center>
        <Text style={styles.title}>Loading profile...</Text>
        <Text style={styles.subtitle}>Preparing your match reveal.</Text>
      </ThemedScreen>
    );
  }

  if (revealQuery.isError) {
    return (
      <ThemedScreen center>
        <Text style={styles.title}>Chat unavailable</Text>
        <Text style={styles.subtitle}>We could not load this match right now.</Text>
      </ThemedScreen>
    );
  }

  if (!revealAcknowledged) {
    return (
      <ThemedScreen center>
        <Text style={styles.title}>Profile reveal required</Text>
        <Text style={styles.subtitle}>
          Review your mutual profile reveal before chatting.
        </Text>
      </ThemedScreen>
    );
  }

  return (
    <View style={styles.container}>
      <ThemedScreen style={styles.content}>
        <Text style={styles.title}>Chat</Text>
        <Text style={styles.subtitle}>
          {isFetching ? 'Loading messages...' : 'Say hello!'}
        </Text>
        <FlatList
          ref={listRef}
          data={data ?? []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MessageBubble
              text={item.text}
              isMine={item.senderId === user?.id}
              timestamp={new Date(item.createdAt).toLocaleTimeString()}
            />
          )}
          inverted
          onEndReached={() => setLimit((prev) => prev + 50)}
          onEndReachedThreshold={0.2}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No messages yet. Start the conversation!</Text>
            </View>
          }
        />
      </ThemedScreen>
      <MessageInput
        value={draft}
        onChange={setDraft}
        onSend={handleSend}
        sending={sendMutation.isPending}
        disabled={!revealAcknowledged}
      />
    </View>
  );
}

const createStyles = (colors: { background: string; text: string; muted: string; border: string }) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      flex: 1,
      paddingBottom: 0,
    },
    title: {
      fontSize: typography.lg,
      fontWeight: '700',
      color: colors.text,
      marginBottom: spacing.xs,
    },
    subtitle: {
      fontSize: typography.sm,
      color: colors.muted,
      marginBottom: spacing.md,
      lineHeight: lineHeights.base,
    },
    empty: {
      padding: spacing.lg,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: 'rgba(255,255,255,0.05)',
    },
    emptyText: {
      fontSize: typography.sm,
      color: colors.muted,
      textAlign: 'center',
    },
  });
