import execa from 'execa';
import * as path from 'path';
import * as fs from 'fs';
import { CLONES_DIR } from '../utils/paths';

export class GitAdapter {
  getRepoPath(owner: string, repo: string): string {
    const repoName = `${owner}__${repo}`;
    return path.join(CLONES_DIR, repoName);
  }

  async ensureClone(ownerRepo: string): Promise<string> {
    const [owner, repo] = ownerRepo.split('/');
    const repoPath = this.getRepoPath(owner, repo);

    if (fs.existsSync(repoPath)) {
      // Already cloned, just fetch
      await this.fetch(repoPath);
      return repoPath;
    }

    // Clone the repository
    await this.clone(ownerRepo, repoPath);
    return repoPath;
  }

  private async clone(ownerRepo: string, targetPath: string): Promise<void> {
    try {
      const repoUrl = `https://github.com/${ownerRepo}.git`;

      await execa('git', [
        'clone',
        '--depth',
        '1',
        '--no-single-branch',
        repoUrl,
        targetPath
      ]);

      console.log(`Cloned ${ownerRepo} to ${targetPath}`);
    } catch (error: any) {
      console.error(`Failed to clone ${ownerRepo}:`, error.message);
      throw error;
    }
  }

  private async fetch(repoPath: string): Promise<void> {
    try {
      await execa('git', ['fetch', '--all', '--prune'], { cwd: repoPath });
    } catch (error: any) {
      console.error(`Failed to fetch in ${repoPath}:`, error.message);
      // Don't throw, fetch failure is not critical
    }
  }

  async getDiff(repoPath: string, base: string, head: string): Promise<string> {
    try {
      const { stdout } = await execa(
        'git',
        ['diff', `origin/${base}...origin/${head}`],
        { cwd: repoPath }
      );

      return stdout;
    } catch (error: any) {
      console.error(`Failed to get diff in ${repoPath}:`, error.message);
      throw error;
    }
  }

  async getCommitSha(repoPath: string, ref: string): Promise<string | null> {
    try {
      const { stdout } = await execa(
        'git',
        ['rev-parse', `origin/${ref}`],
        { cwd: repoPath }
      );

      return stdout.trim();
    } catch (error: any) {
      console.error(`Failed to get commit SHA for ${ref} in ${repoPath}:`, error.message);
      return null;
    }
  }
}
