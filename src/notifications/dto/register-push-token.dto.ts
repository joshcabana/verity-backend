import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterPushTokenDto {
  @IsString()
  @MinLength(8)
  @MaxLength(2048)
  token!: string;

  @IsIn(['WEB', 'IOS', 'ANDROID'])
  platform!: 'WEB' | 'IOS' | 'ANDROID';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceId?: string;
}
