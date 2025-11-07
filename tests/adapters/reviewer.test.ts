import { ReviewerAdapter } from '../../src/adapters/reviewer';
import { Config } from '../../src/types';
import execa from 'execa';

// Mock execa
jest.mock('execa');

const mockedExeca = execa as jest.MockedFunction<typeof execa>;

// Mock fs module properly
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  mkdtempSync: jest.fn().mockReturnValue('/tmp/pr-review-test'),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn().mockReturnValue('Mock review result'),
  rmSync: jest.fn()
}));

describe('ReviewerAdapter', () => {
  let adapter: ReviewerAdapter;
  let mockConfig: Config;

  beforeEach(() => {
    mockConfig = {
      githubUsername: 'testuser',
      githubTokenEnv: 'GITHUB_TOKEN',
      reviewCommand: 'claude api chat',
      claudeModel: 'claude-3-opus-20240229',
      maxTokens: 4000,
      maxConcurrent: 4,
      commentHeader: '[AI Review Bot]',
      ownerAllowlist: [],
      repoBlocklist: [],
      reviewTargetFilter: 'all',
      patrolIntervalMinutes: 10,
      webUIPort: 4567
    };

    adapter = new ReviewerAdapter(mockConfig);
    jest.clearAllMocks();
  });

  describe('review', () => {
    it('should skip trivial changes', async () => {
      const trivialDiff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,1 +1,1 @@
-// old comment
+// new comment
`;

      const result = await adapter.review(trivialDiff, {
        owner: 'owner',
        repo: 'repo',
        number: 123
      });

      expect(result.skipped).toBe(true);
      expect(result.reason).toContain('Trivial change');
    });

    it('should review meaningful changes', async () => {
      const meaningfulDiff = `diff --git a/src/file.ts b/src/file.ts
--- a/src/file.ts
+++ b/src/file.ts
@@ -1,5 +1,10 @@
 function example() {
+  const newVariable = 'test';
+  console.log(newVariable);
+  performAction();
+  handleData();
+  processResults();
   return true;
 }
`;

      mockedExeca.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0
      } as any);

      const result = await adapter.review(meaningfulDiff, {
        owner: 'owner',
        repo: 'repo',
        number: 123
      });

      expect(result.skipped).toBe(false);
      expect(result.content).toBe('Mock review result');
      expect(mockedExeca).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining([
          'api',
          'chat',
          '--model',
          'claude-3-opus-20240229',
          '--max-tokens',
          '4000'
        ])
      );
    });

    it('should clean up temp files on success', async () => {
      const fs = require('fs');
      const diff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,1 +1,10 @@
+function test() { return 1; }
+function test2() { return 2; }
+function test3() { return 3; }
+function test4() { return 4; }
+function test5() { return 5; }
`;

      mockedExeca.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0
      } as any);

      await adapter.review(diff, {
        owner: 'owner',
        repo: 'repo',
        number: 123
      });

      expect(fs.rmSync).toHaveBeenCalled();
    });

    it('should clean up temp files on error', async () => {
      const fs = require('fs');
      const diff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,1 +1,10 @@
+function test() { return 1; }
+function test2() { return 2; }
+function test3() { return 3; }
+function test4() { return 4; }
+function test5() { return 5; }
`;

      mockedExeca.mockRejectedValue(new Error('Claude API error'));

      await expect(
        adapter.review(diff, { owner: 'owner', repo: 'repo', number: 123 })
      ).rejects.toThrow();

      expect(fs.rmSync).toHaveBeenCalled();
    });
  });

  describe('isTrivialChange', () => {
    it('should detect whitespace-only changes as trivial', async () => {
      const diff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,1 +1,1 @@
-
+
`;

      const result = await adapter.review(diff, {
        owner: 'owner',
        repo: 'repo',
        number: 123
      });

      expect(result.skipped).toBe(true);
    });

    it('should detect comment-only changes as trivial', async () => {
      const diff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,3 @@
 function test() {
-  // old comment
+  // new comment
   return true;
`;

      const result = await adapter.review(diff, {
        owner: 'owner',
        repo: 'repo',
        number: 123
      });

      expect(result.skipped).toBe(true);
    });
  });
});
