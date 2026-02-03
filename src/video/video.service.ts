import { Injectable } from '@nestjs/common';
import { createHash, createHmac } from 'crypto';
import { ModerationService } from '../moderation/moderation.service';

const TOKEN_VERSION = '007';
const DEFAULT_TOKEN_TTL_SECONDS = 60;

type AgoraTokens = {
  channelName: string;
  expiresAt: Date;
  byUser: Record<
    string,
    {
      rtcToken: string;
      rtmToken: string;
      rtcUid: number;
      rtmUserId: string;
    }
  >;
};

@Injectable()
export class VideoService {
  buildSessionTokens(sessionId: string, userIds: string[]): AgoraTokens {
    const appId = this.getRequiredEnv('AGORA_APP_ID');
    const appCertificate = this.getRequiredEnv('AGORA_APP_CERTIFICATE');
    const ttlSeconds = this.getTokenTtlSeconds();

    const channelName = this.buildChannelName(sessionId);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const expireTs = Math.floor(expiresAt.getTime() / 1000);

    const byUser: AgoraTokens['byUser'] = {};
    for (const userId of userIds) {
      const rtcUid = this.hashToUid(userId);
      const rtcToken = this.buildRtcToken(appId, appCertificate, channelName, rtcUid, expireTs, ttlSeconds);
      const rtmToken = this.buildRtmToken(appId, appCertificate, userId, expireTs, ttlSeconds);
      byUser[userId] = {
        rtcToken,
        rtmToken,
        rtcUid,
        rtmUserId: userId,
      };
    }

    const firstUser = userIds[0];
    if (firstUser && byUser[firstUser]) {
      void ModerationService.startStreamMonitoring({
        sessionId,
        channelName,
        rtcToken: byUser[firstUser].rtcToken,
        rtcUid: byUser[firstUser].rtcUid,
      });
    }

    return { channelName, expiresAt, byUser };
  }

  private buildChannelName(sessionId: string): string {
    return `session_${sessionId}`;
  }

  private buildRtcToken(
    appId: string,
    appCertificate: string,
    channelName: string,
    uid: number,
    expireTs: number,
    ttlSeconds: number,
  ): string {
    const token = new AccessToken2(appId, appCertificate, ttlSeconds);
    const service = new ServiceRtc(channelName, uid);
    service.addPrivilege(PrivilegeRtc.JOIN_CHANNEL, expireTs);
    token.addService(service);
    return token.build();
  }

  private buildRtmToken(
    appId: string,
    appCertificate: string,
    userId: string,
    expireTs: number,
    ttlSeconds: number,
  ): string {
    const token = new AccessToken2(appId, appCertificate, ttlSeconds);
    const service = new ServiceRtm(userId);
    service.addPrivilege(PrivilegeRtm.LOGIN, expireTs);
    token.addService(service);
    return token.build();
  }

  private getTokenTtlSeconds(): number {
    const value = Number.parseInt(process.env.AGORA_TOKEN_TTL_SECONDS ?? '', 10);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
    return DEFAULT_TOKEN_TTL_SECONDS;
  }

  private getRequiredEnv(key: string): string {
    const value = process.env[key];
    if (!value) {
      throw new Error(`${key} is required for Agora token generation`);
    }
    return value;
  }

  private hashToUid(userId: string): number {
    const hex = createHash('sha256').update(userId).digest('hex').slice(0, 8);
    const uid = Number.parseInt(hex, 16);
    return uid === 0 ? 1 : uid;
  }
}

class ByteBuf {
  private buffer: Buffer = Buffer.alloc(0);

  putUint16(value: number) {
    const buf = Buffer.alloc(2);
    buf.writeUInt16LE(value);
    this.append(buf);
  }

  putUint32(value: number) {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(value);
    this.append(buf);
  }

  putString(value: string) {
    const buf = Buffer.from(value);
    this.putUint16(buf.length);
    this.append(buf);
  }

  putBytes(value: Buffer) {
    this.append(value);
  }

  pack(): Buffer {
    return this.buffer;
  }

  private append(buf: Buffer) {
    this.buffer = Buffer.concat([this.buffer, buf]);
  }
}

class AccessToken2 {
  private readonly issueTs: number;
  private readonly salt: number;
  private readonly services: Map<number, Service> = new Map();

  constructor(
    private readonly appId: string,
    private readonly appCertificate: string,
    private readonly expire: number,
  ) {
    this.issueTs = Math.floor(Date.now() / 1000);
    this.salt = Math.floor(Math.random() * 0xffffffff);
  }

  addService(service: Service) {
    this.services.set(service.serviceType, service);
  }

  build(): string {
    const signing = new ByteBuf();
    signing.putString(this.appId);
    signing.putUint32(this.issueTs);
    signing.putUint32(this.expire);
    signing.putUint32(this.salt);
    signing.putUint16(this.services.size);
    for (const service of this.services.values()) {
      service.pack(signing);
    }

    const signature = createHmac('sha256', this.appCertificate)
      .update(signing.pack())
      .digest();

    const content = new ByteBuf();
    content.putString(this.appId);
    content.putUint32(this.issueTs);
    content.putUint32(this.expire);
    content.putUint32(this.salt);
    content.putBytes(signature);
    content.putUint16(this.services.size);
    for (const service of this.services.values()) {
      service.pack(content);
    }

    return TOKEN_VERSION + content.pack().toString('base64');
  }
}

abstract class Service {
  readonly privileges: Map<number, number> = new Map();

  constructor(readonly serviceType: number) {}

  addPrivilege(privilege: number, expire: number) {
    this.privileges.set(privilege, expire);
  }

  pack(buf: ByteBuf) {
    buf.putUint16(this.serviceType);
    this.packData(buf);
    buf.putUint16(this.privileges.size);
    for (const [privilege, expire] of this.privileges.entries()) {
      buf.putUint16(privilege);
      buf.putUint32(expire);
    }
  }

  protected abstract packData(buf: ByteBuf): void;
}

class ServiceRtc extends Service {
  constructor(private readonly channelName: string, private readonly uid: number) {
    super(ServiceType.RTC);
  }

  protected packData(buf: ByteBuf): void {
    buf.putString(this.channelName);
    buf.putString(this.uid.toString());
  }
}

class ServiceRtm extends Service {
  constructor(private readonly userId: string) {
    super(ServiceType.RTM);
  }

  protected packData(buf: ByteBuf): void {
    buf.putString(this.userId);
  }
}

enum ServiceType {
  RTC = 1,
  RTM = 2,
}

enum PrivilegeRtc {
  JOIN_CHANNEL = 1,
}

enum PrivilegeRtm {
  LOGIN = 1,
}
