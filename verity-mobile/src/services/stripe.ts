import { useEffect } from 'react';
import { Linking } from 'react-native';
import { useStripe } from '@stripe/stripe-react-native';

export const STRIPE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';
export const STRIPE_APP_SCHEME = process.env.EXPO_PUBLIC_APP_SCHEME ?? 'verity';

export type StripeRedirectStatus = 'success' | 'cancel' | 'unknown';

export type StripeRedirectResult = {
  status: StripeRedirectStatus;
  sessionId?: string;
};

export function resolveCheckoutUrl(payload: {
  checkoutUrl?: string | null;
  url?: string | null;
  sessionUrl?: string | null;
}) {
  return payload.checkoutUrl ?? payload.url ?? payload.sessionUrl ?? null;
}

export async function openCheckoutSession(url: string) {
  const supported = await Linking.canOpenURL(url);
  if (!supported) {
    throw new Error('Unable to open Stripe Checkout URL.');
  }
  await Linking.openURL(url);
}

export function parseStripeRedirect(url: string): StripeRedirectResult {
  const parsed = Linking.parse(url);
  const path = parsed.path ?? '';
  const sessionId =
    typeof parsed.queryParams?.session_id === 'string'
      ? parsed.queryParams.session_id
      : undefined;

  if (path.startsWith('tokens/success')) {
    return { status: 'success', sessionId };
  }
  if (path.startsWith('tokens/cancel')) {
    return { status: 'cancel', sessionId };
  }

  return { status: 'unknown' };
}

export function useStripeRedirectHandler(
  onResult?: (result: StripeRedirectResult) => void,
) {
  const { handleURLCallback } = useStripe();

  useEffect(() => {
    const handle = ({ url }: { url: string }) => {
      if (!url) {
        return;
      }
      handleURLCallback(url);
      const result = parseStripeRedirect(url);
      if (result.status !== 'unknown') {
        onResult?.(result);
      }
    };

    const subscription = Linking.addEventListener('url', handle);
    void Linking.getInitialURL().then((url) => {
      if (url) {
        handle({ url });
      }
    });

    return () => subscription.remove();
  }, [handleURLCallback, onResult]);
}
