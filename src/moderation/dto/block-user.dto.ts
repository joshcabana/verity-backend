import { IsString } from 'class-validator';

export class BlockUserDto {
  @IsString()
  blockedUserId!: string;
}
