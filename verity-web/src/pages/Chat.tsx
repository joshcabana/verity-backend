import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiJson } from '../api/client';
import { trackEvent } from '../analytics/events';
import { useAuth } from '../hooks/useAuth';
import { useFlags } from '../hooks/useFlags';
import { useSocket } from '../hooks/useSocket';
import { ReportDialog } from '../components/ReportDialog';

type Message = {
  id: string;
  matchId: string;
  senderId: string;
  text: string;
  createdAt: string;
};

type MatchSummary = {
  id: string;
  partner: { id: string; displayName?: string | null };
};

export const Chat: React.FC = () => {
  const { matchId } = useParams();
  const { token, userId } = useAuth();
  const { flags } = useFlags();
  const socket = useSocket('/chat', token);
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [blockError, setBlockError] = useState<string | null>(null);
  const [blocking, setBlocking] = useState(false);
  const [locallyBlocked, setLocallyBlocked] = useState(false);
  const [liveMessages, setLiveMessages] = useState<Message[]>([]);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;

  const messagesQuery = useQuery({
    queryKey: ['messages', matchId],
    queryFn: async () => {
      if (!matchId) {
        return [] as Message[];
      }
      const response = await apiJson<Message[]>(`/matches/${matchId}/messages`);
      if (!response.ok || !response.data) {
        if (response.status === 403) {
          throw new Error('BLOCKED');
        }
        throw new Error('Failed to load messages');
      }
      return response.data;
    },
    enabled: Boolean(matchId),
  });

  const matchQuery = useQuery({
    queryKey: ['match-summary', matchId],
    queryFn: async () => {
      const response = await apiJson<MatchSummary[]>('/matches');
      if (!response.ok || !response.data) {
        throw new Error('Failed to load match');
      }
      return response.data.find((item) => item.id === matchId) ?? null;
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
      setLiveMessages((prev) => {
        if (prev.some((message) => message.id === payload.id)) {
          return prev;
        }
        return [...prev, payload];
      });
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const sendMessage = async () => {
    if (!matchId || !draft.trim()) {
      return;
    }
    const isFirstMessage = messages.length === 0;
    const content = draft.trim();
    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticMessage: Message = {
      id: optimisticId,
      matchId,
      senderId: userId ?? 'self',
      text: content,
      createdAt: new Date().toISOString(),
    };

    setDraft('');
    setSendError(null);
    setLiveMessages((prev) => [...prev, optimisticMessage]);
    try {
      const response = await apiJson<Message>(`/matches/${matchId}/messages`, {
        method: 'POST',
        body: { text: content },
      });
      if (response.ok && response.data) {
        setLiveMessages((prev) => {
          const withoutOptimistic = prev.filter(
            (message) => message.id !== optimisticId,
          );
          if (
            withoutOptimistic.some((message) => message.id === response.data?.id)
          ) {
            return withoutOptimistic;
          }
          return [...withoutOptimistic, response.data as Message];
        });
        trackEvent(isFirstMessage ? 'first_message_sent' : 'message_sent', {
          matchId,
        });
        return;
      }
      if (response.status === 403) {
        setLiveMessages((prev) =>
          prev.filter((message) => message.id !== optimisticId),
        );
        setLocallyBlocked(true);
        setSendError('Chat is unavailable because one of you has blocked the other.');
        return;
      }
      setLiveMessages((prev) =>
        prev.filter((message) => message.id !== optimisticId),
      );
      setSendError('Unable to send message. Try again.');
      setDraft(content);
    } catch {
      setLiveMessages((prev) =>
        prev.filter((message) => message.id !== optimisticId),
      );
      setSendError(
        offline
          ? 'You appear to be offline. Message not sent.'
          : 'Unable to send message. Try again.',
      );
      setDraft(content);
    }
  };

  if (messagesQuery.isLoading) {
    return <section className="card">Loading messages…</section>;
  }

  const messageError = messagesQuery.error as Error | null;
  const blockedByServer = messageError?.message === 'BLOCKED';
  const blocked = blockedByServer || locallyBlocked;

  if (messagesQuery.isError && !blockedByServer) {
    return <section className="card">Unable to load messages.</section>;
  }

  const partnerName = matchQuery.data?.partner.displayName ?? 'Your match';
  const partnerId = matchQuery.data?.partner.id ?? null;
  const matchWarning = matchQuery.isError
    ? offline
      ? 'You appear to be offline. Match details are unavailable.'
      : 'Unable to load match details right now.'
    : null;

  const handleBlock = async () => {
    if (!partnerId || blocking) {
      return;
    }

    const confirmed = window.confirm(
      `Block ${partnerName}? You will no longer see each other in matches or chat.`,
    );
    if (!confirmed) {
      return;
    }

    setBlocking(true);
    setBlockError(null);
    const response = await apiJson('/moderation/blocks', {
      method: 'POST',
      body: { blockedUserId: partnerId },
    });
    setBlocking(false);

    if (!response.ok) {
      setBlockError('Unable to block this user right now. Try again.');
      return;
    }

    setLocallyBlocked(true);
    setDraft('');
    setLiveMessages([]);
    setSendError(null);
  };

  return (
    <section className="grid">
      <div className="card">
        <div className="inline" style={{ justifyContent: 'space-between' }}>
          <h2 className="section-title">Chat with {partnerName}</h2>
          <div className="inline">
            <button
              className="button ghost"
              onClick={handleBlock}
              disabled={!partnerId || blocking || blocked}
            >
              {blocking ? 'Blocking…' : blocked ? 'Blocked' : 'Block'}
            </button>
            {flags.reportDialogEnabled && (
              <ReportDialog reportedUserId={partnerId} buttonLabel="Report" />
            )}
          </div>
        </div>
        {matchWarning && (
          <div className="callout" style={{ marginTop: '12px' }}>
            <strong>Match details unavailable</strong>
            <p className="subtle">{matchWarning}</p>
          </div>
        )}
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
          <div ref={bottomRef} />
        </div>
        {blocked && (
          <div className="callout" style={{ marginTop: '16px' }}>
            <strong>Conversation blocked</strong>
            <p className="subtle">
              Chat is unavailable because one of you has blocked the other.
            </p>
          </div>
        )}
        {blockError && (
          <p className="subtle" style={{ color: '#dc2626' }}>
            {blockError}
          </p>
        )}
        <div className="inline" style={{ marginTop: '16px' }}>
          <input
            className="input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Say something kind"
            disabled={blocked}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void sendMessage();
              }
            }}
          />
          <button className="button" onClick={sendMessage} disabled={!draft.trim() || blocked}>
            Send
          </button>
        </div>
        {sendError && (
          <p className="subtle" style={{ color: '#dc2626' }}>
            {sendError}
          </p>
        )}
        <div className="callout safety" style={{ marginTop: '16px' }}>
          <strong>Stay respectful</strong>
          <p className="subtle">
            If you receive anything unsafe, use the report button and we will review it.
          </p>
        </div>
      </div>
    </section>
  );
};
