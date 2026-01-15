import * as path from 'path';
import * as os from 'os';

export function resolvePath(filePath: string): string {
  if (filePath.startsWith('~')) {
    return path.join(os.homedir(), filePath.slice(1));
  }
  return path.resolve(filePath);
}

export const GLOBAL_SKILL_PATHS = [
  '~/.claude/skills/',
  '~/.copilot/skills/',
  '~/.cursor/skills/',
  '~/.gemini/antigravity/skills/',
  '~/.config/opencode/skill/',
  '~/.codex/skills/',
  '/etc/codex/skills/',
];

export const WORKSPACE_SKILL_PATHS = [
  '.claude/skills/',
  '.github/skills/',
  '.cursor/skills/',
  '.agent/skills/',
  '.opencode/skill/',
  '.codex/skills/',
];
