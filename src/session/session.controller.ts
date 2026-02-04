import {
  Body,
  Controller,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsIn } from 'class-validator';
import type { Request } from 'express';
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
    const user = req.user as
      | { sub?: string; id?: string; userId?: string }
      | undefined;
    const userId = user?.sub ?? user?.id ?? user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Invalid access token');
    }
    return this.sessionService.submitChoice(sessionId, userId, dto.choice);
  }
}
