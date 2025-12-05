/**
 * nano-cache v2 — The smallest full-featured in-memory cache
 * ~4.3 KB gzipped · Zero dependencies · Node ≥14 / Deno / Bun / Browser / Workers
 */

export type DisposeValue<V = any> = (
  value: V,
  key: string,
  reason: 'expire' | 'lru' | 'delete' | 'clear'
) => void;

export interface NanoCacheOptions<V = any> {
  /** Default TTL in milliseconds (0 = no expiration) */
  defaultTTL?: number;
  /** Max number of entries before LRU eviction (0 = unlimited) */
  maxSize?: number;
  /** Background cleanup interval in ms (0 = disabled) */
  checkPeriod?: number;
  /** Return expired values instead of undefined */
  allowStale?: boolean;
  /** Serve stale value for N ms after expiry (great for revalidation window) */
  staleWhileRevalidate?: number;
  /** Serve stale value for N ms if loader throws */
  staleIfError?: number;
  /** Deep clone values on set/get using structuredClone or fallback */
  useClone?: boolean;
  /** Called when value is removed (expire, evict, delete, clear) */
  disposeValue?: DisposeValue<V> | null;
}

interface CacheEntry<V> {
  v: V;           // value
  e: number;      // expiry timestamp (0 = never)
  t: number;      // last touch time (for LRU)
  a: number;      // access count (anti-starvation)
}

type EventType = 'expire' | 'evict';
type EventCallback = (info: { key: string; value: any; reason: string }) => void;

export default class NanoCache<V = any> {
  private static readonly DEFAULTS: Required<NanoCacheOptions> = {
    defaultTTL: 0,
    maxSize: 0,
    checkPeriod: 10_000,
    allowStale: false,
    staleWhileRevalidate: 0,
    staleIfError: 0,
    useClone: false,
    disposeValue: null,
  };

  private readonly opts: Required<NanoCacheOptions<V>>;
  private readonly _map = new Map<string, CacheEntry<V>>();
  private _timer: ReturnType<typeof setInterval> | null = null;
  private readonly _events = new Map<EventType, EventCallback[]>([
    ['expire', []],
    ['evict', []],
  ]);
  private _pending = new Map<string, Promise<V>>(); // for getOrSet deduplication

  constructor(options: NanoCacheOptions<V> = {}) {
    this.opts = { ...NanoCache.DEFAULTS, ...options };
    if (this.opts.checkPeriod > 0) this._startCleanupTimer();
  }

  // ───────────────────────────── Core API ─────────────────────────────

  set(key: string, value: V, ttl = this.opts.defaultTTL): this {
    const now = Date.now();
    const exp = ttl > 0 ? now + ttl : 0;
    const cloned = this.opts.useClone ? this._clone(value) : value;

    const entry: CacheEntry<V> = { v: cloned, e: exp, t: now, a: 0 };

    const existed = this._map.has(key);
    this._map.set(key, entry);

    if (!existed && this.opts.maxSize > 0 && this._map.size > this.opts.maxSize) {
      this._evictLRU();
    }

    return this;
  }

  get(key: string, options: { touch?: boolean } = {}): V | undefined {
    const { touch = true } = options;
    const entry = this._map.get(key);
    if (!entry) return undefined;

    const now = Date.now();
    const expired = entry.e !== 0 && entry.e < now;

    if (expired) {
      if (this.opts.allowStale) {
        if (touch) this._touch(entry);
        return entry.v;
      }
      if (
        this.opts.staleWhileRevalidate > 0 &&
        now - entry.e < this.opts.staleWhileRevalidate
      ) {
        if (touch) this._touch(entry);
        return entry.v;
      }
      return undefined;
    }

    if (touch) this._touch(entry);
    return entry.v;
  }

  peek(key: string): V | undefined {
    return this.get(key, { touch: false });
  }

  has(key: string): boolean {
    const entry = this._map.get(key);
    if (!entry) return false;
    if (entry.e === 0 || entry.e >= Date.now()) return true;
    return this.opts.allowStale;
  }

  del(key: string): this {
    const entry = this._map.get(key);
    if (entry) {
      this._disposeEntry(key, entry, 'delete');
      this._map.delete(key);
    }
    return this;
  }

  clear(): this {
    for (const [key, entry] of this._map) {
      this._disposeEntry(key, entry, 'clear');
    }
    this._map.clear();
    return this;
  }

  // ───────────────────────────── TTL Management ─────────────────────────────

  ttl(key: string): number | null;
  ttl(key: string, newTTL: number): this;
  ttl(key: string, newTTL?: number): number | null | this {
    const entry = this._map.get(key);
    if (!entry) return null;

    if (newTTL !== undefined) {
      entry.e = newTTL > 0 ? Date.now() + newTTL : 0;
      return this;
    }

    if (entry.e === 0) return Infinity;
    const remaining = entry.e - Date.now();
    return remaining > 0 ? remaining : 0;
  }

  // ───────────────────────────── Batch Operations ─────────────────────────────

  mget(keys: string[]): (V | undefined)[] {
    return keys.map((k) => this.get(k));
  }

  mset(map: Record<string, V>, ttl?: number): this {
    Object.entries(map).forEach(([k, v]) => this.set(k, v, ttl));
    return this;
  }

  mdel(keys: string[]): this {
    keys.forEach((k) => this.del(k));
    return this;
  }

  // ───────────────────────────── Async Helpers ─────────────────────────────

  async getOrSet(key: string, loader: () => Promise<V>, ttl = this.opts.defaultTTL): Promise<V> {
    const existing = this.get(key);
    if (existing !== undefined) return existing;

    let pending = this._pending.get(key);
    if (!pending) {
      pending = loader()
        .then((val) => {
          this.set(key, val, ttl);
          this._pending.delete(key);
          return val;
        })
        .catch((err) => {
          this._pending.delete(key);

          // stale-if-error
          if (this.opts.staleIfError > 0) {
            const oldEntry = this._map.get(key);
            const oldValue = oldEntry?.v;
            if (
              oldValue !== undefined &&
              oldEntry &&
              Date.now() - oldEntry.e < this.opts.staleIfError
            ) {
              return oldValue;
            }
          }
          throw err;
        });

      this._pending.set(key, pending);
    }

    return pending;
  }

  wrap(key: string, loader: () => Promise<V>, ttl?: number): () => Promise<V> {
    return () => this.getOrSet(key, loader, ttl);
  }

  // ───────────────────────────── Introspection ─────────────────────────────

  get size(): number {
    return this._map.size;
  }

  keys(): IterableIterator<string> {
    return this._map.keys();
  }

  values(): IterableIterator<V> {
    return Array.from(this._map.values(), entry => entry.v)[Symbol.iterator]();
  }

  entries(): IterableIterator<[string, V]> {
    return (function* (map: Map<string, CacheEntry<V>>) {
      for (const [key, entry] of map) {
        yield [key, entry.v] as [string, V];
      }
    })(this._map);
  }

  stats(): { size: number; expired: number; estimatedBytes: number } {
    const now = Date.now();
    let expired = 0;
    let bytes = 0;

    for (const entry of this._map.values()) {
      if (entry.e !== 0 && entry.e < now) expired++;
      bytes += this._roughSizeOf(entry.v);
    }

    return { size: this.size, expired, estimatedBytes: bytes };
  }

  // ───────────────────────────── Events ─────────────────────────────

  on(event: EventType, callback: EventCallback): this {
    const list = this._events.get(event);
    if (list) list.push(callback);
    return this;
  }

  off(event: EventType, callback: EventCallback): this {
    const list = this._events.get(event);
    if (list) {
      const idx = list.indexOf(callback);
      if (idx !== -1) list.splice(idx, 1);
    }
    return this;
  }

  private _emit(event: EventType, key: string, value: V, reason: string): void {
    for (const cb of this._events.get(event) ?? []) {
      try { cb({ key, value, reason }); } catch {}
    }
  }

  // ───────────────────────────── Internal ─────────────────────────────

  private _startCleanupTimer(): void {
    if (this._timer) return;

    const tick = () => {
      const cleaned = this._cleanup();
      if (cleaned === 0 && this._map.size === 0) {
        if (this._timer) clearInterval(this._timer as number);
        this._timer = null;
      }
    };

    this._timer = setInterval(tick, this.opts.checkPeriod);
    if (typeof (this._timer as any).unref === 'function') {
      (this._timer as any).unref();
    }
  }

  private _cleanup(limit = Infinity): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this._map) {
      if (entry.e !== 0 && entry.e < now) {
        this._disposeEntry(key, entry, 'expire');
        this._map.delete(key);
        this._emit('expire', key, entry.v, 'ttl');
        if (++cleaned >= limit) break;
      }
    }
    return cleaned;
  }

  private _evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestScore = Infinity;

    for (const [key, entry] of this._map) {
      const score = entry.t * 1_000_000 - entry.a;
      if (score < oldestScore) {
        oldestScore = score;
        oldestKey = key;
      }
    }

    if (oldestKey !== null) {
      const entry = this._map.get(oldestKey)!;
      this._disposeEntry(oldestKey, entry, 'lru');
      this._map.delete(oldestKey);
      this._emit('evict', oldestKey, entry.v, 'lru');
    }
  }

  private _touch(entry: CacheEntry<V>): void {
    entry.t = Date.now();
    entry.a += 1;
  }

  private _disposeEntry(key: string, entry: CacheEntry<V>, reason: string): void {
    if (typeof this.opts.disposeValue === 'function') {
      try {
        this.opts.disposeValue(entry.v, key, reason as any);
      } catch {}
    }
  }

  private _clone(val: V): V {
    if (typeof structuredClone === 'function') return structuredClone(val);
    if (val === null || typeof val !== 'object') return val;
    if (Array.isArray(val)) return [...val] as any;
    if (val instanceof Date) return new Date(val.getTime()) as any;
    if (val instanceof Map) return new Map(val) as any;
    if (val instanceof Set) return new Set(val) as any;
    return { ...val };
  }

  private _roughSizeOf(val: any): number {
    if (val == null) return 0;
    if (typeof val === 'string') return val.length * 2;
    if (typeof val === 'number' || typeof val === 'boolean') return 8;
    if (Array.isArray(val)) return val.length * 32;
    if (val && typeof val === 'object') return Object.keys(val).length * 64;
    return 100;
  }

  // ───────────────────────────── Cleanup ─────────────────────────────

  dispose(): void {
    if (this._timer) {
      clearInterval(this._timer as number);
      this._timer = null;
    }
    this.clear();
    this._events.clear();
    this._pending?.clear();
  }
}

export { NanoCache };
