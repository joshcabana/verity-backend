import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsIn } from 'class-validator';
import type { Request } from 'express';
import { getRequestUserId } from '../auth/request-user';
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
    const userId = getRequestUserId(req);
    return this.paymentsService.getBalance(userId);
  }

  @Post('purchase')
  @UseGuards(AuthGuard('jwt'))
  async purchase(@Req() req: Request, @Body() dto: PurchaseDto) {
    const userId = getRequestUserId(req);
    return this.paymentsService.createCheckoutSession(userId, dto.packId);
  }
}
