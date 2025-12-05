import NanoSpeedCache from './dist/nano-speed-cache.js'

// Simple test harness
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✓ ${message}`);
    testsPassed++;
  } else {
    console.error(`✗ ${message}`);
    testsFailed++;
  }
}

function assertEquals(actual, expected, message) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    console.log(`✓ ${message}`);
    testsPassed++;
  } else {
    console.error(`✗ ${message}`);
    console.error(`  Expected: ${JSON.stringify(expected)}`);
    console.error(`  Actual: ${JSON.stringify(actual)}`);
    testsFailed++;
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

console.log('Running nano-speed-cache unit tests...\n');

// Test 1: Basic set/get operations
console.log('Test 1: Basic set/get operations');
{
  const cache = new NanoSpeedCache();
  cache.set('key1', 'value1');
  cache.set('key2', { name: 'Alice', age: 30 });
  cache.set('key3', [1, 2, 3]);
  
  assertEquals(cache.get('key1'), 'value1', 'Get string value');
  assertEquals(cache.get('key2'), { name: 'Alice', age: 30 }, 'Get object value');
  assertEquals(cache.get('key3'), [1, 2, 3], 'Get array value');
  assertEquals(cache.get('nonexistent'), undefined, 'Get nonexistent key returns undefined');
  assertEquals(cache.size, 3, 'Cache size is correct');
}

// Test 2: TTL expiration
console.log('\nTest 2: TTL expiration');
{
  const cache = new NanoSpeedCache({ defaultTTL: 100 });
  cache.set('expiring', 'value', 100);
  
  assertEquals(cache.get('expiring'), 'value', 'Value exists before expiration');
  
  await sleep(150);
  
  assertEquals(cache.get('expiring'), undefined, 'Value is undefined after expiration');
  
  // Test with custom TTL
  cache.set('custom', 'data', 200);
  const ttl = cache.ttl('custom');
  assert(ttl > 0 && ttl <= 200, 'TTL returns remaining time');
}

// Test 3: LRU eviction
console.log('\nTest 3: LRU eviction');
{
  const cache = new NanoSpeedCache({ maxSize: 3 });
  cache.set('a', 1);
  await sleep(5);
  cache.set('b', 2);
  await sleep(5);
  cache.set('c', 3);
  
  assertEquals(cache.size, 3, 'Cache size at max');
  
  // Access 'a' and 'c' to make them more recent with time gaps
  await sleep(5);
  cache.get('a');
  await sleep(5);
  cache.get('c');
  
  // Add new item, should evict 'b' (least recently used)
  await sleep(5);
  cache.set('d', 4);
  
  assertEquals(cache.size, 3, 'Cache size stays at max after eviction');
  assert(cache.get('a') !== undefined, 'Recently accessed item (a) is kept');
  assert(cache.get('c') !== undefined, 'Recently accessed item (c) is kept');
  assert(cache.get('b') === undefined, 'LRU item (b) was evicted');
  assert(cache.get('d') !== undefined, 'New item (d) is present');
}

// Test 4: Stale-while-revalidate
console.log('\nTest 4: Stale-while-revalidate');
{
  const cache = new NanoSpeedCache({ staleWhileRevalidate: 200 });
  cache.set('stale-key', 'stale-value', 50);
  
  assertEquals(cache.get('stale-key'), 'stale-value', 'Value exists before expiration');
  
  await sleep(100);
  
  // After expiration but within stale-while-revalidate window
  assertEquals(cache.get('stale-key'), 'stale-value', 'Stale value is returned during revalidation window');
  
  await sleep(150);
  
  // Beyond stale-while-revalidate window
  assertEquals(cache.get('stale-key'), undefined, 'Value is undefined after SWR window');
}

// Test 5: Async getOrSet with deduplication
console.log('\nTest 5: Async getOrSet with deduplication');
{
  const cache = new NanoSpeedCache();
  let loadCount = 0;
  
  const loader = async () => {
    loadCount++;
    await sleep(50);
    return 'loaded-value';
  };
  
  // Make multiple concurrent requests
  const promises = [
    cache.getOrSet('async-key', loader),
    cache.getOrSet('async-key', loader),
    cache.getOrSet('async-key', loader)
  ];
  
  const results = await Promise.all(promises);
  
  assertEquals(results[0], 'loaded-value', 'First request returns loaded value');
  assertEquals(results[1], 'loaded-value', 'Second request returns loaded value');
  assertEquals(results[2], 'loaded-value', 'Third request returns loaded value');
  assertEquals(loadCount, 1, 'Loader was only called once (deduplication works)');
  
  // Second call should use cached value
  const cached = await cache.getOrSet('async-key', loader);
  assertEquals(cached, 'loaded-value', 'Subsequent call uses cached value');
  assertEquals(loadCount, 1, 'Loader still only called once');
}

// Test 6: peek method (no LRU touch)
console.log('\nTest 6: peek method');
{
  const cache = new NanoSpeedCache({ maxSize: 2 });
  cache.set('a', 1);
  cache.set('b', 2);
  
  // Peek at 'a' (should not affect LRU)
  assertEquals(cache.peek('a'), 1, 'Peek returns correct value');
  
  // Add a new item - 'a' should be evicted since peek didn't touch it
  cache.set('c', 3);
  
  assert(cache.get('a') === undefined, 'Peeked item was evicted (peek does not affect LRU)');
  assert(cache.get('b') !== undefined, 'Other item remains');
}

// Test 7: has method
console.log('\nTest 7: has method');
{
  const cache = new NanoSpeedCache({ defaultTTL: 100 });
  cache.set('exists', 'value');
  
  assert(cache.has('exists'), 'has() returns true for existing key');
  assert(!cache.has('missing'), 'has() returns false for missing key');
  
  await sleep(150);
  
  assert(!cache.has('exists'), 'has() returns false for expired key');
}

// Test 8: Clear and delete operations
console.log('\nTest 8: Clear and delete operations');
{
  const cache = new NanoSpeedCache();
  cache.set('a', 1);
  cache.set('b', 2);
  cache.set('c', 3);
  
  assertEquals(cache.size, 3, 'Initial size is 3');
  
  cache.del('b');
  assertEquals(cache.size, 2, 'Size after delete is 2');
  assert(cache.get('b') === undefined, 'Deleted key returns undefined');
  assert(cache.get('a') !== undefined, 'Other keys remain');
  
  cache.clear();
  assertEquals(cache.size, 0, 'Size after clear is 0');
  assert(cache.get('a') === undefined, 'All keys cleared');
}

// Test 9: Stats method
console.log('\nTest 9: Stats method');
{
  const cache = new NanoSpeedCache({ defaultTTL: 100 });
  cache.set('key1', 'value1');
  cache.set('key2', { data: 'test' });
  cache.set('key3', 'value3', 50);
  
  let stats = cache.stats();
  assertEquals(stats.size, 3, 'Stats shows correct size');
  assertEquals(stats.expired, 0, 'Stats shows no expired entries initially');
  assert(stats.estimatedBytes > 0, 'Stats shows estimated bytes > 0');
  
  await sleep(100);
  
  stats = cache.stats();
  assert(stats.expired > 0, 'Stats shows expired entries after TTL');
}

// Test 10: Event listeners
console.log('\nTest 10: Event listeners');
{
  const cache = new NanoSpeedCache({ maxSize: 2, checkPeriod: 50 });
  const events = { expire: [], evict: [] };
  
  cache.on('expire', (info) => {
    events.expire.push(info);
  });
  
  cache.on('evict', (info) => {
    events.evict.push(info);
  });
  
  // Test eviction event
  cache.set('a', 1);
  cache.set('b', 2);
  cache.set('c', 3); // Should trigger evict
  
  await sleep(10);
  
  assert(events.evict.length > 0, 'Evict event was fired');
  if (events.evict.length > 0) {
    assert(events.evict[0].key !== undefined, 'Evict event contains key');
    assertEquals(events.evict[0].reason, 'lru', 'Evict event reason is lru');
  }
  
  // Test expiration event with shorter TTL and cleanup period
  cache.set('expiring', 'value', 50);
  
  // Wait for cleanup cycle to run (checkPeriod is 50ms)
  await sleep(150);
  
  assert(events.expire.length > 0, 'Expire event was fired after cleanup cycle');
  if (events.expire.length > 0) {
    assertEquals(events.expire[0].key, 'expiring', 'Expire event has correct key');
  }
}

// Summary
console.log('\n' + '='.repeat(50));
console.log(`Tests Passed: ${testsPassed}`);
console.log(`Tests Failed: ${testsFailed}`);
console.log('='.repeat(50));

if (testsFailed > 0) {
  process.exit(1);
}
