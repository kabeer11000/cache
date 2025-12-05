# nano-speed-cache

**Ultra-small (<5KB) in-memory cache for Node.js & browsers with TTL, LRU eviction, stale-while-revalidate, stale-if-error, async deduplication (`getOrSet`), disposal hooks, deep cloning, and zero dependencies.**

Fast. Tiny. Fully-featured. Perfect for serverless, microservices, workers, or high-performance backend usage.

---

## ✨ Features

* ⚡ **Extremely fast** O(1) get/set using `Map`
* 🧠 **TTL support** (per-key or default)
* ♻️ **LRU eviction** when max size is reached
* 🕰️ **Stale-While-Revalidate (SWR)** window support
* 🛑 **Stale-If-Error** fallback
* 🚫 **Return stale values** even after expiration (optional)
* 🧵 **Async deduplication** via `getOrSet()`
* 🔄 **Deep cloning** via `structuredClone` (optional)
* 🧹 Background cleanup interval
* 🗑️ Custom `disposeValue` callback on deletion/eviction/expiration
* 📊 Stats: size, expired count, estimated memory usage
* 🎯 Zero dependencies
* 📦 ESM + TypeScript typings included

---

## 📦 Installation

```bash
npm install nano-speed-cache
```

---

## 🚀 Quick Usage

### ES Module (recommended)

```js
import NanoSpeedCache from "nano-speed-cache";

const cache = new NanoSpeedCache({
  defaultTTL: 60_000, // 1 min
  maxSize: 5000,
  staleWhileRevalidate: 30_000,
  useClone: true
});

cache.set("user:123", { name: "Alice" }, 120_000);
console.log(cache.get("user:123"));
```

### CommonJS

```js
const NanoSpeedCache = require("nano-speed-cache");

const cache = new NanoSpeedCache({ defaultTTL: 1000 });
cache.set("foo", "bar");
```

---

## 📘 API Reference

### `new NanoSpeedCache(options)`

| Option                 | Type                   | Default | Description                             |
| ---------------------- | ---------------------- | ------- | --------------------------------------- |
| `defaultTTL`           | `number`               | `0`     | Default TTL in ms (0 = never expires)   |
| `maxSize`              | `number`               | `0`     | Max entries (0 = unlimited)             |
| `checkPeriod`          | `number`               | `10000` | Background cleanup interval             |
| `allowStale`           | `boolean`              | `false` | Return stale expired values             |
| `staleWhileRevalidate` | `number`               | `0`     | Serve stale value for N ms after expiry |
| `staleIfError`         | `number`               | `0`     | Serve stale value if loader throws      |
| `useClone`             | `boolean`              | `false` | Deep clone on get/set                   |
| `disposeValue`         | `(v,key,reason)=>void` | `null`  | Disposal callback                       |

---

## 🔧 Methods

### `.set(key, value, ttl?)`

Set value with optional TTL.

### `.get(key, { touch=true })`

Get value; optionally disable touch for LRU.

### `.peek(key)`

Read without affecting LRU.

### `.del(key)`

Delete a key.

### `.clear()`

Clear entire cache.

### `.ttl(key)` / `.ttl(key, newTTL)`

Get or update TTL.

### `.getOrSet(key, loader, ttl?)`

Async deduplication:

```js
const value = await cache.getOrSet("config", async () => {
  return await fetchConfigFromDB();
});
```

If multiple requests come together, **only one loader executes**.

### `.wrap(key, loader, ttl)`

Returns a function that auto-caches:

```js
const cachedFetch = cache.wrap("weather", fetchWeather, 60000);
await cachedFetch();
```

### `.stats()`

Returns:

```js
{
  size: number,
  expired: number,
  estimatedBytes: number
}
```

### `.on(event, callback)` / `.off(event, callback)`

Supported events:

* `"expire"`
* `"evict"`

---

## 🧠 LRU Algorithm

LRU is based on:

```
score = lastTouchTimestamp * 1_000_000 - accessCount
```

This prevents high-frequency reads from being unfairly evicted.

---

## 🌙 Stale-While-Revalidate Example

```js
const cache = new NanoSpeedCache({
  staleWhileRevalidate: 20_000
});

// returns stale value for 20 seconds after expiry
```

---

## 🚑 Stale-If-Error Example

```js
const cache = new NanoSpeedCache({
  staleIfError: 10_000
});

await cache.getOrSet("profile", async () => {
  throw new Error("DB down");
});
// returns stale if available
```

---

## 🧪 Demo

Located in `/demo/demo.js`:

```js
const NanoSpeedCache = require("nano-speed-cache");

const cache = new NanoSpeedCache({
  defaultTTL: 60_000,
  maxSize: 5000,
  staleWhileRevalidate: 30_000,
  useClone: true
});

console.log(cache.get("user:123"));
```

---

## 🛠 Development

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

### TypeScript Config

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "declaration": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

---

## 📄 License

MIT © 2025 **Seyyed Ali Mohammadiyeh (Max Base)**
