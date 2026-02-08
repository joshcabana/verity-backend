import {
  ChannelProfileType,
  ClientRoleType,
  createAgoraRtcEngine,
  IRtcEngine,
} from 'react-native-agora';

type SetupOptions = {
  channel?: string;
  token?: string;
  uid?: number;
  onJoinSuccess?: () => void;
  onUserJoined?: (uid: number) => void;
  onUserOffline?: (uid: number) => void;
  onTokenWillExpire?: () => void;
};

const APP_ID = process.env.EXPO_PUBLIC_AGORA_APP_ID ?? '';
let engine: IRtcEngine | null = null;
let initialized = false;

export async function setupAgoraEngine(options: SetupOptions = {}) {
  if (!engine) {
    engine = createAgoraRtcEngine();
  }

  if (!initialized) {
    if (!APP_ID) {
      throw new Error('Missing Agora App ID');
    }
    engine.initialize({ appId: APP_ID });
    engine.setChannelProfile(ChannelProfileType.ChannelProfileLiveBroadcasting);
    engine.setClientRole(ClientRoleType.ClientRoleBroadcaster);
    engine.enableVideo();
    engine.startPreview();
    initialized = true;
  }

  if (options.onJoinSuccess || options.onUserJoined || options.onUserOffline) {
    engine.registerEventHandler({
      onJoinChannelSuccess: () => options.onJoinSuccess?.(),
      onUserJoined: (_connection, uid) => options.onUserJoined?.(uid),
      onUserOffline: (_connection, uid) => options.onUserOffline?.(uid),
      onTokenPrivilegeWillExpire: () => options.onTokenWillExpire?.(),
    });
  }

  if (options.channel && options.token) {
    await engine.joinChannel(options.token, options.channel, options.uid ?? 0, {
      clientRoleType: ClientRoleType.ClientRoleBroadcaster,
    });
  }

  return engine;
}

export function leaveAgoraChannel() {
  engine?.leaveChannel();
  engine?.stopPreview();
}
