# Verity Mobile

## Settings & Account Management

- Settings tab includes profile editing, token balance refresh, logout, and account deletion via `DELETE /users/me`.
- Optional email/phone verification calls backend `/auth/verify-email` and `/auth/verify-phone`.
- Logout clears AsyncStorage and returns the user to onboarding.
- Dark mode toggle is wired to the ThemeProvider and persisted in AsyncStorage.
- Delete account flow requires typing `DELETE` on a dedicated confirmation screen.
- Blocked Users screen lists and manages blocks via `GET/DELETE /moderation/blocks`; Report screen submits reports via `POST /moderation/reports`.

## Theming Helpers

- `ThemedScreen` provides consistent background + padding with optional centering.
- `ThemedButton` and `ThemedCard` standardize button and card styling across the app.
- `createThemedTextStyles` and `createThemedInputStyles` centralize text/input styling across screens.
- Global typography and spacing tokens live in `src/theme/tokens.ts` for consistent layout rhythm.

## Deep Links

- Navigation is configured to handle deep links for nested tabs.
- Example paths: `/home`, `/matches`, `/settings`, `/settings/profile`, `/settings/delete`.
- Default scheme is set to `verity` in `app.json` (override with `EXPO_PUBLIC_APP_SCHEME`).

## Onboarding Flow & Auth Persistence

- Multi-step onboarding: Welcome → Explain → Profile setup.
- Anonymous signup uses `POST /auth/signup-anonymous`, then `PATCH /users/me` to save profile data.
- JWT is stored in AsyncStorage via the `useAuth` store; returning users are routed directly to Main.
- Profile setup uses Expo Image Picker for photo selection (ensure `expo-image-picker` is installed).

## Queue Join & Waiting Experience

- Home screen shows current token balance and a "Go Live" action.
- Joining the queue calls `POST /queue/join` and navigates to the waiting screen.
- Waiting screen listens for `match` and routes to the video call screen.
- Cancelling calls `DELETE /queue/leave`; the response's `refunded` field determines whether the token balance is restored.

## Double Opt-In Decision UI

- Decision screen posts `MATCH` or `PASS` to `POST /sessions/:id/choice`.
- Auto-pass triggers after 60 seconds if no choice is made.
- Mutual match navigates to Matches (chat unlocks in the next phase); rejection returns to Home.

## Agora Video Integration & Timer

- `VideoCallScreen` joins the Agora channel using a server-issued token and channel name.
- Local/remote video surfaces render via `react-native-agora` and a 45s client countdown.
- Server `session:end` events end the call early; client timer acts as a fallback.
- Countdown ring uses `react-native-svg`.
- Configure `EXPO_PUBLIC_AGORA_APP_ID` for the RTC engine.

## Matches List & Profile Reveal

- Matches tab pulls profiles from `GET /matches`. Partner data is gated behind reveal-acknowledgement — full details are shown only after a user taps to reveal.
- Mutual match events (`match:mutual`) refresh the list and open the new match.
- Match profile view includes photos, bio, and interests with quick chat access.

## Real-Time Chat

- Chat screen loads history from `GET /matches/:id/messages`.
- Sending uses `POST /matches/:id/messages` with optimistic UI updates.
- Real-time delivery listens for `message:new` events over the `/chat` namespace.

## Token Purchase with Stripe

- Token shop lists predefined packs and opens Stripe Checkout via `POST /tokens/purchase`.
- Purchase deep links use `verity://tokens/success` or `verity://tokens/cancel` and refresh the balance.
- Balance refresh hits `GET /tokens/balance` and updates the stored `tokenBalance`.
- Configure `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` for the Stripe provider.

## Frontend Unit Tests

- Unit/component tests live in `src/**/__tests__`; flow tests remain in `tests/__tests__`.
- Run tests from `verity-mobile` with `npm test`.
- For coverage, run `npm test -- --coverage` and target ≥80% component coverage.
- API calls are mocked with `jest.mock` and manual mock factories. No MSW dependency is used.
