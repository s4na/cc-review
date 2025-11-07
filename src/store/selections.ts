import * as fs from 'fs';
import { Selections, SelectionsSchema } from '../types';
import { SELECTIONS_PATH, ensureAppDir } from '../utils/paths';

export class SelectionsStore {
  private selections: Selections | null = null;

  constructor() {
    ensureAppDir();
  }

  load(): Selections {
    if (!fs.existsSync(SELECTIONS_PATH)) {
      return this.createDefault();
    }

    try {
      const raw = fs.readFileSync(SELECTIONS_PATH, 'utf-8');
      const data = JSON.parse(raw);
      this.selections = SelectionsSchema.parse(data);
      return this.selections;
    } catch (error) {
      console.error('Failed to parse selections, using defaults:', error);
      return this.createDefault();
    }
  }

  save(selections: Selections): void {
    const validated = SelectionsSchema.parse(selections);
    fs.writeFileSync(SELECTIONS_PATH, JSON.stringify(validated, null, 2), 'utf-8');
    this.selections = validated;
  }

  get(): Selections {
    if (!this.selections) {
      return this.load();
    }
    return this.selections;
  }

  reload(): Selections {
    return this.load();
  }

  private createDefault(): Selections {
    const defaultSelections: Selections = {
      mode: 'list',
      orgs: [],
      users: [],
      repos: []
    };

    this.save(defaultSelections);
    return defaultSelections;
  }

  getRepoList(): string[] {
    const sel = this.get();
    return sel.repos;
  }
}
