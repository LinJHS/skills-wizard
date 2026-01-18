import * as path from 'path';
import * as os from 'os';

export function resolvePath(filePath: string): string {
  if (filePath.startsWith('~')) {
    const home = os.homedir();
    // Handle both / and \ separators after ~
    const relativePath = filePath.slice(1).replace(/^[\\\/]/, '');
    return path.join(home, relativePath);
  }
  return path.resolve(filePath);
}

export function getDefaultSkillsWizardStoragePath(): string {
  const home = os.homedir();

  if (process.platform === 'win32') {
    const appData =
      process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming');
    return path.join(appData, 'skills-wizard');
  }

  const xdgConfigHome = process.env.XDG_CONFIG_HOME;
  const base = xdgConfigHome && xdgConfigHome.trim().length > 0
    ? xdgConfigHome
    : path.join(home, '.config');
  return path.join(base, 'skills-wizard');
}

export const GLOBAL_SKILL_PATHS = [
  '~/.claude/skills/',
  '~/.copilot/skills/',
  '~/.cursor/skills/',
  '~/.gemini/antigravity/skills/',
  '~/.config/opencode/skill/',
  '~/.codex/skills/',
  '/etc/codex/skills/',
  // Windows specific paths
  '~/AppData/Roaming/OpenCode/skill/',
  '~/AppData/Roaming/alacritty/', // Example of standard location usage, though doubtful for skills
];

export const WORKSPACE_SKILL_PATHS = [
  '.claude/skills/',
  '.github/skills/',
  '.cursor/skills/',
  '.agent/skills/',
  '.opencode/skill/',
  '.codex/skills/',
];

// Common repo layouts for GitHub import (in addition to WORKSPACE_SKILL_PATHS).
// e.g. https://github.com/obra/superpowers stores skills under /skills/<skill-name>/SKILL.md
export const GITHUB_EXTRA_SKILL_PATHS = [
  'skills/',
  'skill/',
];
