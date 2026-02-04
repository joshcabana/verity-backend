import { IsEmail, IsOptional, IsString } from 'class-validator';

export class VerifyEmailDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  code?: string;
}
