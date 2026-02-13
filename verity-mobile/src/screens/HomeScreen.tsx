import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import ThemedScreen from '../components/ThemedScreen';
// ThemedButton supports 'ghost' now, ensuring updated component is used
import ThemedButton from '../components/ThemedButton'; 
import { useAuth } from '../hooks/useAuth';
import { useQueue } from '../hooks/useQueue';
import { spacing, typography } from '../theme/tokens';
import TokenBalanceDisplay from '../components/TokenBalanceDisplay';

export default function HomeScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const { joinQueue, status } = useQueue();

  const handleStart = async () => {
    // If not enough tokens, navigate to shop
    if ((user?.tokenBalance ?? 0) <= 0) {
      // @ts-ignore
      navigation.navigate('TokenShop'); 
      return;
    }
    
    await joinQueue();
    // @ts-ignore
    navigation.navigate('Waiting');
  };

  const handleShop = () => {
      // @ts-ignore
      navigation.navigate('TokenShop');
  };

  return (
    <ThemedScreen>
      <View style={styles.header}>
        <Text style={styles.logoText}>VERITY</Text>
        <TokenBalanceDisplay 
          balance={user?.tokenBalance ?? 0} 
          compact 
          onPress={handleShop}
        />
      </View>

      <View style={styles.centerContent}>
        <Text style={styles.heroTitle}>
          VERITY
        </Text>
        <Text style={styles.heroSubtitle}>
          Real connections.{'\n'}No recordings.
        </Text>

        <View style={styles.actionContainer}>
          <ThemedButton 
            label={status === 'waiting' ? 'Rejoin Queue' : 'Start Connection'}
            onPress={() => void handleStart()}
          />
          <Text style={styles.disclaimer}>
            45s video chat • 5 tokens
          </Text>
        </View>
      </View>
    </ThemedScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    width: '100%',
  },
  logoText: {
    fontSize: 24,
    color: '#D4AF37', // Gold
    letterSpacing: 2,
    fontWeight: '700',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  heroTitle: {
    fontSize: 48,
    color: '#D4AF37', // Gold
    letterSpacing: 4,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  heroSubtitle: {
    fontSize: typography.md,
    color: '#A0A0A0', // Silver
    textAlign: 'center',
    marginBottom: spacing.xxl,
    lineHeight: 24,
  },
  actionContainer: {
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    gap: spacing.md,
  },
  disclaimer: {
    fontSize: typography.xs,
    color: '#333333', // Asphalt
    marginTop: spacing.sm,
  },
});
