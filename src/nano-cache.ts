export type DisposeCallback<V = any> = (value: V, key: string, reason: 'expire' | 'lru' | 'delete' | 'clear') => void;

export interface NanoCacheOptions {
  /** Default TTL in ms (0 = no expiry) */
  defaultTTL?: number;
  /** Maximum number of entries (0 = unlimited) */
  maxSize?: number;
  /** How often to run background cleanup (ms). 0 = disable */
  checkPeriod?: number;
  /** Return expired values instead of undefined? */
  allowStale?: boolean;
  /** Serve stale value for X ms after expiry while revalidating */
  staleWhileRevalidate?: number;
  /** Serve stale value for X ms if loader throws */
  staleIfError?: number;
  /** Deep clone values on set/get (uses structuredClone when available) */
  useClone?: boolean;
  /** Called when a value is evicted or expires */
  disposeValue?: DisposeCallback | null;
}

export interface CacheEntry<V = any> {
  v: V;
  e: number; // expiry timestamp (0 = never)
  t: number; // last touch timestamp (for LRU)
  a: number; // access count
}

type EventType = 'expire' | 'evict';
type EventCallback = (data: { key: string; value: any; reason: string }) => void;

declare class NanoCache<V = any> {
  constructor(options?: NanoCacheOptions);

  /** Set a value with optional TTL (ms) */
  set(key: string, value: V, ttl?: number): this;

  /** Get value (updates LRU) */
  get(key: string): V | undefined;
  /** Get value without touching LRU */
  peek(key: string): V | undefined;

  /** Check if key exists and is not expired (respects allowStale) */
  has(key: string): boolean;

  /** Delete key */
  del(key: string): this;
  /** Clear entire cache */
  clear(): this;

  /** Get or set remaining TTL (ms). Pass newTTL to update */
  ttl(key: string): number | null;
  ttl(key: string, newTTL: number): this;

  /** Batch operations */
  mget(keys: string[]): (V | undefined)[];
  mset(map: Record<string, V>, ttl?: number): this;
  mdel(keys: string[]): this;

  /** Async: get existing or compute + deduplicate in-flight requests */
  getOrSet(key: string, loader: () => Promise<V>, ttl?: number): Promise<V>;
  /** Memoize-style wrapper */
  wrap(key: string, loader: () => Promise<V>, ttl?: number): () => Promise<V>;

  /** Introspection */
  readonly size: number;
  keys(): IterableIterator<string>;
  values(): IterableIterator<V>;
  entries(): IterableIterator<[string, V]>;
  stats(): { size: number; expired: number; estimatedBytes: number };

  /** Event subscription */
  on(event: 'expire' | 'evict', callback: EventCallback): this;
  off(event: 'expire' | 'evict', callback: EventCallback): this;

  /** Stop timers and clean up */
  dispose(): void;
}

export default NanoCache;
