import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { redisProvider } from '../common/redis.provider';
import { TelemetryController } from './telemetry.controller';
import { TelemetryAlertsService } from './telemetry-alerts.service';
import { TelemetryMetricsService } from './telemetry-metrics.service';

@Module({
  imports: [AuthModule],
  controllers: [TelemetryController],
  providers: [TelemetryMetricsService, TelemetryAlertsService, redisProvider],
  exports: [TelemetryMetricsService],
})
export class TelemetryModule {}
