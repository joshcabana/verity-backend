import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiJson } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useSocket } from '../hooks/useSocket';

type Message = {
  id: string;
  matchId: string;
  senderId: string;
  text: string;
  createdAt: string;
};

export const Chat: React.FC = () => {
  const { matchId } = useParams();
  const { token, userId } = useAuth();
  const socket = useSocket('/chat', token);
  const [draft, setDraft] = useState('');
  const [liveMessages, setLiveMessages] = useState<Message[]>([]);

  const messagesQuery = useQuery({
    queryKey: ['messages', matchId],
    queryFn: async () => {
      if (!matchId) {
        return [] as Message[];
      }
      const response = await apiJson<Message[]>(`/matches/${matchId}/messages`);
      if (!response.ok || !response.data) {
        throw new Error('Failed to load messages');
      }
      return response.data;
    },
    enabled: Boolean(matchId),
  });

  useEffect(() => {
    if (!socket) {
      return;
    }

    const handleNew = (payload: Message) => {
      if (payload.matchId !== matchId) {
        return;
      }
      setLiveMessages((prev) => [...prev, payload]);
    };

    socket.on('message:new', handleNew);

    return () => {
      socket.off('message:new', handleNew);
    };
  }, [socket, matchId]);

  const messages = useMemo(() => {
    const base = messagesQuery.data ?? [];
    return [...base, ...liveMessages];
  }, [messagesQuery.data, liveMessages]);

  const sendMessage = async () => {
    if (!matchId || !draft.trim()) {
      return;
    }
    const content = draft.trim();
    setDraft('');
    const response = await apiJson<Message>(`/matches/${matchId}/messages`, {
      method: 'POST',
      body: { text: content },
    });
    if (response.ok && response.data) {
      setLiveMessages((prev) => [...prev, response.data as Message]);
    }
  };

  if (messagesQuery.isLoading) {
    return <section className="card">Loading messages…</section>;
  }

  if (messagesQuery.isError) {
    return <section className="card">Unable to load messages.</section>;
  }

  return (
    <section className="grid">
      <div className="card">
        <h2 className="section-title">Chat</h2>
        <div className="chat-list">
          {messages.map((message) => (
            <div
              key={`${message.id}-${message.createdAt}`}
              className={`chat-bubble ${
                message.senderId === userId ? 'self' : 'other'
              }`}
            >
              {message.text}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
          <input
            className="input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Say something nice"
          />
          <button className="button" onClick={sendMessage}>
            Send
          </button>
        </div>
      </div>
    </section>
  );
};
