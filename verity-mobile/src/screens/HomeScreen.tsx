import React, { useMemo, useState } from 'react';
import { Alert, Modal, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import GoLiveButton from '../components/GoLiveButton';
import ThemedButton from '../components/ThemedButton';
import ThemedScreen from '../components/ThemedScreen';
import TokenBalanceDisplay from '../components/TokenBalanceDisplay';
import { useAuth } from '../hooks/useAuth';
import { useTokenBalance } from '../hooks/usePurchaseTokens';
import { useQueue } from '../hooks/useQueue';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, typography } from '../theme/tokens';

export default function HomeScreen() {
  const navigation = useNavigation();
  const { user, setUser } = useAuth();
  const { colors } = useTheme();
  const { joinQueue, status, markTokenSpent } = useQueue();
  const { balance, refreshBalance, refreshing } = useTokenBalance();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [showPurchase, setShowPurchase] = useState(false);
  const [joining, setJoining] = useState(false);

  const tokenBalance = balance ?? user?.tokenBalance ?? 0;

  const handleGoLive = async () => {
    if (tokenBalance < 1) {
      setShowPurchase(true);
      return;
    }
    if (status === 'joining' || status === 'waiting') {
      navigation.navigate('Waiting' as never);
      return;
    }

    setJoining(true);
    const optimisticBalance = tokenBalance - 1;
    await setUser({ ...(user ?? { id: '' }), tokenBalance: optimisticBalance });
    markTokenSpent(true);

    try {
      await joinQueue();
      navigation.navigate('Waiting' as never);
    } catch {
      await setUser({ ...(user ?? { id: '' }), tokenBalance });
      markTokenSpent(false);
      Alert.alert('Queue unavailable', 'Unable to join the queue right now.');
    } finally {
      setJoining(false);
    }
  };

  return (
    <ThemedScreen>
      <Text style={styles.title}>Ready to meet someone?</Text>
      <Text style={styles.subtitle}>
        Go live and get matched in seconds for a quick video chat.
      </Text>

      <View style={styles.section}>
        <TokenBalanceDisplay
          balance={tokenBalance}
          subtitle="You spend 1 token per live match."
          onRefresh={refreshBalance}
          refreshing={refreshing}
        />
      </View>

      <View style={styles.section}>
        <GoLiveButton onPress={handleGoLive} loading={joining} />
      </View>

      <Modal visible={showPurchase} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Out of tokens</Text>
            <Text style={styles.modalSubtitle}>
              You need at least 1 token to go live. Purchase more to keep matching.
            </Text>
            <ThemedButton
              label="Browse token packs"
              onPress={() => {
                setShowPurchase(false);
                navigation.navigate('TokenShop' as never);
              }}
            />
            <ThemedButton
              label="Not now"
              variant="outline"
              onPress={() => setShowPurchase(false)}
              style={styles.modalButton}
            />
          </View>
        </View>
      </Modal>
    </ThemedScreen>
  );
}

const createStyles = (colors: {
  text: string;
  muted: string;
  background: string;
  card: string;
  border: string;
}) =>
  StyleSheet.create({
    title: {
      color: colors.text,
      fontSize: typography.xl,
      fontWeight: '700',
      marginBottom: spacing.sm,
    },
    subtitle: {
      color: colors.muted,
      fontSize: typography.sm,
      marginBottom: spacing.lg,
    },
    section: {
      marginBottom: spacing.lg,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
    },
    modalCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
      width: '100%',
    },
    modalTitle: {
      fontSize: typography.lg,
      fontWeight: '700',
      color: colors.text,
      marginBottom: spacing.sm,
    },
    modalSubtitle: {
      fontSize: typography.sm,
      color: colors.muted,
      marginBottom: spacing.lg,
      lineHeight: 20,
    },
    modalButton: {
      marginTop: spacing.sm,
    },
  });
