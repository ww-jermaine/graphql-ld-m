import { Logger } from '../../shared/monitoring/Logger';

/**
 * Cache entry structure
 */
interface CacheEntry<T> {
  value: T;
  timestamp: number;
  expiresAt: number;
}

/**
 * Cache configuration options
 */
export interface CacheConfig {
  maxEntries?: number;
  defaultTtl?: number;
  cleanupInterval?: number;
}

/**
 * LRU Cache implementation for query results
 */
export class QueryCache<T> {
  private cache: Map<string, CacheEntry<T>>;
  private maxEntries: number;
  private defaultTtl: number;
  private cleanupInterval: number;
  private logger: Logger;
  private accessOrder: string[];

  constructor(config?: CacheConfig) {
    this.maxEntries = Math.max(1, config?.maxEntries || 1000);
    this.defaultTtl = Math.max(1000, config?.defaultTtl || 300000); // 5 minutes minimum
    this.cleanupInterval = Math.max(1000, config?.cleanupInterval || 60000); // 1 minute minimum
    this.cache = new Map();
    this.accessOrder = [];
    this.logger = Logger.getInstance();

    // Start cleanup interval
    setInterval(() => this.cleanup(), this.cleanupInterval).unref();
  }

  /**
   * Get a value from cache
   */
  public get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.logger.debug('Cache miss', { key });
      return undefined;
    }

    if (this.isExpired(entry)) {
      this.logger.debug('Cache entry expired', { key });
      this.delete(key);
      return undefined;
    }

    // Update access order
    this.updateAccessOrder(key);

    this.logger.debug('Cache hit', { key });
    return entry.value;
  }

  /**
   * Set a value in cache
   */
  public set(key: string, value: T, ttl?: number): void {
    // Ensure we don't exceed max entries
    if (this.cache.size >= this.maxEntries) {
      this.evictOldest();
    }

    const now = Date.now();
    this.cache.set(key, {
      value,
      timestamp: now,
      expiresAt: now + Math.max(1000, ttl || this.defaultTtl),
    });

    // Update access order
    this.updateAccessOrder(key);

    this.logger.debug('Cache entry set', { key });
  }

  /**
   * Delete a value from cache
   */
  public delete(key: string): void {
    this.cache.delete(key);
    const index = this.accessOrder.indexOf(key);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
    this.logger.debug('Cache entry deleted', { key });
  }

  /**
   * Clear all entries from cache
   */
  public clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.logger.debug('Cache cleared');
  }

  /**
   * Get cache statistics
   */
  public getStats(): Record<string, number> {
    return {
      size: this.cache.size,
      maxEntries: this.maxEntries,
      defaultTtl: this.defaultTtl,
    };
  }

  /**
   * Check if a cache entry is expired
   */
  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() > entry.expiresAt;
  }

  /**
   * Remove expired entries
   */
  private cleanup(): void {
    let removed = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.delete(key);
        removed++;
      }
    }
    if (removed > 0) {
      this.logger.debug('Cache cleanup completed', { removedEntries: removed });
    }
  }

  /**
   * Update access order for LRU eviction
   */
  private updateAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);
  }

  /**
   * Remove oldest entry from cache
   */
  private evictOldest(): void {
    if (this.accessOrder.length > 0) {
      const oldestKey = this.accessOrder[0];
      this.delete(oldestKey);
      this.logger.debug('Cache entry evicted', { key: oldestKey });
    }
  }
}
