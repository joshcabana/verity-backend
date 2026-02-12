import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Session } from '@prisma/client';
import { createHash } from 'crypto';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  corsOriginResolver,
  getAccessTokenSecret,
} from '../common/security-config';
import { QueueService } from './queue.service';

@Injectable()
@WebSocketGateway({
  namespace: '/queue',
  cors: { origin: corsOriginResolver, credentials: true },
})
export class QueueGateway
  implements
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnGatewayInit,
    OnModuleInit,
    OnModuleDestroy
{
  @WebSocketServer()
  server!: Server;

  private readonly jwt: JwtService;
  private readonly logger = new Logger(QueueGateway.name);
  private statusInterval?: ReturnType<typeof setInterval>;

  constructor(private readonly queueService: QueueService) {
    this.jwt = new JwtService({ secret: this.accessSecret });
  }

  afterInit() {
    this.logger.log('QueueGateway initialized');
  }

  onModuleInit() {
    this.statusInterval = setInterval(() => {
      void this.broadcastQueueStatus();
    }, 10000);
  }

  onModuleDestroy() {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
    }
  }

  handleConnection(client: Socket) {
    const token = this.extractToken(client);
    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      const payload = this.jwt.verify<{ sub?: string }>(token, {
        secret: this.accessSecret,
      });
      if (!payload?.sub) {
        throw new UnauthorizedException('Invalid token');
      }
      const data = client.data as { userId?: string };
      data.userId = payload.sub;
      void client.join(this.userRoom(payload.sub));
    } catch {
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    const data = client.data as { userId?: string };
    const userId = data.userId;
    if (userId) {
      const remainingConnections =
        this.server?.sockets?.adapter?.rooms?.get(this.userRoom(userId))
          ?.size ?? 0;
      if (remainingConnections > 0) {
        return;
      }
      try {
        await this.queueService.leaveQueue(userId);
      } catch (error) {
        this.logger.warn(`Failed to leave queue on disconnect: ${error}`);
      }
    }
  }

  emitMatch(userAId: string, userBId: string, session: Session) {
    const partnerAnonIdForA = this.buildPartnerAnonymousId(session.id, userBId);
    const partnerAnonIdForB = this.buildPartnerAnonymousId(session.id, userAId);

    this.server.to(this.userRoom(userAId)).emit('match', {
      sessionId: session.id,
      partnerAnonymousId: partnerAnonIdForA,
      queueKey: session.queueKey,
      matchedAt: session.createdAt,
    });
    this.server.to(this.userRoom(userBId)).emit('match', {
      sessionId: session.id,
      partnerAnonymousId: partnerAnonIdForB,
      queueKey: session.queueKey,
      matchedAt: session.createdAt,
    });
  }

  private buildPartnerAnonymousId(sessionId: string, userId: string): string {
    const digest = createHash('sha256')
      .update(`${sessionId}:${userId}`)
      .digest('hex')
      .slice(0, 12);
    return `anon_${digest}`;
  }

  private async broadcastQueueStatus() {
    try {
      const stats = await this.queueService.getGlobalSearchStats();
      this.server.emit('queue:status', stats);
    } catch (error) {
      this.logger.warn(`Failed to broadcast queue status: ${error}`);
    }
  }

  private userRoom(userId: string) {
    return `user:${userId}`;
  }

  private extractToken(client: Socket): string | null {
    const handshake = client.handshake as {
      headers?: { authorization?: unknown };
      auth?: { token?: unknown };
    };
    const authHeader = handshake.headers?.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }
    const authToken = handshake.auth?.token;
    if (typeof authToken === 'string') {
      return authToken;
    }
    return null;
  }

  private get accessSecret(): string {
    return getAccessTokenSecret();
  }
}
