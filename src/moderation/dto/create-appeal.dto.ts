import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateAppealDto {
  @IsOptional()
  @IsString()
  moderationReportId?: string;

  @IsString()
  @IsIn(['warn', 'ban', 'terminate_session'])
  actionType!: 'warn' | 'ban' | 'terminate_session';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
