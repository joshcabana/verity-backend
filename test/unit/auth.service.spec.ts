import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { createHash } from 'crypto';
import { AuthService } from '../../src/auth/auth.service';
import { AppService } from '../../src/app.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createPrismaMock, createPrismaUniqueError } from '../mocks/prisma.mock';

const REFRESH_COOKIE_NAME = 'refresh_token';

describe('AuthService (unit)', () => {
  const originalEnv = { ...process.env };
  let service: AuthService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let jwt: JwtService;

  beforeEach(async () => {
    process.env.JWT_ACCESS_SECRET = 'test-access';
    process.env.JWT_REFRESH_SECRET = 'test-refresh';
    prisma = createPrismaMock();
    jwt = new JwtService({} as any);

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('rejects invalid or underage date of birth', async () => {
    await expect(
      service.signupAnonymous(undefined, undefined, { dateOfBirth: 'not-a-date' }),
    ).rejects.toThrow(BadRequestException);

    const underage = new Date();
    underage.setFullYear(underage.getFullYear() - 17);

    await expect(
      service.signupAnonymous(undefined, undefined, {
        dateOfBirth: underage.toISOString(),
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('signs up anonymous user and issues tokens', async () => {
    prisma.user.create.mockResolvedValue({ id: 'user-1' });
    prisma.refreshToken.create.mockResolvedValue({ id: 'refresh-1' });

    const result = await service.signupAnonymous('ua', 'ip', {
      dateOfBirth: '1990-01-01',
      consents: { marketing: true },
      privacyNoticeVersion: '1',
      tosVersion: '2',
    });

    expect(result.user.id).toBe('user-1');
    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toEqual(expect.any(String));

    const createArgs = prisma.user.create.mock.calls[0][0];
    expect(createArgs.data.consents).toHaveProperty('marketing', true);
    expect(createArgs.data.consents).toHaveProperty('acceptedAt');
  });

  it('validates phone/email and handles unique conflicts', async () => {
    await expect(
      service.verifyPhone('user-1', 'abc', '1234'),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.verifyEmail('user-1', 'test@example.com', ' '),
    ).rejects.toThrow(BadRequestException);

    prisma.user.update.mockRejectedValue(createPrismaUniqueError());

    await expect(
      service.verifyEmail('user-1', 'test@example.com', '1234'),
    ).rejects.toThrow(ConflictException);
  });

  it('issues tokens and stores refresh token record', async () => {
    prisma.refreshToken.create.mockResolvedValue({ id: 'refresh-1' });

    const tokens = await service.issueTokens('user-1', {
      userAgent: 'ua',
      ipAddress: 'ip',
    });

    expect(tokens.accessToken).toEqual(expect.any(String));
    expect(tokens.refreshToken).toEqual(expect.any(String));
    expect(prisma.refreshToken.create).toHaveBeenCalled();
  });

  it('gets current user or throws when missing', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null);

    await expect(service.getCurrentUser('user-1')).rejects.toThrow(
      'User not found',
    );

    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      displayName: 'User',
      photos: null,
      bio: null,
      age: null,
      gender: null,
      interests: [],
      phone: null,
      email: null,
      tokenBalance: 0,
    });

    const user = await service.getCurrentUser('user-1');
    expect(user.id).toBe('user-1');
  });

  it('exports user data and throws when missing', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null);

    await expect(service.exportUserData('user-1')).rejects.toThrow(
      'User not found',
    );

    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      displayName: 'User',
      photos: null,
      bio: null,
      age: null,
      gender: null,
      interests: [],
      phone: null,
      email: null,
      tokenBalance: 0,
      dateOfBirth: null,
      ageVerifiedAt: null,
      consents: null,
      privacyNoticeVersion: null,
      tosVersion: null,
    });
    prisma.match.findMany.mockResolvedValue([]);
    prisma.session.findMany.mockResolvedValue([]);
    prisma.message.findMany.mockResolvedValue([]);
    prisma.tokenTransaction.findMany.mockResolvedValue([]);
    prisma.moderationReport.findMany.mockResolvedValue([]);
    prisma.pushToken.findMany.mockResolvedValue([]);

    const data = await service.exportUserData('user-1');
    expect(data.user.id).toBe('user-1');
    expect(data.matches).toEqual([]);
    expect(data.pushTokens).toEqual([]);
  });

  it('rejects invalid refresh token', async () => {
    await expect(
      service.refreshSession('bad-token'),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects refresh tokens with invalid type', async () => {
    const token = await jwt.signAsync(
      { sub: 'user-1', fid: 'family-1', typ: 'access' },
      { secret: process.env.JWT_REFRESH_SECRET, jwtid: 'token-1' },
    );

    await expect(service.refreshSession(token)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects refresh when token record missing', async () => {
    const token = await jwt.signAsync(
      { sub: 'user-1', fid: 'family-1', typ: 'refresh' },
      { secret: process.env.JWT_REFRESH_SECRET, jwtid: 'token-1' },
    );
    prisma.refreshToken.findUnique.mockResolvedValue(null);

    await expect(service.refreshSession(token)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects revoked refresh token', async () => {
    const refreshToken = await jwt.signAsync(
      { sub: 'user-1', fid: 'family-1', typ: 'refresh' },
      { secret: process.env.JWT_REFRESH_SECRET, jwtid: 'token-1' },
    );
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');

    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'token-1',
      userId: 'user-1',
      familyId: 'family-1',
      tokenHash,
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(service.refreshSession(refreshToken)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects expired refresh token', async () => {
    const refreshToken = await jwt.signAsync(
      { sub: 'user-1', fid: 'family-1', typ: 'refresh' },
      { secret: process.env.JWT_REFRESH_SECRET, jwtid: 'token-1' },
    );
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');

    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'token-1',
      userId: 'user-1',
      familyId: 'family-1',
      tokenHash,
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(service.refreshSession(refreshToken)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(prisma.refreshToken.update).toHaveBeenCalled();
  });

  it('revokes family when refresh token already used', async () => {
    const refreshToken = await jwt.signAsync(
      { sub: 'user-1', fid: 'family-1', typ: 'refresh' },
      { secret: process.env.JWT_REFRESH_SECRET, jwtid: 'token-1' },
    );
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');

    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'token-1',
      userId: 'user-1',
      familyId: 'family-1',
      tokenHash,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.refreshSession(refreshToken)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
  });

  it('revokes family when refresh token hash mismatch', async () => {
    const refreshToken = await jwt.signAsync(
      { sub: 'user-1', fid: 'family-1', typ: 'refresh' },
      { secret: process.env.JWT_REFRESH_SECRET, jwtid: 'token-1' },
    );

    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'token-1',
      userId: 'user-1',
      familyId: 'family-1',
      tokenHash: 'mismatch',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      service.refreshSession(refreshToken),
    ).rejects.toThrow(UnauthorizedException);

    expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
  });

  it('rotates refresh token on successful refresh', async () => {
    const refreshToken = await jwt.signAsync(
      { sub: 'user-1', fid: 'family-1', typ: 'refresh' },
      { secret: process.env.JWT_REFRESH_SECRET, jwtid: 'token-1' },
    );
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');

    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'token-1',
      userId: 'user-1',
      familyId: 'family-1',
      tokenHash,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.refreshToken.create.mockResolvedValue({ id: 'token-2' });

    const result = await service.refreshSession(refreshToken, 'ua', 'ip');

    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toEqual(expect.any(String));
    expect(result.refreshToken).not.toEqual(refreshToken);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
    expect(prisma.refreshToken.create).toHaveBeenCalled();
  });

  it('revokes all refresh tokens on logoutAll', async () => {
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });

    await service.logoutAll('user-1');

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: expect.any(Object),
    });
  });

  it('sets and clears refresh cookie options', () => {
    process.env.NODE_ENV = 'production';
    process.env.REFRESH_COOKIE_SAMESITE = 'none';

    const response = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    } as any;

    service.setRefreshCookie(response, 'token-1');
    expect(response.cookie).toHaveBeenCalledWith(
      REFRESH_COOKIE_NAME,
      'token-1',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'none',
        secure: true,
        path: '/auth/refresh',
      }),
    );

    service.clearRefreshCookie(response);
    expect(response.clearCookie).toHaveBeenCalledWith(
      REFRESH_COOKIE_NAME,
      expect.objectContaining({ path: '/auth/refresh' }),
    );
  });

  it('returns strict sameSite and no domain for invalid cookie settings', () => {
    process.env.NODE_ENV = 'development';
    process.env.REFRESH_COOKIE_SAMESITE = 'invalid';
    process.env.REFRESH_COOKIE_DOMAIN = ' ';

    const response = { cookie: jest.fn() } as any;
    service.setRefreshCookie(response, 'token-1');

    expect(response.cookie).toHaveBeenCalledWith(
      REFRESH_COOKIE_NAME,
      'token-1',
      expect.objectContaining({
        sameSite: 'strict',
        domain: undefined,
      }),
    );
  });

  it('deletes account data within a transaction', async () => {
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
    prisma.pushToken.deleteMany.mockResolvedValue({ count: 0 });
    prisma.tokenTransaction.deleteMany.mockResolvedValue({ count: 0 });
    prisma.moderationEvent.deleteMany.mockResolvedValue({ count: 0 });
    prisma.moderationReport.deleteMany.mockResolvedValue({ count: 0 });
    prisma.message.deleteMany.mockResolvedValue({ count: 0 });
    prisma.session.deleteMany.mockResolvedValue({ count: 0 });
    prisma.match.deleteMany.mockResolvedValue({ count: 0 });
    prisma.user.delete.mockResolvedValue({ id: 'user-1' });

    await service.deleteAccount('user-1');

    expect(prisma.refreshToken.deleteMany).toHaveBeenCalled();
    expect(prisma.pushToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user-1' } });
  });
});

describe('AppService (unit)', () => {
  it('returns hello and health payload', () => {
    const appService = new AppService();

    expect(appService.getHello()).toBe('Hello World!');

    const health = appService.getHealth();
    expect(health.status).toBe('ok');
    expect(health.timestamp).toEqual(expect.any(String));
    expect(health.uptimeSeconds).toEqual(expect.any(Number));
  });
});
