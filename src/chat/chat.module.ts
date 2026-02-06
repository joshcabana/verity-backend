import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MatchesService } from '../matches/matches.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { MatchesController } from '../matches/matches.controller';

@Module({
  imports: [NotificationsModule],
  providers: [ChatService, ChatGateway, MatchesService, JwtService],
  controllers: [MatchesController],
})
export class ChatModule {}
