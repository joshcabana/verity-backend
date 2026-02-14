import { Test } from '@nestjs/testing';
import { VideoService } from '../../src/video/video.service';
import { ModerationService } from '../../src/moderation/moderation.service';

describe('VideoService (unit)', () => {
  const originalEnv = { ...process.env };
  let service: VideoService;

  beforeEach(async () => {
    process.env.AGORA_APP_ID = 'test-app-id';
    process.env.AGORA_APP_CERTIFICATE = 'test-app-cert';
    delete process.env.AGORA_TOKEN_TTL_SECONDS;

    const moduleRef = await Test.createTestingModule({
      providers: [VideoService],
    }).compile();

    service = moduleRef.get(VideoService);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('throws when required env vars are missing', () => {
    delete process.env.AGORA_APP_ID;
    expect(() => service.buildSessionTokens('session-1', ['user-1'])).toThrow(
      /AGORA_APP_ID/,
    );

    process.env.AGORA_APP_ID = 'test-app-id';
    delete process.env.AGORA_APP_CERTIFICATE;

    expect(() => service.buildSessionTokens('session-1', ['user-1'])).toThrow(
      /AGORA_APP_CERTIFICATE/,
    );
  });

  it('builds tokens with expected structure', () => {
    const spy = jest
      .spyOn(ModerationService, 'startStreamMonitoring')
      .mockResolvedValue();

    const result = service.buildSessionTokens('session-1', [
      'user-1',
      'user-2',
    ]);

    expect(result.channelName).toBe('session_session-1');
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.byUser['user-1']).toEqual(
      expect.objectContaining({
        rtcToken: expect.any(String),
        rtmToken: expect.any(String),
        rtcUid: expect.any(Number),
        rtmUserId: 'user-1',
      }),
    );
    expect(result.byUser['user-1'].rtcToken.startsWith('007')).toBe(true);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('uses env TTL override', () => {
    process.env.AGORA_TOKEN_TTL_SECONDS = '120';
    const before = Date.now();

    const result = service.buildSessionTokens('session-2', ['user-1']);

    const delta = result.expiresAt.getTime() - before;
    expect(delta).toBeGreaterThanOrEqual(119_000);
    expect(delta).toBeLessThanOrEqual(121_000);
  });

  it('invokes startStreamMonitoring for first user', () => {
    const spy = jest
      .spyOn(ModerationService, 'startStreamMonitoring')
      .mockResolvedValue();

    service.buildSessionTokens('session-3', ['user-1', 'user-2']);

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-3',
        channelName: 'session_session-3',
        rtcToken: expect.any(String),
        rtcUid: expect.any(Number),
      }),
    );
    spy.mockRestore();
  });
});
