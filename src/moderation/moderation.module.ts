import { Module } from '@nestjs/common';
import { ModerationService } from './moderation.service';
import { ModerationWebhookController } from './moderation.webhook.controller';
import { VideoModule } from '../video/video.module';
import { redisProvider } from '../common/redis.provider';

@Module({
  imports: [VideoModule],
  controllers: [ModerationWebhookController],
  providers: [ModerationService, redisProvider],
})
export class ModerationModule {}
