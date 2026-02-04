import { getStateFromPath } from '@react-navigation/native';
import { buildLinkingConfig } from '../../src/navigation/AppNavigator';

jest.mock('react-native-agora', () => ({
  createAgoraRtcEngine: () => ({
    initialize: jest.fn(),
    setChannelProfile: jest.fn(),
    setClientRole: jest.fn(),
    enableVideo: jest.fn(),
    startPreview: jest.fn(),
    registerEventHandler: jest.fn(),
    joinChannel: jest.fn(),
    leaveChannel: jest.fn(),
    stopPreview: jest.fn(),
    muteLocalAudioStream: jest.fn(),
    switchCamera: jest.fn(),
  }),
  ChannelProfileType: { ChannelProfileLiveBroadcasting: 1 },
  ClientRoleType: { ClientRoleBroadcaster: 1 },
  RtcSurfaceView: () => null,
}));

jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: View,
    Svg: View,
    Circle: View,
  };
});

describe('deep linking config', () => {
  it('maps tabs and settings routes', () => {
    const linking = buildLinkingConfig('verity');
    const screens = linking.config?.screens as Record<string, any>;
    const mainScreens = screens?.Main?.screens ?? {};

    expect(linking.prefixes).toContain('verity://');
    expect(mainScreens.Home).toBe('home');
    expect(mainScreens.Matches).toBe('matches');
    expect(mainScreens.Settings).toBe('settings');
    expect(screens.ProfileEdit).toBe('settings/profile');
    expect(screens.DeleteAccount).toBe('settings/delete');
    expect(screens.Waiting).toBe('queue/waiting');
    expect(screens.VideoCall).toBe('call');
    expect(screens.Decision).toBe('session/decision');
    expect(screens.MatchProfile).toBe('matches/:matchId');
    expect(screens.Chat).toBe('matches/:matchId/chat');
    expect(screens.TokenShop).toBe('tokens/:status?');
  });

  it('parses settings tab path into navigation state', () => {
    const linking = buildLinkingConfig('verity');
    const state = getStateFromPath('/settings', linking.config);

    expect(state?.routes[0]?.name).toBe('Main');
    expect(state?.routes[0]?.state?.routes[0]?.name).toBe('Settings');
  });

  it('parses delete account path into navigation state', () => {
    const linking = buildLinkingConfig('verity');
    const state = getStateFromPath('/settings/delete', linking.config);

    expect(state?.routes[0]?.name).toBe('DeleteAccount');
  });

  it('parses profile edit path into navigation state', () => {
    const linking = buildLinkingConfig('verity');
    const state = getStateFromPath('/settings/profile', linking.config);

    expect(state?.routes[0]?.name).toBe('ProfileEdit');
  });

  it('parses matches tab path into navigation state', () => {
    const linking = buildLinkingConfig('verity');
    const state = getStateFromPath('/matches', linking.config);

    expect(state?.routes[0]?.name).toBe('Main');
    expect(state?.routes[0]?.state?.routes[0]?.name).toBe('Matches');
  });

  it('parses home tab path into navigation state', () => {
    const linking = buildLinkingConfig('verity');
    const state = getStateFromPath('/home', linking.config);

    expect(state?.routes[0]?.name).toBe('Main');
    expect(state?.routes[0]?.state?.routes[0]?.name).toBe('Home');
  });

  it('preserves query params when parsing a tab path', () => {
    const linking = buildLinkingConfig('verity');
    const state = getStateFromPath('/matches?ref=invite&from=push', linking.config);

    expect(state?.routes[0]?.name).toBe('Main');
    expect(state?.routes[0]?.state?.routes[0]?.name).toBe('Matches');
    expect(state?.routes[0]?.state?.routes[0]?.params).toEqual({
      ref: 'invite',
      from: 'push',
    });
  });

  it('preserves query params for a settings stack route', () => {
    const linking = buildLinkingConfig('verity');
    const state = getStateFromPath('/settings/profile?source=deeplink', linking.config);

    expect(state?.routes[0]?.name).toBe('ProfileEdit');
    expect(state?.routes[0]?.params).toEqual({ source: 'deeplink' });
  });

  it('preserves query params for delete account route', () => {
    const linking = buildLinkingConfig('verity');
    const state = getStateFromPath('/settings/delete?confirm=1', linking.config);

    expect(state?.routes[0]?.name).toBe('DeleteAccount');
    expect(state?.routes[0]?.params).toEqual({ confirm: '1' });
  });

  it('parses token shop success deep link into navigation state', () => {
    const linking = buildLinkingConfig('verity');
    const state = getStateFromPath('/tokens/success?session_id=sess_123', linking.config);

    expect(state?.routes[0]?.name).toBe('TokenShop');
    expect(state?.routes[0]?.params).toEqual({ status: 'success', session_id: 'sess_123' });
  });
});
