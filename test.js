import NanoCache from './nano-cache.js'

const cache = new NanoCache({
  defaultTTL: 60_000,
  maxSize: 5000,
  staleWhileRevalidate: 30_000,
  useClone: true
});

cache.set('user:123', { name: 'Alice' }, 120000);
console.log(cache.get('user:123'));
