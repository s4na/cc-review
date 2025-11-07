import { CacheStore } from '../../src/store/cache';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('CacheStore', () => {
  let cacheStore: CacheStore;
  let tempDir: string;
  let originalCachePath: string;

  beforeEach(() => {
    // Create a temporary directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-test-'));

    // Mock CACHE_PATH to use temp directory
    jest.mock('../../src/utils/paths', () => ({
      CACHE_PATH: path.join(tempDir, 'test-cache.sqlite'),
      ensureAppDir: jest.fn()
    }));

    cacheStore = new CacheStore();
  });

  afterEach(() => {
    cacheStore.close();
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('getPRCache', () => {
    it('should return null for non-existent PR', () => {
      const result = cacheStore.getPRCache('owner', 'repo', 123);
      expect(result).toBeNull();
    });

    it('should return cached PR data', () => {
      const cache = {
        owner: 'owner',
        repo: 'repo',
        prNumber: 123,
        latestSha: 'abc123',
        myCommentAfterSha: true,
        lastCheckedAt: new Date().toISOString()
      };

      cacheStore.setPRCache(cache);
      const result = cacheStore.getPRCache('owner', 'repo', 123);

      expect(result).toEqual(cache);
    });
  });

  describe('markCommented', () => {
    it('should mark PR as commented', () => {
      cacheStore.markCommented('owner', 'repo', 123, 'sha456');

      const result = cacheStore.getPRCache('owner', 'repo', 123);
      expect(result).not.toBeNull();
      expect(result?.latestSha).toBe('sha456');
      expect(result?.myCommentAfterSha).toBe(true);
    });
  });

  describe('tryAcquireLock', () => {
    it('should acquire lock for new PR', () => {
      const acquired = cacheStore.tryAcquireLock('owner', 'repo', 123, 'sha789');
      expect(acquired).toBe(true);

      const cache = cacheStore.getPRCache('owner', 'repo', 123);
      expect(cache?.latestSha).toBe('sha789');
      expect(cache?.myCommentAfterSha).toBe(false);
    });

    it('should not acquire lock for already commented PR with same SHA', () => {
      // First, mark as commented
      cacheStore.markCommented('owner', 'repo', 123, 'sha789');

      // Try to acquire lock
      const acquired = cacheStore.tryAcquireLock('owner', 'repo', 123, 'sha789');
      expect(acquired).toBe(false);
    });

    it('should acquire lock for PR with new SHA', () => {
      // First, mark as commented with old SHA
      cacheStore.markCommented('owner', 'repo', 123, 'oldsha');

      // Try to acquire lock with new SHA
      const acquired = cacheStore.tryAcquireLock('owner', 'repo', 123, 'newsha');
      expect(acquired).toBe(true);
    });
  });

  describe('runs tracking', () => {
    it('should track run lifecycle', () => {
      const runId = cacheStore.startRun();
      expect(runId).toBeGreaterThan(0);

      cacheStore.finishRun(runId, 'success');
      // If we get here without error, the run was finished successfully
    });
  });

  describe('clear', () => {
    it('should clear all cache data', () => {
      cacheStore.markCommented('owner', 'repo', 123, 'sha');
      cacheStore.startRun();

      cacheStore.clear();

      const result = cacheStore.getPRCache('owner', 'repo', 123);
      expect(result).toBeNull();
    });
  });
});
