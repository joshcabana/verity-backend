import { IsOptional, IsString, Matches } from 'class-validator';

export class VerifyPhoneDto {
  @IsString()
  @Matches(/^\+?[1-9]\d{7,14}$/, {
    message: 'phone must be a valid E.164-like number',
  })
  phone!: string;

  @IsOptional()
  @IsString()
  code?: string;
}
