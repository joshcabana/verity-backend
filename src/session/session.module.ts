import { Module } from '@nestjs/common';
import { VideoModule } from '../video/video.module';
import { SessionController } from './session.controller';

@Module({
  imports: [VideoModule],
  controllers: [SessionController],
})
export class SessionModule {}
