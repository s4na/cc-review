import { GitHubAdapter } from '../../src/adapters/github';
import execa from 'execa';

// Mock execa
jest.mock('execa');
const mockedExeca = execa as jest.MockedFunction<typeof execa>;

describe('GitHubAdapter', () => {
  let adapter: GitHubAdapter;

  beforeEach(() => {
    adapter = new GitHubAdapter('testuser');
    jest.clearAllMocks();
  });

  describe('listOpenPRs', () => {
    it('should list open PRs successfully', async () => {
      const mockPRs = [
        {
          number: 1,
          headRefName: 'feature-branch',
          updatedAt: '2024-01-01T00:00:00Z',
          author: { login: 'author1' }
        },
        {
          number: 2,
          headRefName: 'fix-branch',
          updatedAt: '2024-01-02T00:00:00Z',
          author: { login: 'author2' }
        }
      ];

      mockedExeca.mockResolvedValue({
        stdout: JSON.stringify(mockPRs),
        stderr: '',
        exitCode: 0
      } as any);

      const result = await adapter.listOpenPRs('owner/repo');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        owner: 'owner',
        repo: 'repo',
        number: 1,
        headRefName: 'feature-branch',
        updatedAt: '2024-01-01T00:00:00Z',
        author: 'author1'
      });
    });

    it('should throw error on failure', async () => {
      mockedExeca.mockRejectedValue(new Error('API error'));

      await expect(adapter.listOpenPRs('owner/repo')).rejects.toThrow('GitHub API error');
    });
  });

  describe('getLatestCommit', () => {
    it('should get latest commit', async () => {
      const mockData = {
        commits: [
          { oid: 'commit1', committedDate: '2024-01-01T00:00:00Z' },
          { oid: 'commit2', committedDate: '2024-01-02T00:00:00Z' }
        ]
      };

      mockedExeca.mockResolvedValue({
        stdout: JSON.stringify(mockData),
        stderr: '',
        exitCode: 0
      } as any);

      const result = await adapter.getLatestCommit('owner/repo', 123);

      expect(result).toEqual({
        sha: 'commit2',
        committedDate: '2024-01-02T00:00:00Z'
      });
    });

    it('should return null for PR without commits', async () => {
      mockedExeca.mockResolvedValue({
        stdout: JSON.stringify({ commits: [] }),
        stderr: '',
        exitCode: 0
      } as any);

      const result = await adapter.getLatestCommit('owner/repo', 123);
      expect(result).toBeNull();
    });
  });

  describe('getDiff', () => {
    it('should get PR diff', async () => {
      const mockDiff = 'diff --git a/file.ts b/file.ts\n+added line';

      mockedExeca.mockResolvedValue({
        stdout: mockDiff,
        stderr: '',
        exitCode: 0
      } as any);

      const result = await adapter.getDiff('owner/repo', 123);
      expect(result).toBe(mockDiff);
    });

    it('should truncate large diffs', async () => {
      // Create a diff larger than 5MB
      const largeDiff = 'a'.repeat(6 * 1024 * 1024);

      mockedExeca.mockResolvedValue({
        stdout: largeDiff,
        stderr: '',
        exitCode: 0
      } as any);

      const result = await adapter.getDiff('owner/repo', 123);

      expect(result.length).toBeLessThan(largeDiff.length);
      expect(result).toContain('DIFF TRUNCATED');
    });
  });

  describe('postComment', () => {
    it('should post comment successfully', async () => {
      mockedExeca.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0
      } as any);

      await expect(
        adapter.postComment('owner/repo', 123, 'Test comment')
      ).resolves.not.toThrow();

      expect(mockedExeca).toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining(['pr', 'comment', '123', '--body', 'Test comment'])
      );
    });
  });

  describe('getRateLimit', () => {
    it('should get rate limit', async () => {
      const mockRateLimit = {
        resources: {
          core: {
            remaining: 4500,
            limit: 5000,
            reset: 1234567890
          }
        }
      };

      mockedExeca.mockResolvedValue({
        stdout: JSON.stringify(mockRateLimit),
        stderr: '',
        exitCode: 0
      } as any);

      const result = await adapter.getRateLimit();

      expect(result).toEqual({
        remaining: 4500,
        limit: 5000,
        reset: 1234567890
      });
    });
  });
});
