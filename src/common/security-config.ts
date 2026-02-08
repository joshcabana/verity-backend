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

  if (isProductionEnv()) {
    throw new Error(
      'Missing JWT_ACCESS_SECRET (or JWT_SECRET) in production environment',
    );
  }

  return DEV_ACCESS_SECRET;
}

export function getRefreshTokenSecret(): string {
  const refreshSecret =
    readEnvSecret(process.env.JWT_REFRESH_SECRET) ??
    readEnvSecret(process.env.JWT_SECRET);

  if (refreshSecret) {
    return refreshSecret;
  }

  if (isProductionEnv()) {
    throw new Error(
      'Missing JWT_REFRESH_SECRET (or JWT_SECRET) in production environment',
    );
  }

  return DEV_REFRESH_SECRET;
}
