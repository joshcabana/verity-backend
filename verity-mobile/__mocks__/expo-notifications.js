module.exports = {
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({
    data: 'ExponentPushToken[mock-token]',
  }),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  removeNotificationSubscription: jest.fn(),
};
