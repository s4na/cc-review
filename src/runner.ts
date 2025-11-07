import { GitHubAdapter } from './adapters/github';
import { GitAdapter } from './adapters/git';
import { ReviewerAdapter } from './adapters/reviewer';
import { ConfigStore } from './store/config';
import { SelectionsStore } from './store/selections';
import { CacheStore } from './store/cache';
import { StatusStore } from './store/status';
import { CommentFormatter } from './formatters/comment';
import { PRInfo } from './types';

export interface RunnerOptions {
  dryRun?: boolean;
  fromRepos?: string;
  useSelections?: boolean;
}

export class Runner {
  private configStore: ConfigStore;
  private selectionsStore: SelectionsStore;
  private cacheStore: CacheStore;
  private statusStore: StatusStore;
  private githubAdapter: GitHubAdapter;
  private gitAdapter: GitAdapter;
  private reviewerAdapter: ReviewerAdapter;
  private commentFormatter: CommentFormatter;

  constructor() {
    this.configStore = new ConfigStore();
    this.selectionsStore = new SelectionsStore();
    this.cacheStore = new CacheStore();
    this.statusStore = new StatusStore();

    const config = this.configStore.get();
    this.githubAdapter = new GitHubAdapter(config.githubUsername);
    this.gitAdapter = new GitAdapter();
    this.reviewerAdapter = new ReviewerAdapter(config);
    this.commentFormatter = new CommentFormatter(config);
  }

  async run(options: RunnerOptions = {}): Promise<void> {
    const config = this.configStore.reload();
    const runId = this.cacheStore.startRun();

    this.statusStore.setRunning();

    try {
      // Get list of repositories
      const repos = await this.getRepoList(options);

      if (repos.length === 0) {
        console.log('No repositories to process');
        this.statusStore.setIdle();
        return;
      }

      console.log(`Processing ${repos.length} repositories...`);

      // Check rate limit
      const rateLimit = await this.githubAdapter.getRateLimit();
      console.log(`GitHub API rate limit: ${rateLimit.remaining}/${rateLimit.limit}`);

      if (rateLimit.remaining < 100) {
        console.warn('Rate limit too low, skipping this run');
        this.statusStore.setWaiting();
        this.cacheStore.finishRun(runId, 'success');
        return;
      }

      // Process each repository
      let totalPRs = 0;
      let processedPRs = 0;

      for (const repo of repos) {
        const repoPRs = await this.processRepo(repo, options.dryRun || false);
        totalPRs += repoPRs.total;
        processedPRs += repoPRs.processed;
      }

      console.log(`\nSummary: Processed ${processedPRs}/${totalPRs} PRs`);
      this.statusStore.setIdle();
      this.cacheStore.finishRun(runId, 'success');
    } catch (error: any) {
      console.error('Runner error:', error.message);
      this.statusStore.setError(error.message);
      this.cacheStore.finishRun(runId, 'error');
      throw error;
    }
  }

  private async getRepoList(options: RunnerOptions): Promise<string[]> {
    let repos: string[];

    if (options.fromRepos) {
      // Read from file
      const fs = await import('fs');
      const content = fs.readFileSync(options.fromRepos, 'utf-8');
      repos = content
        .split('\n')
        .map(line => line.trim())
        .filter(line => {
          if (line.length === 0 || line.startsWith('#')) {
            return false;
          }
          // Validate repo format: owner/repo
          if (!/^[\w\-\.]+\/[\w\-\.]+$/.test(line)) {
            console.warn(`Invalid repository format: "${line}" (expected: owner/repo)`);
            return false;
          }
          return true;
        });
    } else if (options.useSelections) {
      // Use selections from store
      const selections = this.selectionsStore.reload();
      repos = selections.repos;
    } else {
      // Default: use selections
      const selections = this.selectionsStore.reload();
      repos = selections.repos;
    }

    // Validate all repos
    return repos.filter(repo => {
      if (!/^[\w\-\.]+\/[\w\-\.]+$/.test(repo)) {
        console.warn(`Invalid repository format in selections: "${repo}" (expected: owner/repo)`);
        return false;
      }
      return true;
    });
  }

  private async processRepo(
    ownerRepo: string,
    dryRun: boolean
  ): Promise<{ total: number; processed: number }> {
    console.log(`\n[${ownerRepo}] Fetching open PRs...`);

    let prs: PRInfo[];
    try {
      prs = await this.githubAdapter.listOpenPRs(ownerRepo);
    } catch (error: any) {
      console.error(`[${ownerRepo}] Failed to fetch PRs, skipping repository`);
      return { total: 0, processed: 0 };
    }

    if (prs.length === 0) {
      console.log(`[${ownerRepo}] No open PRs`);
      return { total: 0, processed: 0 };
    }

    console.log(`[${ownerRepo}] Found ${prs.length} open PRs`);

    const config = this.configStore.get();
    const filteredPRs = this.filterPRsByAuthor(prs, config.reviewTargetFilter);

    console.log(`[${ownerRepo}] After filtering: ${filteredPRs.length} PRs`);

    let processed = 0;

    for (let i = 0; i < filteredPRs.length; i++) {
      const pr = filteredPRs[i];

      this.statusStore.setRunning({
        repo: ownerRepo,
        pr: pr.number,
        step: 'diff',
        index: i + 1,
        total: filteredPRs.length
      });

      const shouldProcess = await this.shouldProcessPR(ownerRepo, pr);

      if (!shouldProcess) {
        console.log(`[${ownerRepo}#${pr.number}] Skipping (already reviewed)`);
        continue;
      }

      console.log(`[${ownerRepo}#${pr.number}] Processing...`);

      if (dryRun) {
        console.log(`[${ownerRepo}#${pr.number}] [DRY RUN] Would review this PR`);
        processed++;
        continue;
      }

      try {
        await this.processPR(ownerRepo, pr, i + 1, filteredPRs.length);
        processed++;
      } catch (error: any) {
        console.error(`[${ownerRepo}#${pr.number}] Error:`, error.message);
      }
    }

    return { total: filteredPRs.length, processed };
  }

  private filterPRsByAuthor(prs: PRInfo[], filter: string): PRInfo[] {
    if (filter === 'all') {
      return prs;
    }

    const config = this.configStore.get();
    const myUsername = config.githubUsername;

    if (filter === 'own') {
      return prs.filter(pr => pr.author === myUsername);
    }

    if (filter === 'others') {
      return prs.filter(pr => pr.author !== myUsername);
    }

    return prs;
  }

  private async shouldProcessPR(ownerRepo: string, pr: PRInfo): Promise<boolean> {
    // Get latest commit
    const commit = await this.githubAdapter.getLatestCommit(ownerRepo, pr.number);

    if (!commit) {
      console.log(`[${ownerRepo}#${pr.number}] Cannot get latest commit`);
      return false;
    }

    // Try to acquire lock atomically - this prevents race conditions
    const lockAcquired = this.cacheStore.tryAcquireLock(
      pr.owner,
      pr.repo,
      pr.number,
      commit.sha
    );

    if (!lockAcquired) {
      // Already processed or being processed by another instance
      return false;
    }

    // Double-check with GitHub API if we have commented after the latest commit
    const hasComment = await this.githubAdapter.hasMyCommentAfter(
      ownerRepo,
      pr.number,
      commit.committedDate
    );

    if (hasComment) {
      // Update cache to mark as commented
      this.cacheStore.markCommented(pr.owner, pr.repo, pr.number, commit.sha);
      return false;
    }

    return true;
  }

  private async processPR(
    ownerRepo: string,
    pr: PRInfo,
    index: number,
    total: number
  ): Promise<void> {
    // Get latest commit
    const commit = await this.githubAdapter.getLatestCommit(ownerRepo, pr.number);

    if (!commit) {
      throw new Error('Cannot get latest commit');
    }

    // Get diff
    this.statusStore.setRunning({
      repo: ownerRepo,
      pr: pr.number,
      step: 'diff',
      index,
      total
    });

    const diff = await this.githubAdapter.getDiff(ownerRepo, pr.number);

    // Review
    this.statusStore.setRunning({
      repo: ownerRepo,
      pr: pr.number,
      step: 'reviewing',
      index,
      total
    });

    const result = await this.reviewerAdapter.review(diff, {
      owner: pr.owner,
      repo: pr.repo,
      number: pr.number
    });

    // Format comment
    let comment: string;

    if (result.skipped) {
      comment = this.commentFormatter.formatSkipped(
        pr.number,
        commit.sha,
        result.reason || 'Unknown reason'
      );
    } else {
      comment = this.commentFormatter.format(pr.number, commit.sha, result.content);
    }

    // Post comment
    this.statusStore.setRunning({
      repo: ownerRepo,
      pr: pr.number,
      step: 'commenting',
      index,
      total
    });

    await this.githubAdapter.postComment(ownerRepo, pr.number, comment);

    // Update cache
    this.cacheStore.markCommented(pr.owner, pr.repo, pr.number, commit.sha);

    console.log(`[${ownerRepo}#${pr.number}] ✓ Review posted`);
  }

  async listTargets(options: RunnerOptions = {}): Promise<void> {
    const repos = await this.getRepoList(options);

    console.log(`\nTarget repositories (${repos.length}):\n`);

    for (const repo of repos) {
      const prs = await this.githubAdapter.listOpenPRs(repo);
      console.log(`  ${repo}: ${prs.length} open PRs`);

      for (const pr of prs) {
        const shouldProcess = await this.shouldProcessPR(repo, pr);
        const status = shouldProcess ? '[ ]' : '[✓]';
        console.log(`    ${status} #${pr.number} - ${pr.headRefName} (by ${pr.author})`);
      }
    }

    console.log();
  }

  clearCache(): void {
    this.cacheStore.clear();
    console.log('Cache cleared');
  }

  close(): void {
    this.cacheStore.close();
  }
}
