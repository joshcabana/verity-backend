<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Token Rotation & Verification

- Access tokens are short-lived (15 minutes). Refresh tokens last 30 days.
- Refresh tokens are stored in an httpOnly cookie named `refresh_token` with `sameSite=strict`.
- In production, cookies are marked `secure` (HTTPS only).
- `POST /auth/refresh` rotates refresh tokens and invalidates a refresh family on reuse.
- `POST /auth/verify-phone` and `POST /auth/verify-email` link verified identifiers to the user.
- `POST /auth/logout-all` revokes all refresh tokens for the current user.

## Matching Queue System

- `POST /queue/join` deducts one token and places the user into a Redis sorted set keyed by `region` + preferences.
- `DELETE /queue/leave` removes the user and refunds the token if no match was made.
- A background worker pops FIFO pairs from Redis every 500ms and creates a `Session`.
- Matches emit a `match` event over the `/queue` WebSocket namespace to each user room.
- Refresh fairness is FIFO within each `region:preferences` key.

## Video Call Flow & Timer

- When a `Session` is created, the server generates short-lived Agora RTC + RTM tokens and a channel name.
- The server emits `session:start` over the `/video` WebSocket namespace to both users, including `startAt`/`endAt`.
- A hard 45-second server timer emits `session:end` (authoritative), triggering the choice screen.
- Clients should still run their own 45-second timer, but must respect the server `session:end`.
- Cloud recording is not enabled by the backend.

## Double Opt-In Logic

- Clients submit `POST /sessions/:id/choice` with `MATCH` or `PASS` after the call ends.
- Only session participants can submit; choices are idempotent.
- Mutual `MATCH` creates a `Match` row and emits `match:mutual` to both users.
- Any non-mutual result (including timeouts) emits `match:non_mutual`.
- If no choices are received within 60 seconds after `session:end`, the server auto-PASSes.

## Identity Reveal & Chat

- `GET /matches` returns mutual matches with full partner profiles (anonymous fields only).
- `GET /matches/:id/messages` and `POST /matches/:id/messages` provide persistent chat history and delivery.
- Chat messages are stored in PostgreSQL and delivered in real time via `/chat` WebSocket events.
- Access is limited to match participants; identity data is revealed only after mutual match.

## Token System & Stripe Integration

- `GET /tokens/balance` returns the current token balance for the authenticated user.
- `POST /tokens/purchase` creates a Stripe Checkout session for predefined packs (`starter`, `plus`, `pro`).
- `POST /webhooks/stripe` verifies Stripe signatures and credits tokens atomically on paid checkout completion.
- Webhooks are idempotent using the Stripe event ID to prevent double credits.
- Queue joins must have `tokenBalance >= 1` to proceed.

## AI Moderation Pipeline

- On session start, the backend forwards Agora stream details to Hive for real-time moderation.
- Hive violations are posted to `POST /webhooks/hive` and verified using HMAC signatures.
- Violations immediately terminate the session and log `ModerationEvent` rows.
- Repeat offenders (3+ violations in 24h) are banned via Redis TTL and receive `moderation:action` events.
- Optional screenshot fallback can be configured via `HIVE_SCREENSHOT_URL`.

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
