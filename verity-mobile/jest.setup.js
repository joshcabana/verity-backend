// Keep this lightweight so unit tests don't need native modules.
//
// Some RN/Expo versions no longer ship this internal module; guard the mock so
// tests don't fail during resolution.
try {
  require.resolve('react-native/Libraries/Animated/NativeAnimatedHelper');
  jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');
} catch {}

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('@stripe/stripe-react-native', () => {
  const React = require('react');
  return {
    __esModule: true,
    StripeProvider: ({ children }) => React.createElement(React.Fragment, null, children),
    useStripe: () => ({ handleURLCallback: jest.fn() }),
  };
});

const originalConsoleError = console.error;
console.error = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('not wrapped in act')) {
    return;
  }
  originalConsoleError(...args);
};
