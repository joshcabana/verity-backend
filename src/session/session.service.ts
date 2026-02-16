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
import {
  buildPartnerReveal,
  PARTNER_REVEAL_VERSION,
  type PartnerReveal,
} from '../matches/reveal.types';

const SESSION_DURATION_MS = 45_000;
const SESSION_STATE_TTL_MS = 60 * 60 * 1000;
const SESSION_LOCK_TTL_MS = 10_000;
const CHOICE_WINDOW_MS = 60_000;
const CHOICE_STATE_TTL_MS = 2 * 60 * 60 * 1000;
const SESSION_RETENTION_MS = 24 * 60 * 60 * 1000;
const RECOVERY_SCAN_COUNT = 200;
const RECOVERY_MAX_KEYS = 10_000;
const RECOVERY_MAX_DURATION_MS = 5_000;

type SessionChoice = 'MATCH' | 'PASS';

type PendingChoiceResult = { status: 'pending'; deadline: string };
type MutualResolvedChoiceResult = {
  status: 'resolved';
  outcome: 'mutual';
  matchId: string;
  partnerRevealVersion?: typeof PARTNER_REVEAL_VERSION;
  partnerReveal?: PartnerReveal;
};
type NonMutualResolvedChoiceResult = {
  status: 'resolved';
  outcome: 'non_mutual';
};

type ChoiceResult =
  | PendingChoiceResult
  | MutualResolvedChoiceResult
  | NonMutualResolvedChoiceResult;

type SessionStateRecord = {
  sessionId: string;
  userAId: string;
  userBId: string;
  endAt: string;
};

type ResolvedChoiceResult = Extract<ChoiceResult, { status: 'resolved' }>;

type ParsedStoredDecision =
  | { kind: 'none' }
  | { kind: 'invalid' }
  | { kind: 'resolved'; value: ResolvedChoiceResult }
  | { kind: 'pending'; value: PendingChoiceResult; deadline: Date };

type ScanKeysResult = {
  keys: string[];
  scanned: number;
  truncated: boolean;
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
    const startedAt = Date.now();
    const scanResult = await this.scanKeys('session:state:*');
    let truncated = scanResult.truncated;
    let invalidState = 0;
    let skippedEnded = 0;
    let finalizedOverdue = 0;
    let rescheduled = 0;

    for (const key of scanResult.keys) {
      if (Date.now() - startedAt >= RECOVERY_MAX_DURATION_MS) {
        truncated = true;
        break;
      }

      const state = this.parseSessionState(await this.redis.get(key));
      if (!state) {
        invalidState += 1;
        continue;
      }

      const ended = await this.redis.get(this.sessionEndedKey(state.sessionId));
      if (ended) {
        skippedEnded += 1;
        continue;
      }

      const endAt = this.parseIsoDate(state.endAt);
      if (!endAt) {
        invalidState += 1;
        this.logger.warn(
          `Skipping invalid session endAt for ${state.sessionId}`,
        );
        continue;
      }

      if (endAt.getTime() <= Date.now()) {
        await this.endSession(
          this.buildSyntheticSession(
            state.sessionId,
            state.userAId,
            state.userBId,
          ),
          'timeout',
        );
        finalizedOverdue += 1;
        continue;
      }

      this.scheduleSessionEnd(
        state.sessionId,
        state.userAId,
        state.userBId,
        endAt,
      );
      rescheduled += 1;
    }

    const durationMs = Date.now() - startedAt;
    if (truncated) {
      this.logger.warn(
        `Session recovery truncated scanned=${scanResult.scanned} durationMs=${durationMs}`,
      );
    }
    this.logger.log(
      `Session recovery summary scanned=${scanResult.scanned} invalidState=${invalidState} skippedEnded=${skippedEnded} finalizedOverdue=${finalizedOverdue} rescheduled=${rescheduled} truncated=${truncated} durationMs=${durationMs}`,
    );
  }

  private async recoverChoiceTimeouts() {
    const startedAt = Date.now();
    const scanResult = await this.scanKeys('session:choice:deadline:*');
    let truncated = scanResult.truncated;
    let skippedResolved = 0;
    let pendingFinalized = 0;
    let pendingRescheduled = 0;
    let deadlineFromKeyFinalized = 0;
    let deadlineFromKeyRescheduled = 0;
    let invalidDecisionPayload = 0;
    let invalidOrMissingDeadline = 0;
    let missingParticipants = 0;

    for (const key of scanResult.keys) {
      if (Date.now() - startedAt >= RECOVERY_MAX_DURATION_MS) {
        truncated = true;
        break;
      }

      const sessionId = key.replace('session:choice:deadline:', '');
      if (sessionId.length === 0) {
        invalidOrMissingDeadline += 1;
        continue;
      }

      const parsedDecision = await this.readStoredDecision(sessionId);
      if (parsedDecision.kind === 'resolved') {
        skippedResolved += 1;
        continue;
      }

      let deadline: Date | null = null;
      let deadlineSource: 'pending' | 'key' = 'key';

      if (parsedDecision.kind === 'pending') {
        deadline = parsedDecision.deadline;
        deadlineSource = 'pending';
      } else {
        if (parsedDecision.kind === 'invalid') {
          invalidDecisionPayload += 1;
        }
        const rawDeadline = await this.redis.get(key);
        if (!rawDeadline) {
          invalidOrMissingDeadline += 1;
          continue;
        }
        deadline = this.parseIsoDate(rawDeadline);
        if (!deadline) {
          invalidOrMissingDeadline += 1;
          this.logger.warn(`Skipping invalid choice deadline for ${sessionId}`);
          continue;
        }
      }

      const participants = await this.resolveSessionParticipants(sessionId);
      if (!participants) {
        missingParticipants += 1;
        continue;
      }

      if (deadline.getTime() <= Date.now()) {
        await this.finalizeDecision(
          this.buildSyntheticSession(
            sessionId,
            participants.userAId,
            participants.userBId,
          ),
          'PASS',
          'PASS',
        );
        if (deadlineSource === 'pending') {
          pendingFinalized += 1;
        } else {
          deadlineFromKeyFinalized += 1;
        }
        continue;
      }

      this.scheduleChoiceTimeout(
        sessionId,
        participants.userAId,
        participants.userBId,
        deadline,
      );
      if (deadlineSource === 'pending') {
        pendingRescheduled += 1;
      } else {
        deadlineFromKeyRescheduled += 1;
      }
    }

    const durationMs = Date.now() - startedAt;
    if (truncated) {
      this.logger.warn(
        `Choice recovery truncated scanned=${scanResult.scanned} durationMs=${durationMs}`,
      );
    }
    this.logger.log(
      `Choice recovery summary scanned=${scanResult.scanned} skippedResolved=${skippedResolved} pendingFinalized=${pendingFinalized} pendingRescheduled=${pendingRescheduled} deadlineFromKeyFinalized=${deadlineFromKeyFinalized} deadlineFromKeyRescheduled=${deadlineFromKeyRescheduled} invalidDecisionPayload=${invalidDecisionPayload} invalidOrMissingDeadline=${invalidOrMissingDeadline} missingParticipants=${missingParticipants} truncated=${truncated} durationMs=${durationMs}`,
    );
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

    const durationSeconds = Math.max(
      0,
      Math.round((Date.now() - session.createdAt.getTime()) / 1000),
    );
    const endedBy = this.mapEndedBy(reason);

    this.analyticsService?.trackServerEvent({
      userId: session.userAId,
      name: 'session_ended',
      properties: {
        sessionId: session.id,
        endReason: reason,
        endedBy,
        durationSeconds,
      },
    });
    this.analyticsService?.trackServerEvent({
      userId: session.userBId,
      name: 'session_ended',
      properties: {
        sessionId: session.id,
        endReason: reason,
        endedBy,
        durationSeconds,
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

  private mapEndedBy(
    reason: 'timeout' | 'ended' | 'token_error',
  ): 'timer' | 'moderation' | 'error' {
    if (reason === 'timeout') {
      return 'timer';
    }
    if (reason === 'ended') {
      return 'moderation';
    }
    return 'error';
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

    const storedDecision = await this.getDecision(sessionId, session, userId);
    if (storedDecision) {
      return storedDecision;
    }

    const deadline = await this.ensureChoiceDeadline(sessionId);
    const choiceKey = this.sessionChoiceKey(sessionId);

    const existingChoice = await this.redis.hget(choiceKey, userId);
    if (existingChoice) {
      const evaluated = await this.evaluateChoices(session, deadline);
      return this.enrichChoiceResultForUser(evaluated, session, userId);
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

    const evaluated = await this.evaluateChoices(session, deadline);
    return this.enrichChoiceResultForUser(evaluated, session, userId);
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
    const existing = await this.readStoredDecision(session.id);
    if (existing.kind === 'resolved') {
      return existing.value;
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

    if (outcome === 'mutual' && !matchId) {
      throw new Error(
        `Mutual decision missing matchId for session ${session.id}`,
      );
    }

    const payload: ChoiceResult =
      outcome === 'mutual'
        ? { status: 'resolved', outcome, matchId: matchId as string }
        : { status: 'resolved', outcome };

    const stored =
      existing.kind === 'pending'
        ? await this.redis.set(
            decisionKey,
            JSON.stringify(payload),
            'PX',
            CHOICE_STATE_TTL_MS,
          )
        : await this.redis.set(
            decisionKey,
            JSON.stringify(payload),
            'PX',
            CHOICE_STATE_TTL_MS,
            'NX',
          );

    if (!stored) {
      const cached = await this.readStoredDecision(session.id);
      if (cached.kind === 'resolved') {
        return cached.value;
      }
      if (cached.kind === 'pending') {
        await this.redis.set(
          decisionKey,
          JSON.stringify(payload),
          'PX',
          CHOICE_STATE_TTL_MS,
        );
      }
    }

    const resolvedResult = outcome === 'mutual' ? 'mutual_match' : 'non_mutual';
    const bothPassed = choiceA === 'PASS' && choiceB === 'PASS';

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
      userId: session.userAId,
      name: 'session_result',
      properties: {
        sessionId: session.id,
        result: resolvedResult,
        bothPassed,
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
    this.analyticsService?.trackServerEvent({
      userId: session.userBId,
      name: 'session_result',
      properties: {
        sessionId: session.id,
        result: resolvedResult,
        bothPassed,
        hasMatch: Boolean(matchId),
      },
    });

    if (outcome === 'mutual') {
      await this.emitMatchMutual(session, matchId as string);
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

  private async emitMatchMutual(session: Session, matchId: string) {
    const payloadBase = {
      sessionId: session.id,
      matchId,
    };

    const [revealForUserA, revealForUserB] = await Promise.all([
      this.buildPartnerRevealForUser(session, session.userAId),
      this.buildPartnerRevealForUser(session, session.userBId),
    ]);

    const payloadForUserA: Record<string, unknown> = { ...payloadBase };
    if (revealForUserA) {
      payloadForUserA.partnerRevealVersion = PARTNER_REVEAL_VERSION;
      payloadForUserA.partnerReveal = revealForUserA;
    }

    const payloadForUserB: Record<string, unknown> = { ...payloadBase };
    if (revealForUserB) {
      payloadForUserB.partnerRevealVersion = PARTNER_REVEAL_VERSION;
      payloadForUserB.partnerReveal = revealForUserB;
    }

    this.emitToUser(session.userAId, 'match:mutual', payloadForUserA);
    this.emitToUser(session.userBId, 'match:mutual', payloadForUserB);
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
    this.emitToUser(session.userAId, event, payload);
    this.emitToUser(session.userBId, event, payload);
  }

  private emitToUser(
    userId: string,
    event: string,
    payload: Record<string, unknown>,
  ) {
    if (!this.videoGateway.server) {
      return;
    }
    this.videoGateway.server.to(this.userRoom(userId)).emit(event, payload);
  }

  private userRoom(userId: string) {
    return `user:${userId}`;
  }

  private canonicalPair(userAId: string, userBId: string): [string, string] {
    return userAId < userBId ? [userAId, userBId] : [userBId, userAId];
  }

  private async getDecision(
    sessionId: string,
    session: Session,
    userId: string,
  ): Promise<ChoiceResult | null> {
    const parsed = await this.readStoredDecision(sessionId);
    if (parsed.kind === 'none' || parsed.kind === 'invalid') {
      return null;
    }
    return this.enrichChoiceResultForUser(parsed.value, session, userId);
  }

  private async enrichChoiceResultForUser(
    result: ChoiceResult,
    session: Session,
    userId: string,
  ): Promise<ChoiceResult> {
    if (
      result.status !== 'resolved' ||
      result.outcome !== 'mutual' ||
      typeof result.matchId !== 'string'
    ) {
      return result;
    }

    const partnerReveal = await this.buildPartnerRevealForUser(session, userId);
    if (!partnerReveal) {
      return result;
    }

    return {
      ...result,
      partnerRevealVersion: PARTNER_REVEAL_VERSION,
      partnerReveal,
    };
  }

  private async buildPartnerRevealForUser(
    session: Session,
    userId: string,
  ): Promise<PartnerReveal | null> {
    const partnerId =
      session.userAId === userId
        ? session.userBId
        : session.userBId === userId
          ? session.userAId
          : null;

    if (!partnerId) {
      return null;
    }

    const partner = await this.prisma.user.findUnique({
      where: { id: partnerId },
      select: {
        id: true,
        displayName: true,
        photos: true,
        age: true,
        bio: true,
      },
    });
    if (!partner) {
      return null;
    }
    return buildPartnerReveal(partner);
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
      this.logger.warn(
        `Skipping choice recovery for missing session ${sessionId}`,
      );
      return null;
    }

    return session;
  }

  private async scanKeys(pattern: string): Promise<ScanKeysResult> {
    const keys = new Set<string>();
    let cursor = '0';
    let scanned = 0;
    const startedAt = Date.now();
    let truncated = false;

    do {
      const [nextCursor, pageKeys] = await this.redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        RECOVERY_SCAN_COUNT,
      );
      scanned += pageKeys.length;
      for (const key of pageKeys) {
        if (keys.size >= RECOVERY_MAX_KEYS) {
          truncated = true;
          break;
        }
        keys.add(key);
      }
      cursor = nextCursor;
      if (truncated || Date.now() - startedAt >= RECOVERY_MAX_DURATION_MS) {
        truncated = true;
        break;
      }
    } while (cursor !== '0');

    return { keys: Array.from(keys), scanned, truncated };
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

  private async readStoredDecision(
    sessionId: string,
  ): Promise<ParsedStoredDecision> {
    const raw = await this.redis.get(this.sessionDecisionKey(sessionId));
    return this.parseStoredDecision(raw);
  }

  private parseStoredDecision(raw: string | null): ParsedStoredDecision {
    if (!raw) {
      return { kind: 'none' };
    }

    try {
      const parsed = JSON.parse(raw) as
        | Partial<PendingChoiceResult>
        | Partial<MutualResolvedChoiceResult>
        | Partial<NonMutualResolvedChoiceResult>;
      if (
        parsed.status === 'resolved' &&
        parsed.outcome === 'mutual' &&
        typeof parsed.matchId === 'string'
      ) {
        const resolved: ResolvedChoiceResult = {
          status: 'resolved',
          outcome: 'mutual',
          matchId: parsed.matchId,
        };
        return { kind: 'resolved', value: resolved };
      }

      if (parsed.status === 'resolved' && parsed.outcome === 'non_mutual') {
        const resolved: ResolvedChoiceResult = {
          status: 'resolved',
          outcome: 'non_mutual',
        };
        return { kind: 'resolved', value: resolved };
      }

      if (parsed.status === 'pending' && typeof parsed.deadline === 'string') {
        const deadline = this.parseIsoDate(parsed.deadline);
        if (!deadline) {
          return { kind: 'invalid' };
        }
        return {
          kind: 'pending',
          value: { status: 'pending', deadline: parsed.deadline },
          deadline,
        };
      }

      return { kind: 'invalid' };
    } catch {
      return { kind: 'invalid' };
    }
  }

  private parseIsoDate(value: string): Date | null {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed;
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
