import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { apiJson } from '../services/api';
import { useAuth } from './useAuth';
import type { RootStackParamList } from '../navigation/AppNavigator';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Registers the device for push notifications and handles
 * deep-link routing when the user taps a notification.
 *
 * Backend sends `deepLinkTarget` in the push data payload:
 *   - `'chat'`   → navigate to the Chat screen for the matchId
 *   - `'reveal'` → navigate to the MatchProfile screen for the matchId
 */
export function usePushNotifications() {
  const { token } = useAuth();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const registeredRef = useRef(false);

  // Register push token with the backend
  useEffect(() => {
    if (!token || registeredRef.current) {
      return;
    }

    const register = async () => {
      const { status: existing } = await Notifications.getPermissionsAsync();
      let finalStatus = existing;

      if (existing !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        return;
      }

      const pushToken = await Notifications.getExpoPushTokenAsync();
      const platform = Platform.OS === 'ios' ? 'IOS' : 'ANDROID';

      await apiJson('/notifications/tokens', {
        method: 'POST',
        body: JSON.stringify({
          token: pushToken.data,
          platform,
        }),
      });

      registeredRef.current = true;
    };

    void register();
  }, [token]);

  // Handle notification tap → deep-link routing
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as {
          deepLinkTarget?: string;
          matchId?: string;
        };

        if (!data?.deepLinkTarget || !data?.matchId) {
          return;
        }

        switch (data.deepLinkTarget) {
          case 'chat':
            navigation.navigate('Chat', { matchId: data.matchId });
            break;
          case 'reveal':
            navigation.navigate('MatchProfile', { matchId: data.matchId });
            break;
          default:
            break;
        }
      },
    );

    return () => subscription.remove();
  }, [navigation]);
}
