import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import MessageBubble from '../../components/MessageBubble';
import MessageInput from '../../components/MessageInput';
import ThemedScreen from '../../components/ThemedScreen';
import { useAuth } from '../../hooks/useAuth';
import { useWebSocket } from '../../hooks/useWebSocket';
import { ChatMessage, useChatQuery, useSendMessageMutation } from '../../queries/useChatQuery';
import { useTheme } from '../../theme/ThemeProvider';
import { lineHeights, spacing, typography } from '../../theme/tokens';
import { useQueryClient } from '@tanstack/react-query';

type ChatRouteParams = {
  matchId?: string;
};

export default function ChatScreen() {
  const route = useRoute();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { lastMessage } = useWebSocket();

  const params = route.params as ChatRouteParams | undefined;
  const matchId = params?.matchId;

  const [limit, setLimit] = useState(50);
  const [draft, setDraft] = useState('');

  const { data, isFetching } = useChatQuery(matchId, limit);
  const sendMutation = useSendMessageMutation(matchId);

  const listRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    if (!lastMessage || !matchId || lastMessage.matchId !== matchId) {
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
  }, [lastMessage, matchId, queryClient]);

  useEffect(() => {
    if (!data?.length) {
      return;
    }
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [data?.length]);

  const handleSend = async () => {
    if (!draft.trim()) {
      return;
    }
    try {
      await sendMutation.mutateAsync(draft.trim());
      setDraft('');
    } catch {
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
        sending={sendMutation.isLoading}
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
