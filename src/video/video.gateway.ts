import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

export type SessionStartPayload = {
  sessionId: string;
  channelName: string;
  rtc: { token: string; uid: number };
  rtm: { token: string; userId: string };
  startAt: string;
  endAt: string;
  expiresAt: string;
  durationSeconds: number;
};

export type SessionEndPayload = {
  sessionId: string;
  reason: 'timeout' | 'ended' | 'token_error';
  endedAt: string;
};

@Injectable()
@WebSocketGateway({
  namespace: '/video',
  cors: { origin: true, credentials: true },
})
export class VideoGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(VideoGateway.name);

  constructor(private readonly jwt: JwtService) {}

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
    } catch (error) {
      this.logger.warn(`Video socket auth failed: ${error}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const data = client.data as { userId?: string };
    const userId = data.userId;
    if (userId) {
      void client.leave(this.userRoom(userId));
    }
  }

  emitSessionStart(userId: string, payload: SessionStartPayload) {
    this.server.to(this.userRoom(userId)).emit('session:start', payload);
  }

  emitSessionEnd(userId: string, payload: SessionEndPayload) {
    this.server.to(this.userRoom(userId)).emit('session:end', payload);
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
    return (
      process.env.JWT_ACCESS_SECRET ??
      process.env.JWT_SECRET ??
      'dev_access_secret'
    );
  }
}
