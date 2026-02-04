import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { socketUrl } from '../api/client';

export function useSocket(namespace: string, token: string | null) {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!token) {
      setSocket(null);
      return undefined;
    }

    const nextSocket = io(socketUrl(namespace), {
      auth: { token },
      transports: ['websocket'],
      withCredentials: true,
    });

    setSocket(nextSocket);

    return () => {
      nextSocket.disconnect();
    };
  }, [namespace, token]);

  return socket;
}
