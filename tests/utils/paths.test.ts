import * as path from 'path';
import * as os from 'os';
import { APP_DIR, CONFIG_PATH, SELECTIONS_PATH, CACHE_PATH, STATUS_PATH, CLONES_DIR } from '../../src/utils/paths';

describe('Paths', () => {
  const homeDir = os.homedir();
  const expectedAppDir = path.join(homeDir, '.pr-ai-reviewer');

  it('should have correct APP_DIR', () => {
    expect(APP_DIR).toBe(expectedAppDir);
  });

  it('should have correct CONFIG_PATH', () => {
    expect(CONFIG_PATH).toBe(path.join(expectedAppDir, 'config.json'));
  });

  it('should have correct SELECTIONS_PATH', () => {
    expect(SELECTIONS_PATH).toBe(path.join(expectedAppDir, 'selections.json'));
  });

  it('should have correct CACHE_PATH', () => {
    expect(CACHE_PATH).toBe(path.join(expectedAppDir, 'cache.sqlite'));
  });

  it('should have correct STATUS_PATH', () => {
    expect(STATUS_PATH).toBe(path.join(expectedAppDir, 'status.json'));
  });

  it('should have correct CLONES_DIR', () => {
    expect(CLONES_DIR).toBe(path.join(expectedAppDir, 'clones'));
  });
});
