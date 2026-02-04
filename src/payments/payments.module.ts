import { Module } from '@nestjs/common';
import Stripe from 'stripe';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { StripeWebhookController } from './stripe.webhook.controller';

@Module({
  controllers: [PaymentsController, StripeWebhookController],
  providers: [
    PaymentsService,
    {
      provide: Stripe,
      useFactory: () => {
        return new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
          apiVersion: '2023-10-16',
        });
      },
    },
  ],
})
export class PaymentsModule {}
