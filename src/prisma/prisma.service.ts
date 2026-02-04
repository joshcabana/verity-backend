import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    const url = process.env.DATABASE_URL;
    if (!url) {
      return;
    }
    await this.$connect();
  }

  async onModuleDestroy() {
    const url = process.env.DATABASE_URL;
    if (!url) {
      return;
    }
    await this.$disconnect();
  }
}
