import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthController, UsersController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  controllers: [AuthController, UsersController],
  providers: [AuthService, JwtService],
  exports: [AuthService],
})
export class AuthModule {}
