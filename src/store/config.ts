import * as fs from 'fs';
import { Config, ConfigSchema } from '../types';
import { CONFIG_PATH, ensureAppDir } from '../utils/paths';

export class ConfigStore {
  private config: Config | null = null;

  constructor() {
    ensureAppDir();
  }

  load(): Config {
    if (!fs.existsSync(CONFIG_PATH)) {
      return this.createDefault();
    }

    try {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const data = JSON.parse(raw);
      this.config = ConfigSchema.parse(data);
      return this.config;
    } catch (error) {
      console.error('Failed to parse config, using defaults:', error);
      return this.createDefault();
    }
  }

  save(config: Config): void {
    const validated = ConfigSchema.parse(config);
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(validated, null, 2), 'utf-8');
    this.config = validated;
  }

  get(): Config {
    if (!this.config) {
      return this.load();
    }
    return this.config;
  }

  reload(): Config {
    return this.load();
  }

  private createDefault(): Config {
    const defaultConfig: Config = {
      githubUsername: process.env.GITHUB_USERNAME || '',
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

    this.save(defaultConfig);
    return defaultConfig;
  }
}
