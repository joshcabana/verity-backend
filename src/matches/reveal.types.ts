export const PARTNER_REVEAL_VERSION = 1 as const;

export type PartnerReveal = {
  id: string;
  displayName: string | null;
  primaryPhotoUrl: string | null;
  age: number | null;
  bio: string | null;
};

type RevealProfileInput = {
  id: string;
  displayName?: string | null;
  photos?: unknown;
  age?: number | null;
  bio?: string | null;
};

export function buildPartnerReveal(profile: RevealProfileInput): PartnerReveal {
  return {
    id: profile.id,
    displayName: profile.displayName ?? null,
    primaryPhotoUrl: resolvePrimaryPhotoUrl(profile.photos),
    age: typeof profile.age === 'number' ? profile.age : null,
    bio: profile.bio ?? null,
  };
}

export function resolvePrimaryPhotoUrl(photos: unknown): string | null {
  if (!Array.isArray(photos)) {
    return null;
  }
  for (const entry of photos) {
    if (typeof entry !== 'string') {
      continue;
    }
    const trimmed = entry.trim();
    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }
  }
  return null;
}
