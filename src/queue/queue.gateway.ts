import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Session } from '@prisma/client';
import { createHash } from 'crypto';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
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
export class QueueGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly jwt: JwtService;
  private readonly logger = new Logger(QueueGateway.name);

  constructor(private readonly queueService: QueueService) {
    this.jwt = new JwtService({ secret: this.accessSecret });
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
        const result = await this.queueService.leaveQueue(userId);
        if (result.queueKey) {
          await this.emitQueueStatus(result.queueKey);
        }
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

  async emitQueueStatus(queueKey: string) {
    if (!queueKey) {
      return;
    }

    try {
      const userIds = await this.queueService.getQueuedUserIds(queueKey);
      if (userIds.length === 0) {
        return;
      }

      const usersSearching = await this.queueService.getQueueSize(queueKey);
      for (const userId of userIds) {
        this.server
          .to(this.userRoom(userId))
          .emit('queue:status', { usersSearching });
      }
    } catch (error) {
      this.logger.warn(
        `Failed to emit queue status for ${queueKey}: ${String(error)}`,
      );
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
