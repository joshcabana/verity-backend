import React, { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  type InitialState,
  type LinkingOptions,
  type NavigatorScreenParams,
  useNavigation,
  useNavigationContainerRef,
  useRoute,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MainTabNavigator, { MainTabParamList } from './MainTabNavigator';
import ProfileEditScreen from '../screens/settings/ProfileEditScreen';
import DeleteAccountScreen from '../screens/settings/DeleteAccountScreen';
import ReportScreen from '../screens/settings/ReportScreen';
import BlockListScreen from '../screens/settings/BlockListScreen';
import WaitingScreen from '../screens/WaitingScreen';
import VideoCallScreen from '../screens/VideoCallScreen';
import DecisionScreen from '../screens/DecisionScreen';
import MatchProfileView from '../screens/matches/MatchProfileView';
import ChatScreen from '../screens/chat/ChatScreen';
import TokenShopScreen from '../screens/TokenShopScreen';
import { PendingRoute, useAuth } from '../hooks/useAuth';
import OnboardingStack, { type OnboardingStackParamList } from './OnboardingStack';
import { useTheme } from '../theme/ThemeProvider';
import { spacing } from '../theme/tokens';
import { usePushNotifications } from '../hooks/usePushNotifications';
import type { PartnerReveal } from '../types/reveal';

export type RootStackParamList = {
  Onboarding: NavigatorScreenParams<OnboardingStackParamList> | undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  ProfileEdit: undefined;
  DeleteAccount: undefined;
  Waiting: undefined;
  VideoCall: {
    sessionId?: string;
    partnerId?: string;
    partnerAnonymousId?: string;
    queueKey?: string;
    matchedAt?: string;
    channelToken?: string;
    agoraChannel?: string;
  };
  Decision: {
    sessionId?: string;
  };
  MatchProfile: {
    matchId?: string;
    partnerReveal?: PartnerReveal;
  };
  Chat: {
    matchId?: string;
  };
  TokenShop: {
    status?: string;
    session_id?: string;
  };
  Report: undefined;
  BlockList: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

type AuthGateProps = {
  component: React.ComponentType<any>;
};

const AuthGate = ({ component: Component }: AuthGateProps) => {
  const { token, setPendingRoute } = useAuth();
  const navigation = useNavigation();
  const route = useRoute();

  useEffect(() => {
    if (token) {
      return;
    }
    const pending: PendingRoute = {
      name: route.name,
      params: (route.params ?? undefined) as Record<string, unknown> | undefined,
    };
    void setPendingRoute(pending);
    navigation.reset({
      index: 0,
      routes: [{ name: 'Onboarding' as never }],
    });
  }, [token, route.name, route.params, navigation, setPendingRoute]);

  if (!token) {
    return null;
  }

  return <Component />;
};

const ProtectedMain = () => <AuthGate component={MainTabNavigator} />;
const ProtectedProfileEdit = () => <AuthGate component={ProfileEditScreen} />;
const ProtectedDeleteAccount = () => <AuthGate component={DeleteAccountScreen} />;
const ProtectedWaiting = () => <AuthGate component={WaitingScreen} />;
const ProtectedVideoCall = () => <AuthGate component={VideoCallScreen} />;
const ProtectedDecision = () => <AuthGate component={DecisionScreen} />;
const ProtectedMatchProfile = () => <AuthGate component={MatchProfileView} />;
const ProtectedChat = () => <AuthGate component={ChatScreen} />;
const ProtectedTokenShop = () => <AuthGate component={TokenShopScreen} />;
const ProtectedReport = () => <AuthGate component={ReportScreen} />;
const ProtectedBlockList = () => <AuthGate component={BlockListScreen} />;

export const buildLinkingConfig = (
  appScheme: string = process.env.EXPO_PUBLIC_APP_SCHEME ?? 'verity',
): LinkingOptions<RootStackParamList> => ({
  prefixes: [`${appScheme}://`, 'https://verity.app'],
  config: {
    screens: {
      Onboarding: {
        screens: {
          Welcome: 'welcome',
        },
      },
      Main: {
        screens: {
          Home: 'home',
          Matches: 'matches',
          Settings: 'settings',
        },
      },
      ProfileEdit: 'settings/profile',
      DeleteAccount: 'settings/delete',
      Waiting: 'queue/waiting',
      VideoCall: 'call',
      Decision: 'session/decision',
      MatchProfile: 'matches/:matchId',
      Chat: 'matches/:matchId/chat',
      TokenShop: 'tokens/:status?',
      Report: 'settings/report',
      BlockList: 'settings/blocks',
    },
  },
});

export type AppNavigatorProps = {
  initialState?: InitialState;
  linkingOverride?: LinkingOptions<RootStackParamList>;
};

export default function AppNavigator({ initialState, linkingOverride }: AppNavigatorProps = {}) {
  const { token, hydrated, hydrate, pendingRoute, clearPendingRoute } = useAuth();
  const { mode, colors } = useTheme();
  const splashStyles = useMemo(() => createSplashStyles(colors), [colors]);
  const navigationRef = useNavigationContainerRef<RootStackParamList>();
  const prevTokenRef = useRef<string | null>(null);

  // Register push token & handle notification taps after auth
  usePushNotifications(navigationRef);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!hydrated || !navigationRef.isReady()) {
      return;
    }
    const prevToken = prevTokenRef.current;
    if (!prevToken && token) {
      if (pendingRoute) {
        navigationRef.navigate(
          pendingRoute.name as keyof RootStackParamList,
          pendingRoute.params as never,
        );
        void clearPendingRoute();
      } else {
        navigationRef.reset({
          index: 0,
          routes: [{ name: 'Main' }],
        });
      }
    }
    prevTokenRef.current = token;
  }, [token, hydrated, pendingRoute, clearPendingRoute, navigationRef]);

  if (!hydrated) {
    return (
      <View style={splashStyles.splash}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={splashStyles.splashText}>Loading Verity...</Text>
      </View>
    );
  }

  const navigationTheme =
    mode === 'dark'
      ? {
          ...DarkTheme,
          colors: {
            ...DarkTheme.colors,
            background: colors.background,
            card: colors.card,
            text: colors.text,
            border: colors.border,
            primary: colors.primary,
          },
        }
      : {
          ...DefaultTheme,
          colors: {
            ...DefaultTheme.colors,
            background: colors.background,
            card: colors.card,
            text: colors.text,
            border: colors.border,
            primary: colors.primary,
          },
        };

  const linking = useMemo(() => buildLinkingConfig(), []);

  return (
    <NavigationContainer
      theme={navigationTheme}
      ref={navigationRef}
      linking={linkingOverride ?? linking}
      initialState={initialState}
    >
      <Stack.Navigator
        screenOptions={{ headerShown: false }}
        initialRouteName={token ? 'Main' : 'Onboarding'}
      >
        <Stack.Screen name="Onboarding" component={OnboardingStack} />
        <Stack.Screen name="Main" component={ProtectedMain} />
        <Stack.Screen name="ProfileEdit" component={ProtectedProfileEdit} />
        <Stack.Screen name="DeleteAccount" component={ProtectedDeleteAccount} />
        <Stack.Screen name="Waiting" component={ProtectedWaiting} />
        <Stack.Screen name="VideoCall" component={ProtectedVideoCall} />
        <Stack.Screen name="Decision" component={ProtectedDecision} />
        <Stack.Screen name="MatchProfile" component={ProtectedMatchProfile} />
        <Stack.Screen name="Chat" component={ProtectedChat} />
        <Stack.Screen name="TokenShop" component={ProtectedTokenShop} />
        <Stack.Screen name="Report" component={ProtectedReport} />
        <Stack.Screen name="BlockList" component={ProtectedBlockList} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const createSplashStyles = (colors: {
  background: string;
  text: string;
  muted: string;
}) =>
  StyleSheet.create({
    splash: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
    },
    splashText: {
      color: colors.muted,
      marginTop: spacing.md,
      textAlign: 'center',
    },
    splashTitle: {
      color: colors.text,
      fontSize: 22,
      fontWeight: '700',
      marginBottom: 8,
    },
  });
