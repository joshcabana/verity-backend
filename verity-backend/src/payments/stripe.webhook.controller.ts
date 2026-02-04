import { Body, Controller, Headers, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PaymentsService } from './payments.service';

@Controller('webhooks/stripe')
export class StripeWebhookController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  async handleWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Res() res: Response,
    @Headers('stripe-signature') signature?: string,
    @Body() body?: unknown,
  ) {
    const payload = req.rawBody ?? Buffer.from(JSON.stringify(body ?? {}));
    const event = this.paymentsService.verifyStripeSignature(
      payload,
      signature,
    );
    await this.paymentsService.handleStripeWebhookEvent(event);
    return res.status(200).json({ received: true });
  }
}
