import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { redisProvider } from '../common/redis.provider';
import { QueueController } from './queue.controller';
import { QueueService, QueueGateway } from './queue.service';
import { MatchingWorker } from './matching.worker';

@Module({
  controllers: [QueueController],
  providers: [QueueService, QueueGateway, MatchingWorker, JwtService, redisProvider],
})
export class QueueModule {}
