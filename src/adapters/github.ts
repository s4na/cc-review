import execa from 'execa';
import { PRInfo, CommitInfo } from '../types';

export class GitHubAdapter {
  constructor(private username: string) {}

  async listOpenPRs(ownerRepo: string): Promise<PRInfo[]> {
    try {
      const { stdout } = await execa('gh', [
        'pr',
        'list',
        '--repo',
        ownerRepo,
        '--state',
        'open',
        '--json',
        'number,headRefName,updatedAt,author',
        '--limit',
        '100'
      ]);

      const prs = JSON.parse(stdout);
      const [owner, repo] = ownerRepo.split('/');

      return prs.map((pr: any) => ({
        owner,
        repo,
        number: pr.number,
        headRefName: pr.headRefName,
        updatedAt: pr.updatedAt,
        author: pr.author?.login || ''
      }));
    } catch (error: any) {
      console.error(`Failed to list PRs for ${ownerRepo}:`, error.message);
      throw new Error(`GitHub API error for ${ownerRepo}: ${error.message}`);
    }
  }

  async getLatestCommit(ownerRepo: string, prNumber: number): Promise<CommitInfo | null> {
    try {
      const { stdout } = await execa('gh', [
        'pr',
        'view',
        prNumber.toString(),
        '--repo',
        ownerRepo,
        '--json',
        'commits'
      ]);

      const data = JSON.parse(stdout);
      if (!data.commits || data.commits.length === 0) {
        return null;
      }

      const lastCommit = data.commits[data.commits.length - 1];
      return {
        sha: lastCommit.oid,
        committedDate: lastCommit.committedDate
      };
    } catch (error: any) {
      console.error(`Failed to get latest commit for ${ownerRepo}#${prNumber}:`, error.message);
      return null;
    }
  }

  async hasMyCommentAfter(
    ownerRepo: string,
    prNumber: number,
    afterDate: string
  ): Promise<boolean> {
    const [owner, repo] = ownerRepo.split('/');

    try {
      // Check issue comments
      const issueComments = await this.getIssueComments(owner, repo, prNumber);
      const hasIssueComment = this.checkCommentsAfterDate(issueComments, afterDate);
      if (hasIssueComment) return true;

      // Check review comments
      const reviewComments = await this.getReviewComments(owner, repo, prNumber);
      const hasReviewComment = this.checkCommentsAfterDate(reviewComments, afterDate);
      if (hasReviewComment) return true;

      return false;
    } catch (error: any) {
      console.error(`Failed to check comments for ${ownerRepo}#${prNumber}:`, error.message);
      return false;
    }
  }

  private async getIssueComments(owner: string, repo: string, prNumber: number): Promise<any[]> {
    try {
      const { stdout } = await execa('gh', [
        'api',
        `repos/${owner}/${repo}/issues/${prNumber}/comments`,
        '--paginate'
      ]);

      return JSON.parse(stdout);
    } catch (error) {
      return [];
    }
  }

  private async getReviewComments(owner: string, repo: string, prNumber: number): Promise<any[]> {
    try {
      const { stdout } = await execa('gh', [
        'api',
        `repos/${owner}/${repo}/pulls/${prNumber}/comments`,
        '--paginate'
      ]);

      return JSON.parse(stdout);
    } catch (error) {
      return [];
    }
  }

  private checkCommentsAfterDate(comments: any[], afterDate: string): boolean {
    const afterTime = new Date(afterDate).getTime();

    for (const comment of comments) {
      if (comment.user?.login !== this.username) continue;

      const createdAt = new Date(comment.created_at).getTime();
      const updatedAt = new Date(comment.updated_at).getTime();

      if (createdAt >= afterTime || updatedAt >= afterTime) {
        return true;
      }
    }

    return false;
  }

  async postComment(ownerRepo: string, prNumber: number, body: string): Promise<void> {
    try {
      await execa('gh', [
        'pr',
        'comment',
        prNumber.toString(),
        '--repo',
        ownerRepo,
        '--body',
        body
      ]);

      console.log(`Posted comment to ${ownerRepo}#${prNumber}`);
    } catch (error: any) {
      console.error(`Failed to post comment to ${ownerRepo}#${prNumber}:`, error.message);
      throw error;
    }
  }

  async getDiff(ownerRepo: string, prNumber: number): Promise<string> {
    // Maximum diff size: 5MB to prevent OOM and respect Claude token limits
    const MAX_DIFF_SIZE = 5 * 1024 * 1024;

    try {
      const { stdout } = await execa('gh', [
        'pr',
        'diff',
        prNumber.toString(),
        '--repo',
        ownerRepo
      ]);

      // Check diff size
      if (stdout.length > MAX_DIFF_SIZE) {
        const sizeMB = (stdout.length / (1024 * 1024)).toFixed(2);
        console.warn(`[${ownerRepo}#${prNumber}] Diff size (${sizeMB}MB) exceeds limit, truncating...`);

        // Truncate with a note
        const truncated = stdout.substring(0, MAX_DIFF_SIZE);
        const note = `\n\n... [DIFF TRUNCATED: Original size ${sizeMB}MB exceeded ${MAX_DIFF_SIZE / (1024 * 1024)}MB limit] ...`;
        return truncated + note;
      }

      return stdout;
    } catch (error: any) {
      console.error(`Failed to get diff for ${ownerRepo}#${prNumber}:`, error.message);
      throw error;
    }
  }

  async getRateLimit(): Promise<{ remaining: number; limit: number; reset: number }> {
    try {
      const { stdout } = await execa('gh', ['api', 'rate_limit']);
      const data = JSON.parse(stdout);
      const core = data.resources.core;

      return {
        remaining: core.remaining,
        limit: core.limit,
        reset: core.reset
      };
    } catch (error: any) {
      console.error('Failed to get rate limit:', error.message);
      return { remaining: 0, limit: 5000, reset: Date.now() / 1000 + 3600 };
    }
  }

  async getCurrentUser(): Promise<{ login: string; id: number }> {
    try {
      const { stdout } = await execa('gh', ['api', 'user']);
      const data = JSON.parse(stdout);

      return {
        login: data.login,
        id: data.id
      };
    } catch (error: any) {
      console.error('Failed to get current user:', error.message);
      throw error;
    }
  }
}
