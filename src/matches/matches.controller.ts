import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsString, MaxLength, MinLength } from 'class-validator';
import type { Request } from 'express';
import { getRequestUserId } from '../auth/request-user';
import { ChatService } from '../chat/chat.service';
import { MatchesService } from './matches.service';

class SendMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  text!: string;
}

@Controller('matches')
export class MatchesController {
  constructor(
    private readonly matchesService: MatchesService,
    private readonly chatService: ChatService,
  ) {}

  @Get()
  @UseGuards(AuthGuard('jwt'))
  async listMatches(@Req() req: Request) {
    const userId = getRequestUserId(req);
    return this.matchesService.listMatches(userId);
  }

  @Get(':id/messages')
  @UseGuards(AuthGuard('jwt'))
  async listMessages(
    @Req() req: Request,
    @Param('id') matchId: string,
    @Query('limit') limit?: string,
  ) {
    const userId = getRequestUserId(req);
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    return this.chatService.listMessages(matchId, userId, parsedLimit);
  }

  @Post(':id/messages')
  @UseGuards(AuthGuard('jwt'))
  async sendMessage(
    @Req() req: Request,
    @Param('id') matchId: string,
    @Body() dto: SendMessageDto,
  ) {
    const userId = getRequestUserId(req);
    return this.chatService.sendMessage(matchId, userId, dto.text);
  }
}
