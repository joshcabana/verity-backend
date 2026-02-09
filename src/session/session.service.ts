import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import type { Session } from '@prisma/client';
import { AnalyticsService } from '../analytics/analytics.service';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../common/redis.provider';
import type { RedisClient } from '../common/redis.provider';
import { NotificationsService } from '../notifications/notifications.service';
import { VideoGateway } from '../video/video.gateway';
import { VideoService } from '../video/video.service';

const SESSION_DURATION_MS = 45_000;
const SESSION_STATE_TTL_MS = 60 * 60 * 1000;
const SESSION_LOCK_TTL_MS = 10_000;
const CHOICE_WINDOW_MS = 60_000;
const CHOICE_STATE_TTL_MS = 2 * 60 * 60 * 1000;
const SESSION_RETENTION_MS = 24 * 60 * 60 * 1000;

type SessionChoice = 'MATCH' | 'PASS';

type ChoiceResult =
  | { status: 'pending'; deadline: string }
  | { status: 'resolved'; outcome: 'mutual' | 'non_mutual'; matchId?: string };

type SessionStateRecord = {
  sessionId: string;
  userAId: string;
  userBId: string;
  endAt: string;
};

@Injectable()
export class SessionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SessionService.name);
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly choiceTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly videoService: VideoService,
    private readonly videoGateway: VideoGateway,
    private readonly notificationsService: NotificationsService,
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
    @Optional() private readonly analyticsService?: AnalyticsService,
  ) {}

  async onModuleInit() {
    await this.recoverSessionEndTimers();
    await this.recoverChoiceTimeouts();
  }

  onModuleDestroy() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    for (const timer of this.choiceTimers.values()) {
      clearTimeout(timer);
    }
    this.choiceTimers.clear();
  }

  private async recoverSessionEndTimers() {
    const sessionStateKeys = await this.redis.keys('session:state:*');

    for (const key of sessionStateKeys) {
      const state = this.parseSessionState(await this.redis.get(key));
      if (!state) {
        continue;
      }

      const ended = await this.redis.get(this.sessionEndedKey(state.sessionId));
      if (ended) {
        continue;
      }

      const endAt = new Date(state.endAt);
      if (Number.isNaN(endAt.getTime())) {
        this.logger.warn(`Skipping invalid session endAt for ${state.sessionId}`);
        continue;
      }

      if (endAt.getTime() <= Date.now()) {
        await this.endSession(
          this.buildSyntheticSession(state.sessionId, state.userAId, state.userBId),
          'timeout',
        );
        continue;
      }

      this.scheduleSessionEnd(state.sessionId, state.userAId, state.userBId, endAt);
    }
  }

  private async recoverChoiceTimeouts() {
    const deadlineKeys = await this.redis.keys('session:choice:deadline:*');

    for (const key of deadlineKeys) {
      const sessionId = key.replace('session:choice:deadline:', '');
      if (sessionId.length === 0) {
        continue;
      }

      const decision = await this.redis.get(this.sessionDecisionKey(sessionId));
      if (decision) {
        continue;
      }

      const rawDeadline = await this.redis.get(key);
      if (!rawDeadline) {
        continue;
      }

      const deadline = new Date(rawDeadline);
      if (Number.isNaN(deadline.getTime())) {
        this.logger.warn(`Skipping invalid choice deadline for ${sessionId}`);
        continue;
      }

      const participants = await this.resolveSessionParticipants(sessionId);
      if (!participants) {
        continue;
      }

      if (deadline.getTime() <= Date.now()) {
        await this.finalizeDecision(
          this.buildSyntheticSession(sessionId, participants.userAId, participants.userBId),
          'PASS',
          'PASS',
        );
        continue;
      }

      this.scheduleChoiceTimeout(
        sessionId,
        participants.userAId,
        participants.userBId,
        deadline,
      );
    }
  }

  async handleSessionCreated(session: Session) {
    const lockKey = this.sessionLockKey(session.id);
    const lockAcquired = await this.redis.set(
      lockKey,
      '1',
      'PX',
      SESSION_LOCK_TTL_MS,
      'NX',
    );
    if (!lockAcquired) {
      return;
    }

    const startAt = new Date();
    const endAt = new Date(startAt.getTime() + SESSION_DURATION_MS);

    try {
      const tokens = this.videoService.buildSessionTokens(session.id, [
        session.userAId,
        session.userBId,
      ]);

      await this.persistSessionState(
        session,
        tokens.channelName,
        startAt,
        endAt,
      );

      const payloadBase = {
        sessionId: session.id,
        channelName: tokens.channelName,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        expiresAt: tokens.expiresAt.toISOString(),
        durationSeconds: SESSION_DURATION_MS / 1000,
      };

      const userATokens = tokens.byUser[session.userAId];
      const userBTokens = tokens.byUser[session.userBId];

      this.videoGateway.emitSessionStart(session.userAId, {
        ...payloadBase,
        rtc: { token: userATokens.rtcToken, uid: userATokens.rtcUid },
        rtm: { token: userATokens.rtmToken, userId: userATokens.rtmUserId },
      });

      this.videoGateway.emitSessionStart(session.userBId, {
        ...payloadBase,
        rtc: { token: userBTokens.rtcToken, uid: userBTokens.rtcUid },
        rtm: { token: userBTokens.rtmToken, userId: userBTokens.rtmUserId },
      });

      this.analyticsService?.trackServerEvent({
        userId: session.userAId,
        name: 'session_started',
        properties: {
          sessionId: session.id,
          durationSeconds: SESSION_DURATION_MS / 1000,
        },
      });
      this.analyticsService?.trackServerEvent({
        userId: session.userBId,
        name: 'session_started',
        properties: {
          sessionId: session.id,
          durationSeconds: SESSION_DURATION_MS / 1000,
        },
      });

      this.scheduleSessionEnd(
        session.id,
        session.userAId,
        session.userBId,
        endAt,
      );
    } catch (error) {
      this.logger.error(`Failed to start session ${session.id}: ${error}`);
      await this.endSession(session, 'token_error');
    }
  }

  async endSession(
    session: Session,
    reason: 'timeout' | 'ended' | 'token_error' = 'timeout',
  ) {
    const endedKey = this.sessionEndedKey(session.id);
    const alreadyEnded = await this.redis.set(
      endedKey,
      '1',
      'PX',
      SESSION_STATE_TTL_MS,
      'NX',
    );
    if (!alreadyEnded) {
      return;
    }

    const timer = this.timers.get(session.id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(session.id);
    }

    await this.redis.del(
      this.sessionActiveKey(session.userAId),
      this.sessionActiveKey(session.userBId),
    );

    const endedAt = new Date().toISOString();
    this.videoGateway.emitSessionEnd(session.userAId, {
      sessionId: session.id,
      reason,
      endedAt,
    });
    this.videoGateway.emitSessionEnd(session.userBId, {
      sessionId: session.id,
      reason,
      endedAt,
    });

    this.analyticsService?.trackServerEvent({
      userId: session.userAId,
      name: 'session_ended',
      properties: {
        sessionId: session.id,
        endReason: reason,
      },
    });
    this.analyticsService?.trackServerEvent({
      userId: session.userBId,
      name: 'session_ended',
      properties: {
        sessionId: session.id,
        endReason: reason,
      },
    });

    const deadline = await this.ensureChoiceDeadline(session.id);
    this.scheduleChoiceTimeout(
      session.id,
      session.userAId,
      session.userBId,
      deadline,
    );
  }

  private scheduleSessionEnd(
    sessionId: string,
    userAId: string,
    userBId: string,
    endAt: Date,
  ) {
    const existingTimer = this.timers.get(sessionId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.timers.delete(sessionId);
    }

    const delay = Math.max(0, endAt.getTime() - Date.now());
    const timer = setTimeout(() => {
      void this.endSession(
        this.buildSyntheticSession(sessionId, userAId, userBId),
        'timeout',
      );
    }, delay);

    this.timers.set(sessionId, timer);
  }

  private async persistSessionState(
    session: Session,
    channelName: string,
    startAt: Date,
    endAt: Date,
  ) {
    const state = {
      sessionId: session.id,
      userAId: session.userAId,
      userBId: session.userBId,
      channelName,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
    };

    await this.redis.set(
      this.sessionStateKey(session.id),
      JSON.stringify(state),
      'PX',
      SESSION_STATE_TTL_MS,
    );
    await this.redis.set(
      this.sessionActiveKey(session.userAId),
      session.id,
      'PX',
      SESSION_STATE_TTL_MS,
    );
    await this.redis.set(
      this.sessionActiveKey(session.userBId),
      session.id,
      'PX',
      SESSION_STATE_TTL_MS,
    );
  }

  async submitChoice(
    sessionId: string,
    userId: string,
    choice: SessionChoice,
  ): Promise<ChoiceResult> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.userAId !== userId && session.userBId !== userId) {
      throw new ForbiddenException('Not a session participant');
    }

    const ended = await this.redis.get(this.sessionEndedKey(sessionId));
    if (!ended) {
      throw new BadRequestException('Session has not ended');
    }

    const storedDecision = await this.getDecision(sessionId);
    if (storedDecision) {
      return storedDecision;
    }

    const deadline = await this.ensureChoiceDeadline(sessionId);
    const choiceKey = this.sessionChoiceKey(sessionId);

    const existingChoice = await this.redis.hget(choiceKey, userId);
    if (existingChoice) {
      return this.evaluateChoices(session, deadline);
    }

    await this.redis.hset(choiceKey, userId, choice);
    await this.redis.pexpire(
      choiceKey,
      Math.max(1, deadline.getTime() - Date.now()),
    );

    this.analyticsService?.trackServerEvent({
      userId,
      name: 'session_choice_submitted',
      properties: {
        sessionId,
        choice,
      },
    });

    return this.evaluateChoices(session, deadline);
  }

  private async evaluateChoices(
    session: Session,
    deadline: Date,
  ): Promise<ChoiceResult> {
    const choiceKey = this.sessionChoiceKey(session.id);
    const [choiceA, choiceB] = (await this.redis.hmget(
      choiceKey,
      session.userAId,
      session.userBId,
    )) as Array<SessionChoice | null>;

    if (choiceA === 'PASS' || choiceB === 'PASS') {
      return this.finalizeDecision(
        session,
        choiceA ?? 'PASS',
        choiceB ?? 'PASS',
      );
    }

    if (choiceA === 'MATCH' && choiceB === 'MATCH') {
      return this.finalizeDecision(session, choiceA, choiceB);
    }

    if (Date.now() >= deadline.getTime()) {
      return this.finalizeDecision(
        session,
        choiceA ?? 'PASS',
        choiceB ?? 'PASS',
      );
    }

    return { status: 'pending', deadline: deadline.toISOString() };
  }

  private async finalizeDecision(
    session: Session,
    choiceA: SessionChoice,
    choiceB: SessionChoice,
  ): Promise<ChoiceResult> {
    const decisionKey = this.sessionDecisionKey(session.id);
    const existing = await this.getDecision(session.id);
    if (existing) {
      return existing;
    }

    const outcome =
      choiceA === 'MATCH' && choiceB === 'MATCH' ? 'mutual' : 'non_mutual';
    let matchId: string | undefined;

    if (outcome === 'mutual') {
      const [userLow, userHigh] = this.canonicalPair(
        session.userAId,
        session.userBId,
      );

      const match = await this.prisma.match.upsert({
        where: {
          userAId_userBId: {
            userAId: userLow,
            userBId: userHigh,
          },
        },
        update: {},
        create: {
          userAId: userLow,
          userBId: userHigh,
        },
      });
      matchId = match.id;
    }

    const payload: ChoiceResult =
      outcome === 'mutual'
        ? { status: 'resolved', outcome, matchId }
        : { status: 'resolved', outcome };

    const stored = await this.redis.set(
      decisionKey,
      JSON.stringify(payload),
      'PX',
      CHOICE_STATE_TTL_MS,
      'NX',
    );

    if (!stored) {
      const cached = await this.getDecision(session.id);
      return cached ?? payload;
    }

    this.analyticsService?.trackServerEvent({
      userId: session.userAId,
      name: 'session_choice_resolved',
      properties: {
        sessionId: session.id,
        outcome,
        hasMatch: Boolean(matchId),
      },
    });
    this.analyticsService?.trackServerEvent({
      userId: session.userBId,
      name: 'session_choice_resolved',
      properties: {
        sessionId: session.id,
        outcome,
        hasMatch: Boolean(matchId),
      },
    });

    if (outcome === 'mutual') {
      this.emitMatchMutual(session, matchId ?? '');
      void this.notificationsService.notifyUsers(
        [session.userAId, session.userBId],
        'match_mutual',
        {
          sessionId: session.id,
          matchId,
        },
      );
    } else {
      this.emitMatchNonMutual(session);
    }

    const timer = this.choiceTimers.get(session.id);
    if (timer) {
      clearTimeout(timer);
      this.choiceTimers.delete(session.id);
    }

    return payload;
  }

  private emitMatchMutual(session: Session, matchId: string) {
    const payload = { sessionId: session.id, matchId };
    this.emitToUsers(session, 'match:mutual', payload);
  }

  private emitMatchNonMutual(session: Session) {
    const payload = { sessionId: session.id, outcome: 'pass' };
    this.emitToUsers(session, 'match:non_mutual', payload);
  }

  private emitToUsers(
    session: Session,
    event: string,
    payload: Record<string, unknown>,
  ) {
    if (!this.videoGateway.server) {
      return;
    }
    this.videoGateway.server
      .to(this.userRoom(session.userAId))
      .emit(event, payload);
    this.videoGateway.server
      .to(this.userRoom(session.userBId))
      .emit(event, payload);
  }

  private userRoom(userId: string) {
    return `user:${userId}`;
  }

  private canonicalPair(userAId: string, userBId: string): [string, string] {
    return userAId < userBId ? [userAId, userBId] : [userBId, userAId];
  }

  private async getDecision(sessionId: string): Promise<ChoiceResult | null> {
    const stored = await this.redis.get(this.sessionDecisionKey(sessionId));
    if (!stored) {
      return null;
    }
    return JSON.parse(stored) as ChoiceResult;
  }

  private async ensureChoiceDeadline(sessionId: string): Promise<Date> {
    const key = this.sessionChoiceDeadlineKey(sessionId);
    const existing = await this.redis.get(key);
    if (existing) {
      return new Date(existing);
    }

    const deadline = new Date(Date.now() + CHOICE_WINDOW_MS);
    await this.redis.set(
      key,
      deadline.toISOString(),
      'PX',
      CHOICE_STATE_TTL_MS,
      'NX',
    );
    return deadline;
  }

  private scheduleChoiceTimeout(
    sessionId: string,
    userAId: string,
    userBId: string,
    deadline: Date,
  ) {
    const existingTimer = this.choiceTimers.get(sessionId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.choiceTimers.delete(sessionId);
    }

    const delay = Math.max(0, deadline.getTime() - Date.now());
    const timer = setTimeout(() => {
      void this.finalizeDecision(
        this.buildSyntheticSession(sessionId, userAId, userBId),
        'PASS',
        'PASS',
      );
    }, delay);

    this.choiceTimers.set(sessionId, timer);
  }

  async cleanupExpiredSessions() {
    const cutoff = new Date(Date.now() - SESSION_RETENTION_MS);
    const result = await this.prisma.session.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    if (result.count > 0) {
      this.logger.log(`Deleted ${result.count} expired sessions`);
    }
  }

  private async resolveSessionParticipants(
    sessionId: string,
  ): Promise<{ userAId: string; userBId: string } | null> {
    const state = this.parseSessionState(
      await this.redis.get(this.sessionStateKey(sessionId)),
    );
    if (state) {
      return { userAId: state.userAId, userBId: state.userBId };
    }

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { userAId: true, userBId: true },
    });
    if (!session) {
      this.logger.warn(`Skipping choice recovery for missing session ${sessionId}`);
      return null;
    }

    return session;
  }

  private buildSyntheticSession(
    sessionId: string,
    userAId: string,
    userBId: string,
  ): Session {
    return {
      id: sessionId,
      userAId,
      userBId,
      region: null,
      queueKey: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
  }

  private parseSessionState(raw: string | null): SessionStateRecord | null {
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<SessionStateRecord>;
      if (
        typeof parsed.sessionId !== 'string' ||
        typeof parsed.userAId !== 'string' ||
        typeof parsed.userBId !== 'string' ||
        typeof parsed.endAt !== 'string'
      ) {
        return null;
      }
      return {
        sessionId: parsed.sessionId,
        userAId: parsed.userAId,
        userBId: parsed.userBId,
        endAt: parsed.endAt,
      };
    } catch {
      return null;
    }
  }

  private sessionStateKey(sessionId: string) {
    return `session:state:${sessionId}`;
  }

  private sessionActiveKey(userId: string) {
    return `session:active:${userId}`;
  }

  private sessionLockKey(sessionId: string) {
    return `session:lock:${sessionId}`;
  }

  private sessionEndedKey(sessionId: string) {
    return `session:ended:${sessionId}`;
  }

  private sessionChoiceKey(sessionId: string) {
    return `session:choice:${sessionId}`;
  }

  private sessionChoiceDeadlineKey(sessionId: string) {
    return `session:choice:deadline:${sessionId}`;
  }

  private sessionDecisionKey(sessionId: string) {
    return `session:decision:${sessionId}`;
  }
}
