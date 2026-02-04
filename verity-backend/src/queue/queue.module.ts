import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { redisProvider } from '../common/redis.provider';
import { VideoModule } from '../video/video.module';
import { QueueController } from './queue.controller';
import { QueueService, QueueGateway } from './queue.service';
import { MatchingWorker } from './matching.worker';

@Module({
  imports: [VideoModule],
  controllers: [QueueController],
  providers: [
    QueueService,
    QueueGateway,
    MatchingWorker,
    JwtService,
    redisProvider,
  ],
})
export class QueueModule {}
