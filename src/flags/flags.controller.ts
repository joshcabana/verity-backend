import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsBoolean, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { FlagsService } from './flags.service';

class UpdateFlagDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  variant?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

@Controller('config')
export class FlagsController {
  constructor(private readonly flagsService: FlagsService) {}

  @Get('flags')
  async getPublicFlags() {
    return this.flagsService.getPublicFlags();
  }

  @Patch('flags/:key')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  async updateFlag(@Param('key') key: string, @Body() dto: UpdateFlagDto) {
    return this.flagsService.upsertFlag(key, dto);
  }
}
