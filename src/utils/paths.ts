import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

export const APP_DIR = path.join(os.homedir(), '.pr-ai-reviewer');
export const CONFIG_PATH = path.join(APP_DIR, 'config.json');
export const SELECTIONS_PATH = path.join(APP_DIR, 'selections.json');
export const CACHE_PATH = path.join(APP_DIR, 'cache.sqlite');
export const STATUS_PATH = path.join(APP_DIR, 'status.json');
export const CLONES_DIR = path.join(APP_DIR, 'clones');

export function ensureAppDir(): void {
  if (!fs.existsSync(APP_DIR)) {
    fs.mkdirSync(APP_DIR, { recursive: true });
  }
  if (!fs.existsSync(CLONES_DIR)) {
    fs.mkdirSync(CLONES_DIR, { recursive: true });
  }
}
