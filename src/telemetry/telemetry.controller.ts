import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsOptional, IsString } from 'class-validator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TelemetryMetricsService } from './telemetry-metrics.service';

class SyntheticBackendDto {
  @IsOptional()
  @IsString()
  userId?: string;
}

@Controller('telemetry')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('ADMIN')
export class TelemetryController {
  constructor(private readonly metricsService: TelemetryMetricsService) {}

  @Get('stage-gates')
  async getStageGates() {
    return this.metricsService.getStageGateView();
  }

  @Post('synthetic/backend')
  async emitSyntheticBackend(@Body() dto: SyntheticBackendDto) {
    return this.metricsService.emitSyntheticBackendEvents(dto.userId);
  }
}
