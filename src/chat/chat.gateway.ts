import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

export type ChatMessagePayload = {
  id: string;
  matchId: string;
  senderId: string;
  text: string;
  createdAt: string;
};

@Injectable()
@WebSocketGateway({ namespace: '/chat', cors: { origin: true, credentials: true } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(private readonly jwt: JwtService) {}

  async handleConnection(client: Socket) {
    const token = this.extractToken(client);
    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      const payload = this.jwt.verify(token, { secret: this.accessSecret }) as { sub?: string };
      if (!payload?.sub) {
        throw new UnauthorizedException('Invalid token');
      }
      client.data.userId = payload.sub;
      client.join(this.userRoom(payload.sub));
    } catch (error) {
      this.logger.warn(`Chat socket auth failed: ${error}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId as string | undefined;
    if (userId) {
      client.leave(this.userRoom(userId));
    }
  }

  emitMessage(userId: string, payload: ChatMessagePayload) {
    this.server.to(this.userRoom(userId)).emit('message:new', payload);
  }

  private userRoom(userId: string) {
    return `user:${userId}`;
  }

  private extractToken(client: Socket): string | null {
    const authHeader = client.handshake.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string') {
      return authToken;
    }
    return null;
  }

  private get accessSecret(): string {
    return process.env.JWT_ACCESS_SECRET ?? process.env.JWT_SECRET ?? 'dev_access_secret';
  }
}
