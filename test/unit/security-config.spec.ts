import {
  getAccessTokenSecret,
  getRefreshTokenSecret,
  isOriginAllowed,
} from '../../src/common/security-config';

describe('security-config', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('prefers explicit JWT access and refresh secrets', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_ACCESS_SECRET = 'access-secret';
    process.env.JWT_REFRESH_SECRET = 'refresh-secret';

    expect(getAccessTokenSecret()).toBe('access-secret');
    expect(getRefreshTokenSecret()).toBe('refresh-secret');
  });

  it('falls back to JWT_SECRET when typed secrets are absent', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_REFRESH_SECRET;
    process.env.JWT_SECRET = 'shared-secret';

    expect(getAccessTokenSecret()).toBe('shared-secret');
    expect(getRefreshTokenSecret()).toBe('shared-secret');
  });

  it('throws in production when JWT secrets are missing', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_REFRESH_SECRET;

    expect(() => getAccessTokenSecret()).toThrow('Missing JWT_ACCESS_SECRET');
    expect(() => getRefreshTokenSecret()).toThrow('Missing JWT_REFRESH_SECRET');
  });

  it('throws outside production when JWT secrets are missing by default', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.JWT_SECRET;
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_REFRESH_SECRET;

    expect(() => getAccessTokenSecret()).toThrow('Missing JWT_ACCESS_SECRET');
    expect(() => getRefreshTokenSecret()).toThrow('Missing JWT_REFRESH_SECRET');
  });

  it('allows local fallback secrets when insecure override is enabled', () => {
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_INSECURE_DEV_SECRETS = 'true';
    delete process.env.JWT_SECRET;
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_REFRESH_SECRET;

    expect(getAccessTokenSecret()).toBe('dev_access_secret');
    expect(getRefreshTokenSecret()).toBe('dev_refresh_secret');
  });

  it('ignores insecure override in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_INSECURE_DEV_SECRETS = 'true';
    delete process.env.JWT_SECRET;
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_REFRESH_SECRET;

    expect(() => getAccessTokenSecret()).toThrow('Missing JWT_ACCESS_SECRET');
    expect(() => getRefreshTokenSecret()).toThrow('Missing JWT_REFRESH_SECRET');
  });

  it('applies APP_ORIGINS allowlist when configured', () => {
    process.env.APP_ORIGINS = 'http://localhost:5173,https://app.verity.dev';

    expect(isOriginAllowed('http://localhost:5173')).toBe(true);
    expect(isOriginAllowed('https://app.verity.dev')).toBe(true);
    expect(isOriginAllowed('https://evil.example')).toBe(false);
  });
});
