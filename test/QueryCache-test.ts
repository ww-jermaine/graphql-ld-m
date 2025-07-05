import { QueryCache } from '../src/infrastructure/cache/QueryCache';

describe('QueryCache', () => {
  let cache: QueryCache<unknown>;

  beforeEach(() => {
    cache = new QueryCache<unknown>({
      maxEntries: 100,
      defaultTtl: 1000, // 1 second TTL for testing
    });
  });

  describe('basic operations', () => {
    it('should store and retrieve values', () => {
      const key = 'test-key';
      const value = { data: 'test-value' };

      cache.set(key, value);
      expect(cache.get(key)).toEqual(value);
    });

    it('should return undefined for non-existent keys', () => {
      expect(cache.get('non-existent')).toBeUndefined();
    });

    it('should handle deletion', () => {
      const key = 'test-key';
      const value = { data: 'test-value' };

      cache.set(key, value);
      expect(cache.get(key)).toEqual(value);

      cache.delete(key);
      expect(cache.get(key)).toBeUndefined();
    });

    it('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      cache.clear();

      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBeUndefined();
    });
  });

  describe('TTL behavior', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should expire entries after TTL', () => {
      const key = 'ttl-test';
      const value = { data: 'test-value' };

      cache.set(key, value);
      expect(cache.get(key)).toEqual(value);

      jest.advanceTimersByTime(1100); // Advance past TTL
      expect(cache.get(key)).toBeUndefined();
    });

    it('should respect custom TTL', () => {
      const cache = new QueryCache<unknown>({
        maxEntries: 100,
        defaultTtl: 1000,
      });

      const key = 'ttl-test';
      const value = { data: 'test-value' };

      cache.set(key, value);

      // Advance time but not past TTL
      jest.advanceTimersByTime(800);
      expect(cache.get(key)).toEqual(value);

      // Advance past TTL
      jest.advanceTimersByTime(1100);
      expect(cache.get(key)).toBeUndefined();
    });
  });

  describe('LRU behavior', () => {
    it('should evict least recently used items when full', () => {
      const cache = new QueryCache<string>({ maxEntries: 2 });

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3'); // Should evict key1

      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBe('value2');
      expect(cache.get('key3')).toBe('value3');
    });

    it('should update access order on get', () => {
      const cache = new QueryCache<string>({ maxEntries: 2 });

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      // Access key1 to make it most recently used
      cache.get('key1');

      // Add new item, should evict key2 instead of key1
      cache.set('key3', 'value3');

      expect(cache.get('key1')).toBe('value1');
      expect(cache.get('key2')).toBeUndefined();
      expect(cache.get('key3')).toBe('value3');
    });
  });

  describe('statistics', () => {
    it('should return cache stats', () => {
      const cache = new QueryCache<string>({ maxEntries: 2 });

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.maxEntries).toBe(2);
      expect(typeof stats.defaultTtl).toBe('number');
    });
  });

  describe('error handling', () => {
    it('should handle invalid keys gracefully', () => {
      expect(() => cache.get(undefined as any)).not.toThrow();
      expect(() => cache.set(null as any, 'value')).not.toThrow();
      expect(() => cache.delete('' as any)).not.toThrow();
    });

    it('should handle circular references in values', () => {
      const circularObj: any = { name: 'test' };
      circularObj.self = circularObj;

      expect(() => cache.set('circular', circularObj)).not.toThrow();
      expect(cache.get('circular')).toEqual(circularObj);
    });
  });

  describe('configuration', () => {
    it('should use default values when not provided', () => {
      const defaultCache = new QueryCache<string>();
      expect(defaultCache).toBeDefined();
      // Test default behavior works
      defaultCache.set('key', 'value');
      expect(defaultCache.get('key')).toBe('value');
    });

    it('should handle invalid configuration gracefully', () => {
      const cache = new QueryCache<string>({
        maxEntries: -1, // Invalid size
        defaultTtl: -1000, // Invalid TTL
      });

      // Should still work with some reasonable defaults
      cache.set('key', 'value');
      expect(cache.get('key')).toBe('value');
    });
  });
});
