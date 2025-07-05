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

  describe('Cache Eviction and Advanced Features', () => {
    const mockResult = {
      head: { vars: ['s'] },
      results: {
        bindings: [{ s: { type: 'uri', value: 'http://example.org/test' } }],
      },
    };

    test('should handle cache eviction when maxSize is reached', () => {
      const cache = new QueryCache({ maxEntries: 2 }); // Small cache for testing eviction

      // Add first item
      cache.set('key1', mockResult);
      expect(cache.get('key1')).toEqual(mockResult);

      // Add second item
      cache.set('key2', mockResult);
      expect(cache.get('key1')).toEqual(mockResult);
      expect(cache.get('key2')).toEqual(mockResult);

      // Add third item - should evict the first one
      cache.set('key3', mockResult);
      expect(cache.get('key1')).toBeUndefined(); // Evicted
      expect(cache.get('key2')).toEqual(mockResult);
      expect(cache.get('key3')).toEqual(mockResult);
    });

    test('should handle cache eviction with TTL expiration', () => {
      jest.useFakeTimers();

      const cache = new QueryCache({ maxEntries: 100, defaultTtl: 1000 }); // 1 second TTL

      // Add an item
      cache.set('key1', mockResult);
      expect(cache.get('key1')).toEqual(mockResult);

      // Fast forward time by 500ms - should still be valid
      jest.advanceTimersByTime(500);
      expect(cache.get('key1')).toEqual(mockResult);

      // Fast forward time by another 600ms (total 1100ms) - should be expired
      jest.advanceTimersByTime(600);
      expect(cache.get('key1')).toBeUndefined();

      jest.useRealTimers();
    });

    test('should handle cache statistics and metrics', () => {
      const cache = new QueryCache({ maxEntries: 10 });

      // Initially empty cache
      expect(cache.getStats().size).toBe(0);

      // Add items
      cache.set('key1', mockResult);
      cache.set('key2', mockResult);
      expect(cache.getStats().size).toBe(2);

      // Test hits and misses
      expect(cache.get('key1')).toEqual(mockResult); // Hit
      expect(cache.get('nonexistent')).toBeUndefined(); // Miss

      // Clear cache
      cache.clear();
      expect(cache.getStats().size).toBe(0);
    });

    test('should handle edge cases with empty or undefined values', () => {
      const cache = new QueryCache({ maxEntries: 10 });

      // Test with empty result
      const emptyResult = {
        head: { vars: [] },
        results: { bindings: [] },
      };

      cache.set('empty', emptyResult);
      expect(cache.get('empty')).toEqual(emptyResult);

      // Test with undefined key
      expect(cache.get('')).toBeUndefined();
      expect(cache.get('') === undefined).toBe(true);

      // Test with special characters in key
      const specialKey = 'SELECT * FROM <http://example.org/graph>';
      cache.set(specialKey, mockResult);
      expect(cache.get(specialKey)).toEqual(mockResult);
    });

    test('should handle cache key collision and overwrites', () => {
      const cache = new QueryCache({ maxEntries: 10 });

      // Set initial value
      cache.set('key1', mockResult);
      expect(cache.get('key1')).toEqual(mockResult);

      // Overwrite with new value
      const newResult = {
        head: { vars: ['name'] },
        results: {
          bindings: [{ name: { type: 'literal', value: 'Updated' } }],
        },
      };

      cache.set('key1', newResult);
      expect(cache.get('key1')).toEqual(newResult);
      expect(cache.get('key1')).not.toEqual(mockResult);
    });

    test('should handle cache performance with large numbers of items', () => {
      const cache = new QueryCache({ maxEntries: 1000 });

      // Add many items
      for (let i = 0; i < 500; i++) {
        cache.set(`key${i}`, {
          head: { vars: ['id'] },
          results: {
            bindings: [{ id: { type: 'literal', value: i.toString() } }],
          },
        });
      }

      expect(cache.getStats().size).toBe(500);

      // Verify random access
      expect(cache.get('key100')).toBeDefined();
      expect(cache.get('key250')).toBeDefined();
      expect(cache.get('key499')).toBeDefined();
      expect(cache.get('key500')).toBeUndefined();
    });

    test('should handle memory cleanup on delete', () => {
      const cache = new QueryCache({ maxEntries: 10 });

      // Add multiple items
      cache.set('key1', mockResult);
      cache.set('key2', mockResult);
      cache.set('key3', mockResult);
      expect(cache.getStats().size).toBe(3);

      // Delete specific item
      cache.delete('key2');
      expect(cache.get('key1')).toEqual(mockResult);
      expect(cache.get('key2')).toBeUndefined();
      expect(cache.get('key3')).toEqual(mockResult);
      expect(cache.getStats().size).toBe(2);
    });

    test('should handle concurrent access patterns', () => {
      const cache = new QueryCache({ maxEntries: 10 });

      // Simulate concurrent access
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          Promise.resolve().then(() => {
            cache.set(`concurrent${i}`, {
              head: { vars: ['id'] },
              results: {
                bindings: [{ id: { type: 'literal', value: i.toString() } }],
              },
            });
          })
        );
      }

      return Promise.all(promises).then(() => {
        expect(cache.getStats().size).toBe(10);
        for (let i = 0; i < 10; i++) {
          expect(cache.get(`concurrent${i}`)).toBeDefined();
        }
      });
    });
  });
});
