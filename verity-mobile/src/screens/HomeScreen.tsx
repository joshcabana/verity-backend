import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Keyboard,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GoLiveButton from '../components/GoLiveButton';
import ThemedButton from '../components/ThemedButton';
import TokenBalanceDisplay from '../components/TokenBalanceDisplay';
import { useAuth } from '../hooks/useAuth';
import { useTokenBalance } from '../hooks/usePurchaseTokens';
import { useQueue } from '../hooks/useQueue';
import { useTheme } from '../theme/ThemeProvider';
import {
  fontFamilies,
  lineHeights,
  spacing,
  typography,
} from '../theme/tokens';

const DEFAULT_QUEUE_REGION =
  process.env.EXPO_PUBLIC_QUEUE_REGION ?? process.env.QUEUE_REGION ?? 'au';

export default function HomeScreen() {
  const navigation = useNavigation();
  const { user, setUser } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { joinQueue, status, markTokenSpent } = useQueue();
  const { balance, refreshBalance, refreshing } = useTokenBalance();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [showPurchase, setShowPurchase] = useState(false);
  const [joining, setJoining] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [dockVisible, setDockVisible] = useState(true);

  const tokenBalance = balance ?? user?.tokenBalance ?? 0;

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () =>
      setDockVisible(false),
    );
    const hideSub = Keyboard.addListener('keyboardDidHide', () =>
      setDockVisible(true),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

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
      await joinQueue(DEFAULT_QUEUE_REGION);
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
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 180 + Math.max(insets.bottom, spacing.md) },
        ]}
        onScroll={(event) =>
          setScrolled(event.nativeEvent.contentOffset.y > 16)
        }
        scrollEventThrottle={16}
      >
        <View
          style={[
            styles.topRail,
            scrolled && styles.topRailScrolled,
            { marginTop: insets.top > 0 ? insets.top : spacing.md },
          ]}
        >
          <Text style={styles.wordmark}>VERITY</Text>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={refreshBalance}
            style={styles.topRailAction}
          >
            <Text style={styles.topRailActionText}>
              {refreshing ? 'Refreshing...' : `Tokens: ${tokenBalance}`}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>LIVE VIDEO SPEED DATING</Text>
          <Text style={styles.heroTitle}>Meet first. Reveal later.</Text>
          <Text style={styles.heroSubtitle}>
            45 seconds. Real chemistry. No swiping.
          </Text>
          <View style={styles.heroVisual} accessible={false}>
            <View style={[styles.ring, styles.ringLarge]} />
            <View style={[styles.ring, styles.ringSmall]} />
            <View style={styles.heroPulse} />
            <View style={[styles.orbit, styles.orbitOne]} />
            <View style={[styles.orbit, styles.orbitTwo]} />
          </View>
        </View>

        <View style={[styles.panelCard, styles.section]}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>
              Ready for your next 45 seconds?
            </Text>
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>Live in Canberra</Text>
            </View>
          </View>
          <Text style={styles.bodyText}>
            1 token starts a live intro. If no match forms, your token is
            returned.
          </Text>
          <View style={styles.balanceRow}>
            <Text style={styles.metaText}>Token balance</Text>
            <Text style={styles.balanceValue}>{tokenBalance}</Text>
          </View>
          <GoLiveButton onPress={handleGoLive} loading={joining} />
          <ThemedButton
            label="How Matching Works"
            variant="outline"
            onPress={() =>
              Alert.alert(
                'How it works',
                'Go live, chat for 45 seconds, then choose MATCH or PASS privately.',
              )
            }
            style={styles.secondaryButton}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.trustStrip}
          style={styles.section}
        >
          {['Unrecorded Calls', 'Mutual Reveal Only', 'Report in One Tap'].map(
            (item) => (
              <View key={item} style={styles.trustChip}>
                <View style={styles.trustDot} />
                <Text style={styles.trustChipText}>{item}</Text>
              </View>
            ),
          )}
        </ScrollView>

        <View style={[styles.panelCard, styles.section]}>
          <Text style={styles.panelTitle}>How it works</Text>
          {[
            ['1 — Go Live', 'Join instantly. No browsing profiles.'],
            ['2 — 45-Second Call', 'Talk face-to-face in a timed live intro.'],
            [
              '3 — Match or Pass',
              'Only mutual matches reveal identity and unlock chat.',
            ],
          ].map(([title, body]) => (
            <View key={title} style={styles.stepCard}>
              <Text style={styles.stepTitle}>{title}</Text>
              <Text style={styles.stepBody}>{body}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.panelCard, styles.section]}>
          <Text style={styles.panelTitle}>Private by design.</Text>
          <Text style={styles.bodyText}>
            No profile reveal before the call. No replay culture.
          </Text>
          <View style={styles.actionGrid}>
            <ThemedButton
              label="Block"
              variant="outline"
              onPress={() => navigation.navigate('BlockList' as never)}
            />
            <ThemedButton
              label="Report"
              variant="outline"
              onPress={() => navigation.navigate('Report' as never)}
            />
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => navigation.navigate('Settings' as never)}
          >
            <Text style={styles.supportLink}>Safety Standards</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.panelCard, styles.section]}>
          <Text style={styles.panelTitle}>Stay in the flow.</Text>
          <Text style={styles.bodyText}>
            Top up tokens anytime. Start calls in one tap.
          </Text>
          <ThemedButton
            label="View Token Packs"
            onPress={() => navigation.navigate('TokenShop' as never)}
            style={styles.secondaryButton}
          />
          <TokenBalanceDisplay
            balance={tokenBalance}
            subtitle="Refresh your balance before going live."
            onRefresh={refreshBalance}
            refreshing={refreshing}
          />
        </View>
      </ScrollView>

      {dockVisible && (
        <View
          style={[
            styles.bottomDock,
            { paddingBottom: Math.max(insets.bottom, spacing.md) },
          ]}
        >
          <GoLiveButton onPress={handleGoLive} loading={joining} />
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() =>
              Alert.alert(
                'How matching works',
                'Go live, complete your 45-second call, then choose MATCH or PASS privately.',
              )
            }
          >
            <Text style={styles.signInText}>How Matching Works</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={showPurchase} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Out of tokens</Text>
            <Text style={styles.modalSubtitle}>
              You need at least 1 token to go live. Purchase more to keep
              matching.
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
    </View>
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
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
    },
    section: {
      marginTop: spacing.lg,
    },
    topRail: {
      minHeight: 72,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: 'rgba(0,0,0,0.35)',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    topRailScrolled: {
      backgroundColor: 'rgba(0,0,0,0.72)',
    },
    wordmark: {
      color: colors.text,
      fontFamily: fontFamilies.display,
      letterSpacing: 3,
      fontSize: typography.lg,
    },
    topRailAction: {
      borderWidth: 1,
      borderColor: '#D4AF37',
      borderRadius: 999,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 2,
      backgroundColor: 'rgba(212,175,55,0.08)',
    },
    topRailActionText: {
      color: colors.text,
      fontFamily: fontFamilies.bodySemibold,
      fontSize: typography.xs,
      letterSpacing: 0.7,
      textTransform: 'uppercase',
    },
    heroCard: {
      minHeight: 320,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: '#0B0B0B',
      padding: spacing.xl,
      marginTop: spacing.lg,
    },
    eyebrow: {
      color: '#F1D77A',
      fontFamily: fontFamilies.bodySemibold,
      fontSize: typography.xs,
      letterSpacing: 1.8,
      textTransform: 'uppercase',
      marginBottom: spacing.md,
    },
    heroTitle: {
      color: colors.text,
      fontFamily: fontFamilies.display,
      fontSize: typography.hero,
      lineHeight: 40,
      marginBottom: spacing.sm,
    },
    heroSubtitle: {
      color: colors.muted,
      fontFamily: fontFamilies.body,
      fontSize: typography.md,
      lineHeight: lineHeights.base,
      marginBottom: spacing.lg,
    },
    heroVisual: {
      flex: 1,
      minHeight: 140,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: '#3B3215',
      backgroundColor: '#080808',
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    ring: {
      position: 'absolute',
      borderRadius: 999,
      borderWidth: 1,
      borderColor: '#F1D77A',
    },
    ringLarge: {
      width: 190,
      height: 190,
      opacity: 0.7,
    },
    ringSmall: {
      width: 120,
      height: 120,
      opacity: 0.85,
    },
    heroPulse: {
      width: 14,
      height: 14,
      borderRadius: 999,
      backgroundColor: '#D4AF37',
      shadowColor: '#D4AF37',
      shadowOpacity: 0.45,
      shadowOffset: { width: 0, height: 0 },
      shadowRadius: 10,
      elevation: 8,
    },
    orbit: {
      position: 'absolute',
      width: 9,
      height: 9,
      borderRadius: 999,
      backgroundColor: '#F1D77A',
    },
    orbitOne: {
      top: '30%',
      right: '26%',
    },
    orbitTwo: {
      bottom: '28%',
      left: '28%',
    },
    panelCard: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: spacing.lg,
    },
    panelHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.md,
      marginBottom: spacing.sm,
    },
    panelTitle: {
      color: colors.text,
      fontFamily: fontFamilies.bodyBold,
      fontSize: typography.xl,
      lineHeight: 28,
    },
    bodyText: {
      color: colors.muted,
      fontFamily: fontFamilies.body,
      fontSize: typography.md,
      lineHeight: lineHeights.base,
    },
    statusPill: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: '#4A3A10',
      backgroundColor: 'rgba(212,175,55,0.12)',
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.xs + 1,
    },
    statusPillText: {
      color: colors.text,
      fontFamily: fontFamilies.bodySemibold,
      fontSize: typography.xs,
      textTransform: 'uppercase',
      letterSpacing: 0.7,
    },
    balanceRow: {
      marginVertical: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    metaText: {
      color: colors.muted,
      fontFamily: fontFamilies.bodyMedium,
      fontSize: typography.sm,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    balanceValue: {
      color: colors.text,
      fontFamily: fontFamilies.monoBold,
      fontSize: typography.lg,
    },
    secondaryButton: {
      marginTop: spacing.sm,
    },
    trustStrip: {
      gap: spacing.sm + 2,
      paddingRight: spacing.md,
    },
    trustChip: {
      minHeight: 56,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: '#121212',
      paddingHorizontal: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      marginRight: spacing.sm,
    },
    trustDot: {
      width: 8,
      height: 8,
      borderRadius: 999,
      backgroundColor: '#D4AF37',
      marginRight: spacing.sm,
    },
    trustChipText: {
      color: colors.text,
      fontFamily: fontFamilies.bodyMedium,
      fontSize: typography.sm,
      letterSpacing: 0.2,
    },
    stepCard: {
      marginTop: spacing.md,
      borderWidth: 1,
      borderColor: '#3B3215',
      borderRadius: 14,
      backgroundColor: 'rgba(212,175,55,0.05)',
      padding: spacing.md,
    },
    stepTitle: {
      color: colors.text,
      fontFamily: fontFamilies.bodySemibold,
      fontSize: typography.lg,
      marginBottom: spacing.xs,
    },
    stepBody: {
      color: colors.muted,
      fontFamily: fontFamilies.body,
      fontSize: typography.sm,
      lineHeight: lineHeights.base,
    },
    actionGrid: {
      marginTop: spacing.md,
      flexDirection: 'row',
      gap: spacing.sm,
    },
    supportLink: {
      marginTop: spacing.md,
      color: '#F1D77A',
      fontFamily: fontFamilies.bodySemibold,
      fontSize: typography.sm,
      letterSpacing: 0.3,
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
      fontFamily: fontFamilies.bodyBold,
      color: colors.text,
      marginBottom: spacing.sm,
    },
    modalSubtitle: {
      fontSize: typography.md,
      fontFamily: fontFamilies.body,
      color: colors.muted,
      marginBottom: spacing.lg,
      lineHeight: lineHeights.base,
    },
    modalButton: {
      marginTop: spacing.sm,
    },
    bottomDock: {
      position: 'absolute',
      left: spacing.lg,
      right: spacing.lg,
      bottom: spacing.md,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: 'rgba(0,0,0,0.82)',
      padding: spacing.sm,
      gap: spacing.sm,
    },
    signInText: {
      textAlign: 'center',
      color: colors.muted,
      fontFamily: fontFamilies.bodyMedium,
      fontSize: typography.sm,
    },
  });
