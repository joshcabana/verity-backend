import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { redisProvider } from '../common/redis.provider';
import { SessionService } from '../session/session.service';
import { VideoGateway } from './video.gateway';
import { VideoService } from './video.service';

@Module({
  providers: [
    VideoService,
    VideoGateway,
    SessionService,
    JwtService,
    redisProvider,
  ],
  exports: [VideoService, SessionService, VideoGateway],
})
export class VideoModule {}
