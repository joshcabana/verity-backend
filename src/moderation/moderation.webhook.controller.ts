import { Body, Controller, Headers, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { ModerationService } from './moderation.service';

@Controller('webhooks/hive')
export class ModerationWebhookController {
  constructor(private readonly moderationService: ModerationService) {}

  @Post()
  async handleWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-hive-signature') signature?: string,
    @Headers('x-hive-timestamp') timestamp?: string,
    @Body() body?: unknown,
  ) {
    const rawBody =
      req.rawBody ??
      Buffer.from(typeof body === 'string' ? body : JSON.stringify(body ?? {}));

    this.moderationService.verifyWebhookSignature(
      rawBody,
      signature,
      timestamp,
    );

    const payload =
      typeof body === 'string' ? (JSON.parse(body) as unknown) : (body ?? {});
    return this.moderationService.handleWebhook(
      payload as Parameters<ModerationService['handleWebhook']>[0],
    );
  }
}
