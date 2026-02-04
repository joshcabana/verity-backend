import { IsDateString, IsObject, IsOptional, IsString } from 'class-validator';

export class SignupAnonymousDto {
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsObject()
  consents?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  privacyNoticeVersion?: string;

  @IsOptional()
  @IsString()
  tosVersion?: string;
}
