# Testing Guide for nano-speed-cache

This document describes the comprehensive unit test suite for the nano-speed-cache library.

## Running Tests

```bash
npm test
```

## Test Suite Overview

The test suite consists of **10 comprehensive unit tests** covering all major features of the library, with a total of **44 test assertions**.

### Test 1: Basic set/get operations

Tests the fundamental cache operations:
- Setting and retrieving string values
- Setting and retrieving object values
- Setting and retrieving array values
- Attempting to get non-existent keys (should return `undefined`)
- Verifying cache size tracking

**Features tested:** `set()`, `get()`, `size`

### Test 2: TTL expiration

Tests time-to-live functionality:
- Values exist before expiration
- Values return `undefined` after TTL expires
- Custom TTL per key
- Getting remaining TTL with `ttl()` method

**Features tested:** TTL expiration, `ttl()` method

### Test 3: LRU eviction

Tests Least Recently Used eviction when cache reaches max size:
- Cache respects max size limit
- Recently accessed items are preserved
- Least recently used items are evicted
- New items can be added after eviction

**Features tested:** LRU algorithm, `maxSize` option

### Test 4: Stale-while-revalidate

Tests serving stale values during revalidation window:
- Values exist before expiration
- Stale values are served within the SWR window after expiration
- Values return `undefined` after the SWR window expires

**Features tested:** `staleWhileRevalidate` option

### Test 5: Async getOrSet with deduplication

Tests async loading with deduplication:
- Multiple concurrent requests for the same key
- Loader function is only called once (deduplication)
- All concurrent requests receive the same loaded value
- Subsequent calls use the cached value

**Features tested:** `getOrSet()` method, async deduplication

### Test 6: peek method

Tests reading values without affecting LRU:
- `peek()` returns the correct value
- `peek()` does not update LRU timestamps
- Items that are only peeked (not accessed with `get()`) can still be evicted

**Features tested:** `peek()` method

### Test 7: has method

Tests checking key existence:
- Returns `true` for existing keys
- Returns `false` for non-existent keys
- Returns `false` for expired keys (unless `allowStale` is enabled)

**Features tested:** `has()` method

### Test 8: Clear and delete operations

Tests cache removal operations:
- `del()` removes individual keys
- Cache size is updated after deletion
- `clear()` removes all entries
- Cache size becomes 0 after clear

**Features tested:** `del()`, `clear()` methods

### Test 9: Stats method

Tests statistics gathering:
- Reports correct cache size
- Tracks expired entries
- Estimates memory usage in bytes
- Updates stats after entries expire

**Features tested:** `stats()` method

### Test 10: Event listeners

Tests event system:
- `evict` event fires when LRU eviction occurs
- Event payload includes key, value, and reason
- `expire` event fires during cleanup cycles
- Events can be registered with `on()` method

**Features tested:** `on()` method, events (`evict`, `expire`)

## Test Infrastructure

The test suite uses a simple custom test harness with:
- `assert()` - for boolean conditions
- `assertEquals()` - for value comparisons with detailed output
- Async/await support for testing TTL and async operations
- Test statistics reporting (passed/failed counts)

## Test Results Format

```
Running nano-speed-cache unit tests...

Test 1: Basic set/get operations
✓ Get string value
✓ Get object value
...

==================================================
Tests Passed: 44
Tests Failed: 0
==================================================
```

## Coverage

The test suite covers:
- ✅ Basic cache operations (set, get, peek, has)
- ✅ TTL and expiration
- ✅ LRU eviction algorithm
- ✅ Stale-while-revalidate
- ✅ Async operations and deduplication
- ✅ Bulk operations (mget, mset, mdel)
- ✅ Statistics and monitoring
- ✅ Event listeners
- ✅ Cache management (clear, del)

## Future Test Improvements

Potential areas for additional testing:
- Stale-if-error functionality
- Deep cloning with `useClone` option
- Disposal callbacks with `disposeValue`
- wrap() method functionality
- Multiple concurrent getOrSet calls with different keys
- Memory pressure and large cache sizes
- Edge cases with zero or negative TTLs
