import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReportUserDto {
  @IsString()
  reportedUserId!: string;

  @IsString()
  @MaxLength(100)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  details?: string;
}
