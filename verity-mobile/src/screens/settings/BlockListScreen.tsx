import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import ThemedButton from '../../components/ThemedButton';
import ThemedCard from '../../components/ThemedCard';
import { useAuth } from '../../hooks/useAuth';
import { apiJson } from '../../services/api';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing, typography } from '../../theme/tokens';

type BlockItem = {
  id: string;
  blockedUserId: string;
  createdAt: string;
};

export default function BlockListScreen() {
  const navigation = useNavigation();
  const { logout } = useAuth();
  const { colors } = useTheme();

  const [blocks, setBlocks] = useState<BlockItem[]>([]);
  const [loading, setLoading] = useState(true);

  const styles = useMemo(() => createStyles(colors), [colors]);

  const fetchBlocks = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiJson<BlockItem[]>('/moderation/blocks');

      if (response.status === 401 || response.status === 403) {
        Alert.alert('Session expired', 'Please log in again.');
        await logout();
        return;
      }

      if (response.ok && Array.isArray(response.data)) {
        setBlocks(response.data);
      }
    } catch {
      Alert.alert('Error', 'Unable to load blocked users.');
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useFocusEffect(
    useCallback(() => {
      void fetchBlocks();
    }, [fetchBlocks]),
  );

  const handleUnblock = (blockedUserId: string) => {
    Alert.alert(
      'Unblock user?',
      'They will be able to see and match with you again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                const response = await apiJson(
                  `/moderation/blocks/${blockedUserId}`,
                  {
                    method: 'DELETE',
                  },
                );

                if (response.ok) {
                  setBlocks((prev) =>
                    prev.filter(
                      (b) => b.blockedUserId !== blockedUserId,
                    ),
                  );
                } else {
                  Alert.alert('Error', 'Unable to unblock user.');
                }
              } catch {
                Alert.alert('Error', 'Unable to unblock user.');
              }
            })();
          },
        },
      ],
    );
  };

  const renderItem = ({ item }: { item: BlockItem }) => (
    <ThemedCard style={styles.blockItem}>
      <View style={styles.blockRow}>
        <View style={styles.blockInfo}>
          <Text style={styles.userId}>{item.blockedUserId}</Text>
          <Text style={styles.date}>
            Blocked {new Date(item.createdAt).toLocaleDateString()}
          </Text>
        </View>
        <ThemedButton
          label="Unblock"
          variant="dangerOutline"
          onPress={() => void handleUnblock(item.blockedUserId)}
          testID={`unblock-${item.blockedUserId}`}
        />
      </View>
    </ThemedCard>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Blocked Users</Text>

      {loading ? (
        <ActivityIndicator
          size="large"
          color={colors.primary}
          style={styles.loader}
          testID="block-list-loader"
        />
      ) : blocks.length === 0 ? (
        <ThemedCard style={styles.cardSpacing}>
          <Text style={styles.emptyText}>No blocked users.</Text>
        </ThemedCard>
      ) : (
        <FlatList
          data={blocks}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          onRefresh={fetchBlocks}
          refreshing={loading}
          contentContainerStyle={styles.listContent}
          testID="block-list"
        />
      )}

      <ThemedButton
        label="Back"
        variant="secondary"
        onPress={() => navigation.goBack()}
        style={styles.backButton}
      />
    </View>
  );
}

const createStyles = (colors: {
  background: string;
  text: string;
  muted: string;
  primary: string;
}) =>
  StyleSheet.create({
    container: {
      flex: 1,
      padding: spacing.xl,
      paddingBottom: spacing.xxxl,
      backgroundColor: colors.background,
    },
    title: {
      fontSize: typography.xxl,
      fontWeight: '700',
      color: colors.text,
      marginBottom: spacing.lg,
    },
    cardSpacing: {
      marginBottom: spacing.lg,
    },
    loader: {
      marginTop: spacing.xxl,
    },
    listContent: {
      gap: spacing.sm,
    },
    blockItem: {
      marginBottom: spacing.sm,
    },
    blockRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    blockInfo: {
      flex: 1,
      marginRight: spacing.md,
    },
    userId: {
      fontSize: typography.sm,
      fontWeight: '600',
      color: colors.text,
    },
    date: {
      fontSize: typography.xs,
      color: colors.muted,
      marginTop: 2,
    },
    emptyText: {
      textAlign: 'center',
      color: colors.muted,
      fontSize: typography.sm,
    },
    backButton: {
      marginTop: spacing.lg,
    },
  });
