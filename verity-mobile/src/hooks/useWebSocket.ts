import { useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { create } from 'zustand';
import { useAuth } from './useAuth';

const WS_URL =
  process.env.EXPO_PUBLIC_WS_URL ??
  process.env.EXPO_PUBLIC_API_URL ??
  process.env.API_URL ??
  'http://localhost:3000';

const WS_BASE = WS_URL.replace(/\/$/, '');

type ChatMessagePayload = {
  id: string;
  matchId: string;
  senderId: string;
  text: string;
  createdAt: string;
  receivedAt: number;
};

export type SessionStartPayload = {
  sessionId: string;
  channelName: string;
  rtc: { token: string; uid: number };
  rtm: { token: string; userId: string };
  startAt: string;
  endAt: string;
  expiresAt: string;
  durationSeconds: number;
};

type ChatEventStore = {
  lastMessage: ChatMessagePayload | null;
  lastSessionStart: SessionStartPayload | null;
  setLastMessage: (message: ChatMessagePayload | null) => void;
  setLastSessionStart: (payload: SessionStartPayload | null) => void;
};

const useChatEventStore = create<ChatEventStore>((set) => ({
  lastMessage: null,
  lastSessionStart: null,
  setLastMessage: (message) => set({ lastMessage: message }),
  setLastSessionStart: (lastSessionStart) => set({ lastSessionStart }),
}));

let queueSocketSingleton: Socket | null = null;
let videoSocketSingleton: Socket | null = null;
let chatSocketSingleton: Socket | null = null;
let queueListenerAttached = false;
let videoListenerAttached = false;
let chatListenerAttached = false;

export function useWebSocket() {
  const { token } = useAuth();
  const [queueConnected, setQueueConnected] = useState(false);
  const [videoConnected, setVideoConnected] = useState(false);
  const [chatConnected, setChatConnected] = useState(false);
  const queueInitRef = useRef(false);
  const videoInitRef = useRef(false);
  const lastMessage = useChatEventStore((state) => state.lastMessage);
  const lastSessionStart = useChatEventStore((state) => state.lastSessionStart);

  const setLastMessage = useMemo(
    () => useChatEventStore.getState().setLastMessage,
    [],
  );
  const setLastSessionStart = useMemo(
    () => useChatEventStore.getState().setLastSessionStart,
    [],
  );

  useEffect(() => {
    if (!token) {
      if (queueSocketSingleton) {
        queueSocketSingleton.disconnect();
        queueSocketSingleton = null;
        queueListenerAttached = false;
      }
      if (videoSocketSingleton) {
        videoSocketSingleton.disconnect();
        videoSocketSingleton = null;
        videoListenerAttached = false;
      }
      if (chatSocketSingleton) {
        chatSocketSingleton.disconnect();
        chatSocketSingleton = null;
        chatListenerAttached = false;
      }
      queueInitRef.current = false;
      videoInitRef.current = false;
      setQueueConnected(false);
      setVideoConnected(false);
      setChatConnected(false);
      setLastMessage(null);
      setLastSessionStart(null);
      return;
    }

    if (!queueSocketSingleton) {
      queueSocketSingleton = io(`${WS_BASE}/queue`, {
        transports: ['websocket'],
        autoConnect: false,
      });
    }
    if (!videoSocketSingleton) {
      videoSocketSingleton = io(`${WS_BASE}/video`, {
        transports: ['websocket'],
        autoConnect: false,
      });
    }

    queueSocketSingleton.auth = { token };
    queueSocketSingleton.connect();

    videoSocketSingleton.auth = { token };
    videoSocketSingleton.connect();

    if (!chatSocketSingleton) {
      chatSocketSingleton = io(`${WS_BASE}/chat`, {
        transports: ['websocket'],
        autoConnect: false,
      });
    }

    chatSocketSingleton.auth = { token };
    chatSocketSingleton.connect();

    setQueueConnected(queueSocketSingleton.connected);
    setVideoConnected(videoSocketSingleton.connected);
    setChatConnected(chatSocketSingleton.connected);

    if (!queueInitRef.current) {
      const handleQueueConnect = () => setQueueConnected(true);
      const handleQueueDisconnect = () => setQueueConnected(false);
      queueSocketSingleton.on('connect', handleQueueConnect);
      queueSocketSingleton.on('disconnect', handleQueueDisconnect);
      queueInitRef.current = true;
    }

    if (!videoInitRef.current) {
      const handleVideoConnect = () => setVideoConnected(true);
      const handleVideoDisconnect = () => setVideoConnected(false);
      videoSocketSingleton.on('connect', handleVideoConnect);
      videoSocketSingleton.on('disconnect', handleVideoDisconnect);
      videoInitRef.current = true;
    }

    if (videoSocketSingleton && !videoListenerAttached) {
      videoSocketSingleton.on(
        'session:start',
        (payload: SessionStartPayload) => {
          setLastSessionStart(payload);
        },
      );
      videoListenerAttached = true;
    }

    if (queueSocketSingleton && !queueListenerAttached) {
      queueListenerAttached = true;
    }

    if (chatSocketSingleton && !chatListenerAttached) {
      chatSocketSingleton.on(
        'message:new',
        (payload: Omit<ChatMessagePayload, 'receivedAt'>) => {
          setLastMessage({ ...payload, receivedAt: Date.now() });
        },
      );
      chatSocketSingleton.on('connect', () => setChatConnected(true));
      chatSocketSingleton.on('disconnect', () => setChatConnected(false));
      chatListenerAttached = true;
    }
  }, [token, setLastMessage, setLastSessionStart]);

  return {
    socket: videoSocketSingleton,
    queueSocket: queueSocketSingleton,
    videoSocket: videoSocketSingleton,
    chatSocket: chatSocketSingleton,
    connected: queueConnected && videoConnected,
    queueConnected,
    videoConnected,
    chatConnected,
    lastMessage,
    lastSessionStart,
  };
}
