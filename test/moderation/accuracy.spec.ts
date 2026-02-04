import { ModerationService } from '../../src/moderation/moderation.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SessionService } from '../../src/session/session.service';
import { VideoGateway } from '../../src/video/video.gateway';
import { REDIS_CLIENT } from '../../src/common/redis.provider';
import { createPrismaMock } from '../mocks/prisma.mock';
import { createRedisMock } from '../mocks/redis.mock';
import { MODERATION_TEST_CASES, ModerationTestCase } from './mock-payloads';

const buildService = () => {
  const prisma = createPrismaMock();
  const redis = createRedisMock();
  const sessionService = { endSession: jest.fn() };
  const emitted: Array<{ event: string; payload: any }> = [];
  const videoGateway = {
    server: {
      to: jest.fn(() => ({
        emit: (event: string, payload: any) => {
          emitted.push({ event, payload });
        },
      })),
    },
  };

  const service = new ModerationService(
    prisma as unknown as PrismaService,
    sessionService as unknown as SessionService,
    redis as unknown as any,
    videoGateway as unknown as VideoGateway,
  );

  return { service, prisma, redis, sessionService, emitted };
};

const seedSession = (prisma: ReturnType<typeof createPrismaMock>, testCase: ModerationTestCase) => {
  const userId = testCase.payload.userId ?? 'user-a';
  prisma.session.findUnique.mockResolvedValue({
    id: testCase.payload.sessionId,
    userAId: userId,
    userBId: 'user-b',
  });
};

describe('Moderation Accuracy Suite', () => {
  it.each(MODERATION_TEST_CASES)(
    'handles $id ($expectedAction)',
    async (testCase) => {
      const { service, prisma, redis, sessionService } = buildService();

      seedSession(prisma, testCase);
      prisma.moderationEvent.create.mockResolvedValue({ id: 'event-1' });
      prisma.moderationEvent.count.mockImplementation(({ where }) =>
        where.userId === 'user-repeat' ? 3 : 0,
      );

      await service.handleWebhook(testCase.payload as any);

      const terminated = sessionService.endSession.mock.calls.length > 0;

      if (testCase.expectedAction === 'none') {
        expect(terminated).toBe(false);
      } else {
        expect(terminated).toBe(true);
        expect(prisma.moderationEvent.create).toHaveBeenCalled();
      }

      if (testCase.expectedAction === 'ban') {
        expect(await redis.get(`moderation:ban:${testCase.payload.userId}`)).toBe(
          '1',
        );
      }
    },
  );

  it('ensures non-violations do not trigger termination', async () => {
    for (const testCase of MODERATION_TEST_CASES.filter(
      (item) => !item.isViolation,
    )) {
      const { service, prisma, sessionService } = buildService();
      seedSession(prisma, testCase);
      prisma.moderationEvent.count.mockResolvedValue(0);

      await service.handleWebhook(testCase.payload as any);

      expect(sessionService.endSession).not.toHaveBeenCalled();
    }
  });

  it('keeps false positive rate below 5%', async () => {
    let falsePositives = 0;
    let nonViolationCount = 0;

    for (const testCase of MODERATION_TEST_CASES) {
      const { service, prisma, sessionService } = buildService();
      seedSession(prisma, testCase);
      prisma.moderationEvent.count.mockImplementation(({ where }) =>
        where.userId === 'user-repeat' ? 3 : 0,
      );

      await service.handleWebhook(testCase.payload as any);

      const terminated = sessionService.endSession.mock.calls.length > 0;
      if (!testCase.isViolation) {
        nonViolationCount += 1;
        if (terminated) {
          falsePositives += 1;
        }
      }
    }

    const rate = nonViolationCount === 0 ? 0 : falsePositives / nonViolationCount;
    expect(rate).toBeLessThan(0.05);
  });

  it('enforces false negative tolerance on violations', async () => {
    let falseNegatives = 0;
    let violationCount = 0;

    for (const testCase of MODERATION_TEST_CASES.filter(
      (item) => item.isViolation,
    )) {
      const { service, prisma, sessionService } = buildService();
      seedSession(prisma, testCase);
      prisma.moderationEvent.count.mockImplementation(({ where }) =>
        where.userId === 'user-repeat' ? 3 : 0,
      );

      await service.handleWebhook(testCase.payload as any);

      const terminated = sessionService.endSession.mock.calls.length > 0;
      violationCount += 1;
      if (!terminated) {
        falseNegatives += 1;
      }
    }

    const rate = violationCount === 0 ? 0 : falseNegatives / violationCount;
    expect(rate).toBeLessThanOrEqual(0.05);
  });
});
