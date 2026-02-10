export type PartnerReveal = {
  id: string;
  displayName: string | null;
  primaryPhotoUrl: string | null;
  age: number | null;
  bio: string | null;
};

export type MatchRevealPayload = {
  matchId: string;
  partnerRevealVersion: number;
  partnerReveal: PartnerReveal;
  revealAcknowledged: boolean;
  revealAcknowledgedAt: string | null;
};
