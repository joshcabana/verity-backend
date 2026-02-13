import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ThemedButton from '../components/ThemedButton';
import { useAuth } from '../hooks/useAuth';
import { useTokenBalance } from '../hooks/usePurchaseTokens';
import { useQueue } from '../hooks/useQueue';
import { useTheme } from '../theme/ThemeProvider';
import { fontFamilies, spacing, typography } from '../theme/tokens';

const { width } = Dimensions.get('window');

const TICKER_TEXT =
  ' • 124 Online • Matching in ~10s • Sydney • 85 Online • Matching in ~5s • Melbourne • 40 Online • Matching in ~15s • ';

export default function HomeScreen() {
  const navigation = useNavigation();
  const { user, setUser } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { joinQueue, status, markTokenSpent } = useQueue();
  const { balance, refreshBalance, refreshing } = useTokenBalance();
  
  const tokenBalance = balance ?? user?.tokenBalance ?? 0;
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [joining, setJoining] = useState(false);
  const [city, setCity] = useState('Sydney'); // Hardcoded for simplified UI, but functional

  /* Animations */
  const scrollX = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Infinite Ticker Animation
  useEffect(() => {
    Animated.loop(
      Animated.timing(scrollX, {
        toValue: -width, // Scroll one screen width (since text repeats)
        duration: 15000, // Speed
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ).start();
  }, [scrollX]);

  // Pulse Core Animation
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [pulseAnim]);

  const handleGoLive = async () => {
    if (tokenBalance < 1) {
      Alert.alert('Out of Tokens', 'You need at least 1 token to go live.', [
        { text: 'Get Tokens', onPress: () => navigation.navigate('TokenShop' as never) },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    
    setJoining(true);
    const optimisticBalance = tokenBalance - 1;
    await setUser({ ...(user ?? { id: '' }), tokenBalance: optimisticBalance });
    markTokenSpent(true);

    try {
      await joinQueue('au'); // Default region
      navigation.navigate('Waiting' as never);
    } catch {
      await setUser({ ...(user ?? { id: '' }), tokenBalance });
      markTokenSpent(false);
      Alert.alert('Queue unavailable', 'Unable to join right now.');
    } finally {
      setJoining(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
        bounces={false}
      >
        {/* A. Header (Sticky feel) */}
        <View style={[styles.header, { marginTop: insets.top }]}>
          <Text style={styles.logoText}>VERITY</Text>
          <TouchableOpacity 
            style={styles.balancePill} 
            onPress={refreshBalance}
            activeOpacity={0.7}
          >
            <View style={styles.goldDot} />
            <Text style={styles.balanceText}>{refreshing ? '...' : `${tokenBalance} Tokens`}</Text>
          </TouchableOpacity>
        </View>

        {/* B. Hero Section (The Portal) */}
        <View style={styles.heroContainer}>
          <View style={styles.portalVisual}>
            <View style={styles.portalCoreGlow} />
            <Animated.View 
              style={[
                styles.portalPulseRing, 
                { transform: [{ scale: pulseAnim }] }
              ]} 
            />
            <View style={[styles.portalOrbit, styles.orbit1]} />
            <View style={[styles.portalOrbit, styles.orbit2]} />
          </View>

          <View style={styles.heroContent}>
            <Text style={styles.heroTitle}>
              No profiles.{'\n'}Just chemistry.
            </Text>
            <Text style={styles.heroSubhead}>45 seconds to decide.</Text>
            
            <View style={styles.actionArea}>
              <View style={styles.cityPicker}>
                <Text style={styles.cityLabel}>Live in </Text>
                <Text style={styles.cityValue}>{city} ▾</Text>
              </View>

              <TouchableOpacity
                style={styles.goLiveButton}
                onPress={handleGoLive}
                activeOpacity={0.9}
                disabled={joining}
              >
                <Text style={styles.goLiveText}>
                  {joining ? 'CONNECTING...' : 'Go Live'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* C. Queue Ticker */}
        <View style={styles.tickerContainer}>
          <Animated.View style={{ flexDirection: 'row', transform: [{ translateX: scrollX }] }}>
            <Text style={styles.tickerText}>{TICKER_TEXT}</Text>
            <Text style={styles.tickerText}>{TICKER_TEXT}</Text>
            <Text style={styles.tickerText}>{TICKER_TEXT}</Text>
          </Animated.View>
        </View>

        {/* D. How it Works */}
        <View style={styles.stepsContainer}>
          {[
            { icon: '🚪', title: 'Join Queue', desc: 'Enter the blind pool.' },
            { icon: '⏱️', title: '45s Date', desc: 'Video reveals personality.' },
            { icon: '❤️', title: 'Decide', desc: 'Match to reveal identity.' },
          ].map((step, i) => (
            <View key={i} style={styles.stepCard}>
              <View style={styles.stepIconBox}>
                <Text style={styles.stepIcon}>{step.icon}</Text>
              </View>
              <View>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepDesc}>{step.desc}</Text>
              </View>
            </View>
          ))}
        </View>
        
        {/* Footer Actions */}
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
            <ThemedButton 
                label="Safety & Standards" 
                variant="outline" 
                onPress={() => navigation.navigate('Settings' as never)} 
            />
        </View>

      </ScrollView>
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background, // Void Black
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      zIndex: 10,
    },
    logoText: {
      color: colors.text,
      fontFamily: fontFamilies.display,
      fontSize: 24,
      letterSpacing: 1,
    },
    balancePill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: 'rgba(26,26,26,0.8)',
    },
    goldDot: {
      width: 6,
      height: 6,
      borderRadius: 999,
      backgroundColor: colors.primary,
      marginRight: 6,
    },
    balanceText: {
      color: colors.text,
      fontSize: 12,
      fontFamily: fontFamilies.mono,
      textTransform: 'uppercase',
    },
    heroContainer: {
      height: Dimensions.get('window').height * 0.75, // 75% screen height
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    portalVisual: {
      position: 'absolute',
      width: 300,
      height: 300,
      justifyContent: 'center',
      alignItems: 'center',
      top: '20%', // Shift visual up visually behind text
    },
    portalCoreGlow: {
      position: 'absolute',
      width: 100,
      height: 100,
      borderRadius: 999,
      backgroundColor: colors.primary,
      opacity: 0.15,
      shadowColor: colors.primary,
      shadowOpacity: 0.5,
      shadowRadius: 40,
    },
    portalPulseRing: {
      position: 'absolute',
      width: 180,
      height: 180,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: 'rgba(212,175,55,0.3)',
    },
    portalOrbit: {
      position: 'absolute',
      width: 260,
      height: 260,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.05)',
    },
    orbit1: { transform: [{ rotate: '45deg' }] },
    orbit2: { transform: [{ rotate: '-45deg' }, { scale: 0.8 }] },
    heroContent: {
      width: '100%',
      paddingHorizontal: spacing.xl,
      alignItems: 'center',
      marginTop: 40,
    },
    heroTitle: {
      color: colors.text, // White
      fontFamily: fontFamilies.display,
      fontSize: 42,
      textAlign: 'center',
      lineHeight: 46,
      marginBottom: spacing.sm,
    },
    heroSubhead: {
      color: colors.muted,
      fontFamily: fontFamilies.body,
      fontSize: 18,
      textAlign: 'center',
      marginBottom: spacing.xl,
    },
    actionArea: {
      width: '100%',
      alignItems: 'center',
      marginTop: spacing.xl,
    },
    cityPicker: {
      flexDirection: 'row',
      marginBottom: spacing.md,
    },
    cityLabel: {
      color: colors.muted,
      fontSize: 14,
    },
    cityValue: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '600',
    },
    goLiveButton: {
      width: '100%',
      height: 56,
      borderRadius: 999,
      backgroundColor: colors.primary, // Gold
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 10,
      elevation: 5,
    },
    goLiveText: {
      color: '#000',
      fontSize: 18,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    tickerContainer: {
      height: 50,
      backgroundColor: '#111',
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: '#222',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    tickerText: {
      color: '#888',
      fontSize: 14,
      fontFamily: fontFamilies.mono,
      marginRight: 40,
    },
    stepsContainer: {
      padding: spacing.lg,
      gap: spacing.md,
    },
    stepCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#0A0A0A',
      borderWidth: 1,
      borderColor: '#222',
      borderRadius: 16,
      padding: spacing.lg,
    },
    stepIconBox: {
      width: 40,
      height: 40,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.05)',
      borderRadius: 999,
      marginRight: spacing.md,
    },
    stepIcon: {
      fontSize: 20,
    },
    stepTitle: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '600',
      marginBottom: 2,
    },
    stepDesc: {
      color: colors.muted,
      fontSize: 14,
    },
  });
