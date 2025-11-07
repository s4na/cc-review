import { ConfigSchema, SelectionsSchema, StatusSchema } from '../src/types';

describe('Type Schemas', () => {
  describe('ConfigSchema', () => {
    it('should validate a valid config', () => {
      const validConfig = {
        githubUsername: 'test-user',
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

      const result = ConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it('should apply default values', () => {
      const minimalConfig = {
        githubUsername: 'test-user'
      };

      const result = ConfigSchema.parse(minimalConfig);
      expect(result.githubTokenEnv).toBe('GITHUB_TOKEN');
      expect(result.maxConcurrent).toBe(4);
      expect(result.reviewTargetFilter).toBe('all');
    });

    it('should enforce patrol interval constraints', () => {
      const invalidConfig = {
        githubUsername: 'test-user',
        patrolIntervalMinutes: 3 // Too low
      };

      const result = ConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });
  });

  describe('SelectionsSchema', () => {
    it('should validate a valid selections object', () => {
      const validSelections = {
        mode: 'list' as const,
        orgs: ['org1'],
        users: ['user1'],
        repos: ['owner/repo1', 'owner/repo2']
      };

      const result = SelectionsSchema.safeParse(validSelections);
      expect(result.success).toBe(true);
    });

    it('should apply default values for arrays', () => {
      const minimalSelections = {
        mode: 'org' as const
      };

      const result = SelectionsSchema.parse(minimalSelections);
      expect(result.orgs).toEqual([]);
      expect(result.users).toEqual([]);
      expect(result.repos).toEqual([]);
    });
  });

  describe('StatusSchema', () => {
    it('should validate idle status', () => {
      const status = {
        mode: 'idle' as const
      };

      const result = StatusSchema.safeParse(status);
      expect(result.success).toBe(true);
    });

    it('should validate running status with task', () => {
      const status = {
        mode: 'running' as const,
        lastRunStartedAt: new Date().toISOString(),
        currentTask: {
          repo: 'owner/repo',
          pr: 123,
          step: 'reviewing' as const,
          index: 1,
          total: 10
        }
      };

      const result = StatusSchema.safeParse(status);
      expect(result.success).toBe(true);
    });

    it('should validate error status', () => {
      const status = {
        mode: 'error' as const,
        error: 'Something went wrong'
      };

      const result = StatusSchema.safeParse(status);
      expect(result.success).toBe(true);
    });
  });
});
