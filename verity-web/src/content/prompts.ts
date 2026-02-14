export const ICEBREAKER_PROMPTS: string[] = [
  'Share a tiny win from your week.',
  'What song feels like your current mood?',
  'Beach sunrise or city midnight?',
  'What makes you feel instantly at home?',
  'Coffee date, bookstore date, or museum date?',
  'What is one value you never compromise on?',
];

export const DAILY_INTENTIONS: string[] = [
  'Lead with curiosity, not performance.',
  'Notice one thing you genuinely appreciate.',
  'Ask a deeper question than usual.',
  'Choose honesty over perfect wording.',
  'Bring warmth first, then wit.',
  'Stay playful and present for 45 seconds.',
  'Listen fully before you decide.',
];

export function getDailyIntention(date = new Date()): string {
  const seed = Number(
    `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(
      date.getUTCDate(),
    ).padStart(2, '0')}`,
  );
  return DAILY_INTENTIONS[seed % DAILY_INTENTIONS.length] ?? DAILY_INTENTIONS[0];
}
