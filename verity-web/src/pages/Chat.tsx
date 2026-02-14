import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  matchId: string;
  partnerRevealVersion: number;
  revealAcknowledged: boolean;
  revealAcknowledgedAt: string | null;
  partnerReveal: PartnerReveal | null;
};

type PartnerReveal = {
  id: string;
  displayName: string | null;
  primaryPhotoUrl: string | null;
  age: number | null;
  bio: string | null;
};

type MatchRevealPayload = {
  matchId: string;
  partnerRevealVersion: number;
  partnerReveal: PartnerReveal;
  revealAcknowledged: boolean;
  revealAcknowledgedAt: string | null;
};

type ChatLocationState = {
  partnerRevealVersion?: number;
  partnerReveal?: PartnerReveal;
};

type ApiErrorData = {
  code?: string;
  message?: string | { code?: string; message?: string };
};

const REVEAL_ACK_REQUIRED_CODE = 'REVEAL_ACK_REQUIRED';

function parseApiErrorCode(data: unknown): string | null {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const payload = data as ApiErrorData;
  if (typeof payload.code === 'string') {
    return payload.code;
  }
  if (payload.message && typeof payload.message === 'object') {
    if (typeof payload.message.code === 'string') {
      return payload.message.code;
    }
  }
  return null;
}

export const Chat: React.FC = () => {
  const { matchId } = useParams();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { token, userId } = useAuth();
  const { flags } = useFlags();
  const socket = useSocket('/chat', token);
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [blockError, setBlockError] = useState<string | null>(null);
  const [revealError, setRevealError] = useState<string | null>(null);
  const [blocking, setBlocking] = useState(false);
  const [acknowledgingReveal, setAcknowledgingReveal] = useState(false);
  const [locallyBlocked, setLocallyBlocked] = useState(false);
  const [liveMessages, setLiveMessages] = useState<Message[]>([]);
  const [hydratedPartnerReveal, setHydratedPartnerReveal] = useState<PartnerReveal | null>(() => {
    const state = location.state as ChatLocationState | null;
    return state?.partnerReveal ?? null;
  });
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;

  const revealQuery = useQuery({
    queryKey: ['match-reveal', matchId],
    queryFn: async () => {
      if (!matchId) {
        throw new Error('Missing match');
      }
      const response = await apiJson<MatchRevealPayload>(`/matches/${matchId}/reveal`);
      if (!response.ok || !response.data) {
        throw new Error('Failed to load reveal');
      }
      return response.data;
    },
    enabled: Boolean(matchId),
    retry: false,
  });

  const revealAcknowledged = Boolean(revealQuery.data?.revealAcknowledged);
  const partnerReveal =
    revealQuery.data?.partnerReveal ??
    hydratedPartnerReveal;

  const messagesQuery = useQuery({
    queryKey: ['messages', matchId],
    queryFn: async () => {
      if (!matchId) {
        return [] as Message[];
      }
      const response = await apiJson<Message[]>(`/matches/${matchId}/messages`);
      if (!response.ok || !response.data) {
        if (response.status === 403) {
          const code = parseApiErrorCode(response.data);
          if (code === REVEAL_ACK_REQUIRED_CODE) {
            throw new Error(REVEAL_ACK_REQUIRED_CODE);
          }
          throw new Error('BLOCKED');
        }
        throw new Error('Failed to load messages');
      }
      return response.data;
    },
    enabled: Boolean(matchId && revealAcknowledged),
  });

  const matchQuery = useQuery({
    queryKey: ['match-summary', matchId],
    queryFn: async () => {
      const response = await apiJson<MatchSummary[]>('/matches');
      if (!response.ok || !response.data) {
        throw new Error('Failed to load match');
      }
      return response.data.find((item) => item.matchId === matchId) ?? null;
    },
    enabled: Boolean(matchId),
  });

  useEffect(() => {
    const state = location.state as ChatLocationState | null;
    if (state?.partnerReveal) {
      setHydratedPartnerReveal(state.partnerReveal);
    }
  }, [location.state]);

  useEffect(() => {
    if (revealQuery.data?.partnerReveal) {
      setHydratedPartnerReveal(revealQuery.data.partnerReveal);
    }
  }, [revealQuery.data]);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const handleNew = (payload: Message) => {
      if (payload.matchId !== matchId) {
        return;
      }
      if (!revealAcknowledged) {
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
  }, [socket, matchId, revealAcknowledged]);

  const messages = useMemo(() => {
    const base = messagesQuery.data ?? [];
    return [...base, ...liveMessages];
  }, [messagesQuery.data, liveMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const sendMessage = async () => {
    if (!matchId || !draft.trim() || !revealAcknowledged) {
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
        const code = parseApiErrorCode(response.data);
        if (code === REVEAL_ACK_REQUIRED_CODE) {
          setLiveMessages((prev) =>
            prev.filter((message) => message.id !== optimisticId),
          );
          setSendError('Acknowledge the profile reveal before sending messages.');
          void revealQuery.refetch();
          return;
        }
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

  const acknowledgeReveal = async () => {
    if (!matchId || acknowledgingReveal) {
      return;
    }
    setAcknowledgingReveal(true);
    setRevealError(null);
    const response = await apiJson<MatchRevealPayload>(`/matches/${matchId}/reveal-ack`, {
      method: 'POST',
    });
    setAcknowledgingReveal(false);
    if (!response.ok || !response.data) {
      setRevealError('Unable to unlock chat right now. Try again.');
      return;
    }
    queryClient.setQueryData(['match-reveal', matchId], response.data);
    setSendError(null);
  };

  if (revealQuery.isLoading) {
    return <section className="card">Loading profile reveal…</section>;
  }

  if (revealQuery.isError || !revealQuery.data) {
    return <section className="card">Unable to load match reveal.</section>;
  }

  if (revealAcknowledged && messagesQuery.isLoading) {
    return <section className="card">Loading messages…</section>;
  }

  const messageError = messagesQuery.error as Error | null;
  const blockedByServer = messageError?.message === 'BLOCKED';
  const revealRequiredByServer =
    messageError?.message === REVEAL_ACK_REQUIRED_CODE;
  const blocked = blockedByServer || locallyBlocked;

  if (revealRequiredByServer) {
    return <section className="card">Profile reveal acknowledgement required.</section>;
  }

  if (messagesQuery.isError && !blockedByServer && revealAcknowledged) {
    return <section className="card">Unable to load messages.</section>;
  }

  const partnerName =
    partnerReveal?.displayName ??
    matchQuery.data?.partnerReveal?.displayName ??
    'Your match';
  const partnerId = partnerReveal?.id ?? matchQuery.data?.partnerReveal?.id ?? null;
  const chatLocked = !revealAcknowledged;
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
        <div className="flex-between">
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
          <div className="callout mt-subtle">
            <strong>Match details unavailable</strong>
            <p className="subtle">{matchWarning}</p>
          </div>
        )}
        {chatLocked && (
          <div className="callout mt-subtle">
            <strong>Review profile to unlock chat</strong>
            <p className="subtle mt-xs">
              Chat unlocks after you acknowledge the mutual profile reveal.
            </p>
            <div className="mt-subtle">
              <p className="subtle">
                <strong>{partnerName}</strong>
                {partnerReveal?.age ? `, ${partnerReveal.age}` : ''}
              </p>
              {partnerReveal?.bio && (
                <p className="subtle mt-xs">
                  {partnerReveal.bio}
                </p>
              )}
            </div>
            <button
              className="button mt-subtle"
              onClick={acknowledgeReveal}
              disabled={acknowledgingReveal}
            >
              {acknowledgingReveal ? 'Continuing…' : 'Continue to chat'}
            </button>
            {revealError && (
              <p className="subtle text-danger mt-xs">
                {revealError}
              </p>
            )}
          </div>
        )}
        {revealAcknowledged && (
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
        )}
        {blocked && (
          <div className="callout mt-md">
            <strong>Conversation blocked</strong>
            <p className="subtle">
              Chat is unavailable because one of you has blocked the other.
            </p>
          </div>
        )}
        {blockError && (
          <p className="subtle text-danger">
            {blockError}
          </p>
        )}
        <div className="inline mt-md">
          <input
            className="input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Say something kind"
            disabled={blocked || chatLocked}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void sendMessage();
              }
            }}
          />
          <button
            className="button"
            onClick={sendMessage}
            disabled={!draft.trim() || blocked || chatLocked || acknowledgingReveal}
          >
            Send
          </button>
        </div>
        {sendError && (
          <p className="subtle text-danger">
            {sendError}
          </p>
        )}
        <div className="callout safety mt-md">
          <strong>Stay respectful</strong>
          <p className="subtle">
            If you receive anything unsafe, use the report button and we will review it.
          </p>
        </div>
      </div>
    </section>
  );
};
