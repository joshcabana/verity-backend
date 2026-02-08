import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsIn } from 'class-validator';
import type { Request } from 'express';
import { getRequestUserId } from '../auth/request-user';
import { SessionService } from './session.service';

class SessionChoiceDto {
  @IsIn(['MATCH', 'PASS'])
  choice!: 'MATCH' | 'PASS';
}

@Controller('sessions')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Post(':id/choice')
  @UseGuards(AuthGuard('jwt'))
  async submitChoice(
    @Req() req: Request,
    @Param('id') sessionId: string,
    @Body() dto: SessionChoiceDto,
  ) {
    const userId = getRequestUserId(req);
    return this.sessionService.submitChoice(sessionId, userId, dto.choice);
  }
}
