import { CommentFormatter } from '../../src/formatters/comment';
import { Config } from '../../src/types';

describe('CommentFormatter', () => {
  const mockConfig: Config = {
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

  let formatter: CommentFormatter;

  beforeEach(() => {
    formatter = new CommentFormatter(mockConfig);
  });

  describe('format', () => {
    it('should format a review comment', () => {
      const result = formatter.format(123, 'abc1234567890', 'This is a review');

      expect(result).toContain('[AI Review Bot]');
      expect(result).toContain('#123');
      expect(result).toContain('abc1234');
      expect(result).toContain('This is a review');
    });

    it('should include all required sections', () => {
      const result = formatter.format(123, 'abc1234567890', 'Review content');

      expect(result).toContain('レビュー結果');
      expect(result).toContain('このコメントについて');
      expect(result).toContain('自動投稿');
    });
  });

  describe('formatError', () => {
    it('should format an error comment', () => {
      const result = formatter.formatError(123, 'abc1234567890', 'Error message');

      expect(result).toContain('[AI Review Bot]');
      expect(result).toContain('レビューエラー');
      expect(result).toContain('#123');
      expect(result).toContain('Error message');
    });
  });

  describe('formatSkipped', () => {
    it('should format a skipped comment', () => {
      const result = formatter.formatSkipped(123, 'abc1234567890', 'Trivial change');

      expect(result).toContain('[AI Review Bot]');
      expect(result).toContain('レビュースキップ');
      expect(result).toContain('#123');
      expect(result).toContain('Trivial change');
    });
  });
});
