import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { redisProvider } from '../common/redis.provider';
import { AnalyticsModule } from '../analytics/analytics.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { VideoModule } from '../video/video.module';
import { QueueController } from './queue.controller';
import { QueueGateway } from './queue.gateway';
import { QueueService } from './queue.service';
import { MatchingWorker } from './matching.worker';

@Module({
  imports: [VideoModule, NotificationsModule, AnalyticsModule],
  controllers: [QueueController],
  providers: [
    QueueService,
    QueueGateway,
    MatchingWorker,
    JwtService,
    redisProvider,
  ],
})
export class QueueModule {
  // Ensures the matching worker is instantiated at module bootstrap.
  constructor(private readonly matchingWorker: MatchingWorker) {}
}
