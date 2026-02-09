import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateUserProfileDto } from '../../src/auth/dto/update-user-profile.dto';

describe('UpdateUserProfileDto', () => {
  it('rejects invalid profile updates', async () => {
    const dto = plainToInstance(UpdateUserProfileDto, {
      age: 17,
      interests: new Array(13).fill('Travel'),
    });

    const errors = await validate(dto);
    const errorFields = errors.map((error) => error.property);

    expect(errorFields).toContain('age');
    expect(errorFields).toContain('interests');
  });
});
