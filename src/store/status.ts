import * as fs from 'fs';
import { Status, StatusSchema } from '../types';
import { STATUS_PATH, ensureAppDir } from '../utils/paths';

export class StatusStore {
  constructor() {
    ensureAppDir();
  }

  get(): Status {
    if (!fs.existsSync(STATUS_PATH)) {
      return this.getDefault();
    }

    try {
      const raw = fs.readFileSync(STATUS_PATH, 'utf-8');
      const data = JSON.parse(raw);
      return StatusSchema.parse(data);
    } catch (error) {
      return this.getDefault();
    }
  }

  set(status: Status): void {
    const validated = StatusSchema.parse(status);
    fs.writeFileSync(STATUS_PATH, JSON.stringify(validated, null, 2), 'utf-8');
  }

  setIdle(): void {
    this.set({ mode: 'idle' });
  }

  setWaiting(): void {
    this.set({ mode: 'waiting' });
  }

  setError(error: string): void {
    this.set({ mode: 'error', error });
  }

  setRunning(currentTask?: Status['currentTask']): void {
    this.set({
      mode: 'running',
      lastRunStartedAt: new Date().toISOString(),
      currentTask
    });
  }

  private getDefault(): Status {
    return { mode: 'idle' };
  }
}
