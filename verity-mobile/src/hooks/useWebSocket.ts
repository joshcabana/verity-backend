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

type ChatEventStore = {
  lastMessage: ChatMessagePayload | null;
  setLastMessage: (message: ChatMessagePayload | null) => void;
};

const useChatEventStore = create<ChatEventStore>((set) => ({
  lastMessage: null,
  setLastMessage: (message) => set({ lastMessage: message }),
}));

let socketSingleton: Socket | null = null;
let chatSocketSingleton: Socket | null = null;
let chatListenerAttached = false;

export function useWebSocket() {
  const { token } = useAuth();
  const [connected, setConnected] = useState(false);
  const [chatConnected, setChatConnected] = useState(false);
  const initializedRef = useRef(false);
  const lastMessage = useChatEventStore((state) => state.lastMessage);

  const setLastMessage = useMemo(() => useChatEventStore.getState().setLastMessage, []);

  useEffect(() => {
    if (!token) {
      if (socketSingleton) {
        socketSingleton.disconnect();
        socketSingleton = null;
      }
      if (chatSocketSingleton) {
        chatSocketSingleton.disconnect();
        chatSocketSingleton = null;
        chatListenerAttached = false;
      }
      setConnected(false);
      setChatConnected(false);
      setLastMessage(null);
      return;
    }

    if (!socketSingleton) {
      socketSingleton = io(WS_BASE, {
        transports: ['websocket'],
        autoConnect: false,
      });
    }

    socketSingleton.auth = { token };
    socketSingleton.connect();

    if (!chatSocketSingleton) {
      chatSocketSingleton = io(`${WS_BASE}/chat`, {
        transports: ['websocket'],
        autoConnect: false,
      });
    }

    chatSocketSingleton.auth = { token };
    chatSocketSingleton.connect();

    setConnected(socketSingleton.connected);
    setChatConnected(chatSocketSingleton.connected);

    if (!initializedRef.current) {
      const handleConnect = () => setConnected(true);
      const handleDisconnect = () => setConnected(false);
      socketSingleton.on('connect', handleConnect);
      socketSingleton.on('disconnect', handleDisconnect);
      initializedRef.current = true;
    }

    if (chatSocketSingleton && !chatListenerAttached) {
      chatSocketSingleton.on('message:new', (payload: Omit<ChatMessagePayload, 'receivedAt'>) => {
        setLastMessage({ ...payload, receivedAt: Date.now() });
      });
      chatSocketSingleton.on('connect', () => setChatConnected(true));
      chatSocketSingleton.on('disconnect', () => setChatConnected(false));
      chatListenerAttached = true;
    }
  }, [token]);

  return {
    socket: socketSingleton,
    chatSocket: chatSocketSingleton,
    connected,
    chatConnected,
    lastMessage,
  };
}
