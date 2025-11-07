#!/usr/bin/env node

import { Command } from 'commander';
import { Runner } from './runner';
import { ConfigStore } from './store/config';
import { SelectionsStore } from './store/selections';
import { ensureAppDir } from './utils/paths';
import chalk from 'chalk';

const program = new Command();

program
  .name('pr-ai-reviewer')
  .description('AI-powered pull request reviewer for multiple GitHub repositories')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize configuration and cache')
  .action(async () => {
    ensureAppDir();

    const configStore = new ConfigStore();
    const selectionsStore = new SelectionsStore();

    const config = configStore.load();
    const selections = selectionsStore.load();

    console.log(chalk.green('✓ Initialized configuration'));
    console.log(chalk.gray(`  Config: ~/.pr-ai-reviewer/config.json`));
    console.log(chalk.gray(`  Selections: ~/.pr-ai-reviewer/selections.json`));
    console.log(chalk.gray(`  Cache: ~/.pr-ai-reviewer/cache.sqlite`));

    if (!config.githubUsername) {
      console.log(chalk.yellow('\n⚠ Please edit config.json and set your GitHub username'));
    }

    if (selections.repos.length === 0) {
      console.log(chalk.yellow('⚠ No repositories selected. Use "web" command to select repositories'));
    }
  });

program
  .command('auth')
  .description('Check GitHub auth and Claude CLI availability')
  .action(async () => {
    const execaModule = await import('execa');
    const execaFn = execaModule.default;

    console.log('Checking authentication...\n');

    // Check gh auth
    try {
      const { stdout } = await execaFn('gh', ['auth', 'status']);
      console.log(chalk.green('✓ GitHub CLI authenticated'));
      console.log(chalk.gray(stdout));
    } catch (error: any) {
      console.log(chalk.red('✗ GitHub CLI not authenticated'));
      console.log(chalk.yellow('  Run: gh auth login'));
      process.exit(1);
    }

    console.log();

    // Check Claude CLI
    try {
      await execaFn('claude', ['--version']);
      console.log(chalk.green('✓ Claude CLI available'));
    } catch (error) {
      console.log(chalk.red('✗ Claude CLI not found'));
      console.log(chalk.yellow('  Please install Claude CLI'));
      process.exit(1);
    }

    console.log(chalk.green('\n✓ All checks passed'));
  });

program
  .command('run')
  .description('Run the PR review process')
  .option('--from-repos <file>', 'Path to repos.txt file')
  .option('--use-selections', 'Use selections from selections.json')
  .option('--dry-run', 'Show what would be done without actually doing it')
  .action(async (options) => {
    const runner = new Runner();

    try {
      await runner.run({
        fromRepos: options.fromRepos,
        useSelections: options.useSelections,
        dryRun: options.dryRun
      });

      console.log(chalk.green('\n✓ Run completed'));
    } catch (error: any) {
      console.error(chalk.red('\n✗ Run failed:'), error.message);
      process.exit(1);
    } finally {
      runner.close();
    }
  });

program
  .command('list-targets')
  .description('List target PRs without processing')
  .option('--from-repos <file>', 'Path to repos.txt file')
  .option('--use-selections', 'Use selections from selections.json')
  .action(async (options) => {
    const runner = new Runner();

    try {
      await runner.listTargets({
        fromRepos: options.fromRepos,
        useSelections: options.useSelections
      });
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    } finally {
      runner.close();
    }
  });

program
  .command('cache')
  .description('Manage cache')
  .argument('<action>', 'Action to perform (clear)')
  .action(async (action) => {
    if (action === 'clear') {
      const runner = new Runner();
      runner.clearCache();
      runner.close();
      console.log(chalk.green('✓ Cache cleared'));
    } else {
      console.error(chalk.red(`Unknown action: ${action}`));
      process.exit(1);
    }
  });

program
  .command('web')
  .description('Start Web UI server')
  .option('-p, --port <port>', 'Port to listen on', '4567')
  .action(async (options) => {
    console.log(chalk.blue('Starting Web UI server...'));
    console.log(chalk.yellow('⚠ Web UI is not yet implemented'));
    console.log(chalk.gray('\nFor now, please edit the config files directly:'));
    console.log(chalk.gray('  ~/.pr-ai-reviewer/config.json'));
    console.log(chalk.gray('  ~/.pr-ai-reviewer/selections.json'));

    // TODO: Implement Web UI
    // const { startWebServer } = await import('./web/server');
    // await startWebServer(parseInt(options.port));
  });

// Default action when no command is provided
program.action(() => {
  console.log(chalk.blue('PR AI Reviewer\n'));
  console.log('Usage:');
  console.log('  pr-ai-reviewer init              Initialize configuration');
  console.log('  pr-ai-reviewer auth              Check authentication');
  console.log('  pr-ai-reviewer run               Run the review process');
  console.log('  pr-ai-reviewer list-targets      List target PRs');
  console.log('  pr-ai-reviewer cache clear       Clear cache');
  console.log('  pr-ai-reviewer web               Start Web UI');
  console.log('\nFor more information, run: pr-ai-reviewer --help');
});

program.parse();
