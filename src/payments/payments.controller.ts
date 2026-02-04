import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsIn } from 'class-validator';
import type { Request } from 'express';
import { PaymentsService } from './payments.service';

class PurchaseDto {
  @IsIn(['starter', 'plus', 'pro'])
  packId!: string;
}

@Controller('tokens')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('balance')
  @UseGuards(AuthGuard('jwt'))
  async getBalance(@Req() req: Request) {
    const userId = this.getUserId(req);
    return this.paymentsService.getBalance(userId);
  }

  @Post('purchase')
  @UseGuards(AuthGuard('jwt'))
  async purchase(@Req() req: Request, @Body() dto: PurchaseDto) {
    const userId = this.getUserId(req);
    return this.paymentsService.createCheckoutSession(userId, dto.packId);
  }

  private getUserId(req: Request): string {
    const user = req.user as
      | { sub?: string; id?: string; userId?: string }
      | undefined;
    const userId = user?.sub ?? user?.id ?? user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Invalid access token');
    }
    return userId;
  }
}
