import crypto from 'node:crypto';
import type { Response } from 'express';
import type { Redis } from 'ioredis';

export type RealtimeEvent = { userId: string; kind: 'notification'; resourceId: string };

export class RealtimeService {
  private readonly source = crypto.randomUUID();
  private readonly clients = new Map<string, Set<Response>>();
  private readonly subscriber: Redis;
  private subscriberStarted = false;

  constructor(private readonly redis: Redis) {
    this.subscriber = redis.duplicate({ lazyConnect: true });
  }

  private deliver(event: RealtimeEvent) {
    const payload = `event: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`;
    this.clients.get(event.userId)?.forEach((response) => response.write(payload));
  }

  private async startSubscriber() {
    if (this.subscriberStarted) return;
    this.subscriberStarted = true;
    try {
      await this.subscriber.connect();
      await this.subscriber.subscribe('printlink:realtime');
      this.subscriber.on('message', (_channel, raw) => {
        try {
          const packet = JSON.parse(raw) as RealtimeEvent & { source: string };
          if (packet.source !== this.source) this.deliver(packet);
        } catch {
          // A malformed cross-instance event must not break local delivery.
        }
      });
    } catch {
      this.subscriber.disconnect();
    }
  }

  addClient(userId: string, response: Response) {
    void this.startSubscriber();
    const userClients = this.clients.get(userId) ?? new Set<Response>();
    userClients.add(response);
    this.clients.set(userId, userClients);
    response.write('event: connected\ndata: {}\n\n');
    return () => {
      userClients.delete(response);
      if (!userClients.size) this.clients.delete(userId);
    };
  }

  publish(event: RealtimeEvent) {
    this.deliver(event);
    void this.redis
      .publish('printlink:realtime', JSON.stringify({ ...event, source: this.source }))
      .catch(() => undefined);
  }

  async close() {
    this.clients.forEach((responses) => responses.forEach((response) => response.end()));
    this.clients.clear();
    if (this.subscriber.status === 'wait') this.subscriber.disconnect();
    else if (this.subscriber.status !== 'end') await this.subscriber.quit().catch(() => this.subscriber.disconnect());
  }
}
