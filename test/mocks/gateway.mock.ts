export class ChatGatewayMock {
  events: Array<{ userId: string; payload: any }> = [];

  emitMessage(userId: string, payload: any) {
    this.events.push({ userId, payload });
  }
}

export class VideoGatewayMock {
  events: Array<{ userId: string; event: string; payload: any }> = [];
  server?: {
    to: (room: string) => { emit: (event: string, payload: any) => void };
  };

  constructor() {
    this.server = {
      to: (_room: string) => ({
        emit: (event: string, payload: any) => {
          this.events.push({ userId: _room, event, payload });
        },
      }),
    };
  }

  emitSessionStart(userId: string, payload: any) {
    this.events.push({ userId, event: 'session:start', payload });
  }

  emitSessionEnd(userId: string, payload: any) {
    this.events.push({ userId, event: 'session:end', payload });
  }
}

export class QueueGatewayMock {
  events: Array<{ userId: string; payload: any }> = [];

  emitMatch(userAId: string, userBId: string, session: any) {
    this.events.push({ userId: userAId, payload: session });
    this.events.push({ userId: userBId, payload: session });
  }
}
