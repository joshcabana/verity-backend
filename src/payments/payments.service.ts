import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import Stripe from 'stripe';
import { AnalyticsService } from '../analytics/analytics.service';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_SUCCESS_URL = 'https://example.com/success';
const DEFAULT_CANCEL_URL = 'https://example.com/cancel';

const TOKEN_PACKS = [
  { id: 'starter', tokens: 5, priceEnv: 'STRIPE_PRICE_STARTER' },
  { id: 'plus', tokens: 15, priceEnv: 'STRIPE_PRICE_PLUS' },
  { id: 'pro', tokens: 30, priceEnv: 'STRIPE_PRICE_PRO' },
] as const;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly stripe: Stripe;

  constructor(
    private readonly prisma: PrismaService,
    private readonly analyticsService: AnalyticsService,
    @Optional() stripeClient?: Stripe,
  ) {
    const apiKey = process.env.STRIPE_SECRET_KEY ?? '';
    this.stripe =
      stripeClient ??
      new Stripe(apiKey, {
        apiVersion: '2023-10-16',
      });
  }

  async getBalance(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { tokenBalance: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return { tokenBalance: user.tokenBalance };
  }

  async createCheckoutSession(userId: string, packId: string) {
    const pack = this.getPack(packId);
    const successUrl = process.env.STRIPE_SUCCESS_URL ?? DEFAULT_SUCCESS_URL;
    const cancelUrl = process.env.STRIPE_CANCEL_URL ?? DEFAULT_CANCEL_URL;

    const priceId = process.env[pack.priceEnv];
    if (!priceId) {
      throw new BadRequestException(`Missing Stripe price ID for ${pack.id}`);
    }

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        userId,
        packId: pack.id,
        tokens: String(pack.tokens),
      },
    });

    this.analyticsService.trackServerEvent({
      userId,
      name: 'token_purchase_started',
      properties: {
        packId: pack.id,
        tokenAmount: pack.tokens,
        checkoutSessionId: session.id,
      },
    });

    return {
      sessionId: session.id,
      url: session.url,
    };
  }

  async handleStripeWebhookEvent(event: Stripe.Event) {
    if (event.type !== 'checkout.session.completed') {
      return { received: true };
    }

    const session = event.data.object;
    if (session.payment_status !== 'paid') {
      return { received: true };
    }

    const metadata = session.metadata ?? {};
    const userId = metadata.userId;
    const packId = metadata.packId;
    const tokensRaw = metadata.tokens;

    if (!userId || !packId || !tokensRaw) {
      this.logger.warn(`Missing metadata on checkout session ${session.id}`);
      return { received: true };
    }

    const tokens = Number.parseInt(tokensRaw, 10);
    if (!Number.isFinite(tokens) || tokens <= 0) {
      this.logger.warn(
        `Invalid token count in metadata for session ${session.id}`,
      );
      return { received: true };
    }

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.tokenTransaction.findUnique({
        where: { stripeEventId: event.id },
      });
      if (existing) {
        return;
      }

      const user = await tx.user.update({
        where: { id: userId },
        data: { tokenBalance: { increment: tokens } },
        select: { tokenBalance: true },
      });

      await tx.tokenTransaction.create({
        data: {
          userId,
          type: 'CREDIT',
          amount: tokens,
          balanceAfter: user.tokenBalance,
          stripeSessionId: session.id,
          stripeEventId: event.id,
          metadata: {
            packId,
            tokens,
          },
        },
      });
    });

    this.analyticsService.trackServerEvent({
      userId,
      name: 'token_purchase_succeeded',
      properties: {
        packId,
        tokenAmount: tokens,
        stripeSessionId: session.id,
      },
    });

    return { received: true };
  }

  verifyStripeSignature(
    payload: Buffer | string,
    signature: string | string[] | undefined,
  ) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      throw new BadRequestException('Stripe webhook secret not configured');
    }

    const sig = Array.isArray(signature) ? signature[0] : signature;
    if (!sig) {
      throw new BadRequestException('Missing Stripe signature');
    }

    return this.stripe.webhooks.constructEvent(payload, sig, secret);
  }

  private getPack(packId: string) {
    const pack = TOKEN_PACKS.find((item) => item.id === packId);
    if (!pack) {
      throw new BadRequestException('Unknown token pack');
    }
    return pack;
  }
}
