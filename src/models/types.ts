export type SkillSource = 'marketplace' | 'github' | 'local';

export interface Skill {
  id: string; // Unique identifier (usually md5 of SKILL.md)
  name: string;
  path: string; // Absolute path where the skill is currently stored (in extension storage or external)
  description?: string;
  tags: string[];
  md5: string;
  source: SkillSource; // 'marketplace' | 'github' | 'local'
  isImported: boolean; // If it's saved in the extension's storage
}

export interface Preset {
  id: string;
  name: string;
  description?: string;
  skillIds: string[];
}

export interface UserConfig {
  skills: Record<string, SkillMetadata>; // Keyed by Skill ID
  presets: Preset[];
  defaultExportPath: string;
}

export interface SkillMetadata {
  tags: string[];
  customName?: string;
  customDescription?: string;
  source?: SkillSource; // 'marketplace' | 'github' | 'local'
}

export interface DiscoveredSkill {
  name: string;
  path: string;
  md5: string;
  description?: string;
  sourceLocation: string; // e.g. "~/.claude/skills/"
  source: SkillSource; // 'marketplace' | 'github' | 'local'
  isRemote?: boolean; // true if from GitHub (deprecated, use source instead)
  remoteUrl?: string; // GitHub API URL for the directory
}
