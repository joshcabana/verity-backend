import { IsIn } from 'class-validator';

export class ResolveAppealDto {
  @IsIn(['upheld', 'overturned'])
  resolution!: 'upheld' | 'overturned';
}
