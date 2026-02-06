import { IsString, MaxLength, MinLength } from 'class-validator';

export class UnregisterPushTokenDto {
  @IsString()
  @MinLength(8)
  @MaxLength(2048)
  token!: string;
}
