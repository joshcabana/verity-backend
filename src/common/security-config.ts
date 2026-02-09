const DEV_ACCESS_SECRET = 'dev_access_secret';
const DEV_REFRESH_SECRET = 'dev_refresh_secret';

type OriginDecision = (error: Error | null, allow?: boolean) => void;

function readEnvSecret(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isProductionEnv(): boolean {
  return process.env.NODE_ENV === 'production';
}

function parseBooleanEnv(value?: string): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return (
    normalized === '1' ||
    normalized === 'true' ||
    normalized === 'yes' ||
    normalized === 'on'
  );
}

function allowInsecureDevSecrets(): boolean {
  return (
    !isProductionEnv() &&
    parseBooleanEnv(process.env.ALLOW_INSECURE_DEV_SECRETS)
  );
}

function missingSecretError(secretName: string): Error {
  return new Error(
    `Missing ${secretName} (or JWT_SECRET). Set ${secretName} or JWT_SECRET. ` +
      'To use insecure dev fallback secrets, set ALLOW_INSECURE_DEV_SECRETS=true in non-production only.',
  );
}

export function getAllowedOrigins(): string[] {
  const rawOrigins = process.env.APP_ORIGINS ?? process.env.APP_URL ?? '';
  return rawOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export function isOriginAllowed(origin?: string): boolean {
  if (!origin) {
    return true;
  }

  const allowedOrigins = getAllowedOrigins();
  if (allowedOrigins.length === 0) {
    return true;
  }

  return allowedOrigins.includes(origin);
}

export function corsOriginResolver(
  origin: string | undefined,
  callback: OriginDecision,
) {
  callback(null, isOriginAllowed(origin));
}

export function getAccessTokenSecret(): string {
  const accessSecret =
    readEnvSecret(process.env.JWT_ACCESS_SECRET) ??
    readEnvSecret(process.env.JWT_SECRET);

  if (accessSecret) {
    return accessSecret;
  }

  if (allowInsecureDevSecrets()) {
    return DEV_ACCESS_SECRET;
  }

  throw missingSecretError('JWT_ACCESS_SECRET');
}

export function getRefreshTokenSecret(): string {
  const refreshSecret =
    readEnvSecret(process.env.JWT_REFRESH_SECRET) ??
    readEnvSecret(process.env.JWT_SECRET);

  if (refreshSecret) {
    return refreshSecret;
  }

  if (allowInsecureDevSecrets()) {
    return DEV_REFRESH_SECRET;
  }

  throw missingSecretError('JWT_REFRESH_SECRET');
}
