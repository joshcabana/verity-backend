import { IsOptional, IsString } from 'class-validator';

export class ReportUserDto {
  @IsString()
  reportedUserId!: string;

  @IsString()
  reason!: string;

  @IsOptional()
  @IsString()
  details?: string;
}
