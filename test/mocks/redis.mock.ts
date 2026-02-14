type StoredValue = {
  value: string;
  expiresAt?: number;
};

class InMemoryRedis {
  private store = new Map<string, StoredValue>();
  private hashes = new Map<string, Map<string, string>>();
  private zsets = new Map<string, Map<string, number>>();
  private sets = new Map<string, Set<string>>();
  private expiries = new Map<string, number>();

  failExec = false;

  private now() {
    return Date.now();
  }

  private isExpired(key: string) {
    const expiresAt = this.expiries.get(key);
    if (expiresAt !== undefined && this.now() >= expiresAt) {
      this.deleteKey(key);
      return true;
    }
    return false;
  }

  private deleteKey(key: string) {
    this.store.delete(key);
    this.hashes.delete(key);
    this.zsets.delete(key);
    this.sets.delete(key);
    this.expiries.delete(key);
  }

  private allKeys() {
    const keys = new Set<string>();
    for (const key of this.store.keys()) {
      if (!this.isExpired(key)) {
        keys.add(key);
      }
    }
    for (const key of this.hashes.keys()) {
      if (!this.isExpired(key)) {
        keys.add(key);
      }
    }
    for (const key of this.zsets.keys()) {
      if (!this.isExpired(key)) {
        keys.add(key);
      }
    }
    for (const key of this.sets.keys()) {
      if (!this.isExpired(key)) {
        keys.add(key);
      }
    }
    return Array.from(keys);
  }

  private patternToRegex(pattern: string) {
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`);
  }

  private hasKey(key: string) {
    if (this.isExpired(key)) {
      return false;
    }
    return (
      this.store.has(key) ||
      this.hashes.has(key) ||
      this.zsets.has(key) ||
      this.sets.has(key)
    );
  }

  async get(key: string) {
    if (this.isExpired(key)) {
      return null;
    }
    return this.store.get(key)?.value ?? null;
  }

  async set(key: string, value: string, ...args: Array<string | number>) {
    const nx = args.includes('NX');
    const pxIndex = args.findIndex((arg) => arg === 'PX');
    const ttl = pxIndex >= 0 ? Number(args[pxIndex + 1]) : undefined;

    if (nx && this.hasKey(key)) {
      return null;
    }

    this.store.set(key, { value });
    if (ttl && Number.isFinite(ttl)) {
      this.expiries.set(key, this.now() + ttl);
    } else {
      this.expiries.delete(key);
    }
    return 'OK';
  }

  async del(...keys: string[]) {
    let removed = 0;
    for (const key of keys) {
      if (this.hasKey(key)) {
        this.deleteKey(key);
        removed += 1;
      }
    }
    return removed;
  }

  async mget(...keys: string[]) {
    return Promise.all(keys.map((key) => this.get(key)));
  }

  async keys(pattern: string) {
    const regex = this.patternToRegex(pattern);
    return this.allKeys().filter((key) => regex.test(key));
  }

  async scan(cursor: string | number, ...args: Array<string | number>) {
    const current = Math.max(0, Number(cursor) || 0);
    let pattern = '*';
    let count = 10;

    for (let i = 0; i < args.length; i += 2) {
      const option = String(args[i]).toUpperCase();
      const value = args[i + 1];
      if (option === 'MATCH' && value !== undefined) {
        pattern = String(value);
      }
      if (option === 'COUNT' && value !== undefined) {
        const parsedCount = Number(value);
        if (Number.isFinite(parsedCount) && parsedCount > 0) {
          count = parsedCount;
        }
      }
    }

    const regex = this.patternToRegex(pattern);
    const all = this.allKeys().filter((key) => regex.test(key));
    const page = all.slice(current, current + count);
    const nextCursor =
      current + count >= all.length ? '0' : String(current + count);

    return [nextCursor, page] as [string, string[]];
  }

  async hget(key: string, field: string) {
    if (this.isExpired(key)) {
      return null;
    }
    const map = this.hashes.get(key);
    return map?.get(field) ?? null;
  }

  async hset(key: string, field: string, value: string) {
    if (this.isExpired(key)) {
      this.deleteKey(key);
    }
    let map = this.hashes.get(key);
    if (!map) {
      map = new Map();
      this.hashes.set(key, map);
    }
    const isNew = !map.has(field);
    map.set(field, value);
    return isNew ? 1 : 0;
  }

  async hmget(key: string, ...fields: string[]) {
    return Promise.all(fields.map((field) => this.hget(key, field)));
  }

  async pexpire(key: string, ttl: number) {
    if (!this.hasKey(key)) {
      return 0;
    }
    this.expiries.set(key, this.now() + ttl);
    return 1;
  }

  async zadd(key: string, ...args: Array<string | number>) {
    if (this.isExpired(key)) {
      this.deleteKey(key);
    }
    let zset = this.zsets.get(key);
    if (!zset) {
      zset = new Map();
      this.zsets.set(key, zset);
    }

    let added = 0;
    for (let i = 0; i < args.length; i += 2) {
      const score = Number(args[i]);
      const member = String(args[i + 1]);
      if (!zset.has(member)) {
        added += 1;
      }
      zset.set(member, score);
    }

    return added;
  }

  async zrank(key: string, member: string) {
    if (this.isExpired(key)) {
      return null;
    }
    const zset = this.zsets.get(key);
    if (!zset || !zset.has(member)) {
      return null;
    }
    const sorted = Array.from(zset.entries()).sort((a, b) => {
      if (a[1] === b[1]) {
        return a[0].localeCompare(b[0]);
      }
      return a[1] - b[1];
    });
    const index = sorted.findIndex(([entry]) => entry === member);
    return index >= 0 ? index : null;
  }

  async zrem(key: string, member: string) {
    if (this.isExpired(key)) {
      return 0;
    }
    const zset = this.zsets.get(key);
    if (!zset) {
      return 0;
    }
    const existed = zset.delete(member);
    return existed ? 1 : 0;
  }

  async zcard(key: string) {
    if (this.isExpired(key)) {
      return 0;
    }
    return this.zsets.get(key)?.size ?? 0;
  }

  async zrange(key: string, start: number, end: number) {
    if (this.isExpired(key)) {
      return [];
    }
    const zset = this.zsets.get(key);
    if (!zset || zset.size === 0) {
      return [];
    }

    const sorted = Array.from(zset.entries())
      .sort((a, b) => {
        if (a[1] === b[1]) {
          return a[0].localeCompare(b[0]);
        }
        return a[1] - b[1];
      })
      .map(([member]) => member);

    const normalizedStart =
      start < 0 ? Math.max(sorted.length + start, 0) : start;
    const normalizedEnd = end < 0 ? sorted.length + end : end;
    if (normalizedStart > normalizedEnd || normalizedStart >= sorted.length) {
      return [];
    }

    return sorted.slice(normalizedStart, normalizedEnd + 1);
  }

  async zpopmin(key: string, count: number) {
    if (this.isExpired(key)) {
      return [];
    }
    const zset = this.zsets.get(key);
    if (!zset || zset.size === 0) {
      return [];
    }

    const sorted = Array.from(zset.entries()).sort((a, b) => {
      if (a[1] === b[1]) {
        return a[0].localeCompare(b[0]);
      }
      return a[1] - b[1];
    });
    const results: string[] = [];
    const take = Math.min(count, sorted.length);
    for (let i = 0; i < take; i += 1) {
      const [member, score] = sorted[i];
      zset.delete(member);
      results.push(member, String(score));
    }
    return results;
  }

  async sadd(key: string, ...members: string[]) {
    if (this.isExpired(key)) {
      this.deleteKey(key);
    }
    let set = this.sets.get(key);
    if (!set) {
      set = new Set();
      this.sets.set(key, set);
    }
    let added = 0;
    for (const member of members) {
      if (!set.has(member)) {
        added += 1;
        set.add(member);
      }
    }
    return added;
  }

  async srem(key: string, ...members: string[]) {
    if (this.isExpired(key)) {
      return 0;
    }
    const set = this.sets.get(key);
    if (!set) {
      return 0;
    }
    let removed = 0;
    for (const member of members) {
      if (set.delete(member)) {
        removed += 1;
      }
    }
    return removed;
  }

  async eval(_script: string, _numKeys: number, key: string, value: string) {
    const current = await this.get(key);
    if (current === value) {
      await this.del(key);
      return 1;
    }
    return 0;
  }

  multi() {
    return new InMemoryMulti(this);
  }
}

class InMemoryMulti {
  private readonly commands: Array<() => Promise<any>> = [];

  constructor(private readonly redis: InMemoryRedis) {}

  zadd(...args: Parameters<InMemoryRedis['zadd']>) {
    this.commands.push(() => this.redis.zadd(...args));
    return this;
  }

  set(...args: Parameters<InMemoryRedis['set']>) {
    this.commands.push(() => this.redis.set(...args));
    return this;
  }

  sadd(...args: Parameters<InMemoryRedis['sadd']>) {
    this.commands.push(() => this.redis.sadd(...args));
    return this;
  }

  del(...args: Parameters<InMemoryRedis['del']>) {
    this.commands.push(() => this.redis.del(...args));
    return this;
  }

  exec() {
    if (this.redis.failExec) {
      this.redis.failExec = false;
      return Promise.resolve(null);
    }
    return Promise.all(this.commands.map((cmd) => cmd())).then((results) =>
      results.map((result) => [null, result]),
    );
  }
}

export function createRedisMock() {
  return new InMemoryRedis();
}

export type RedisMock = ReturnType<typeof createRedisMock>;
