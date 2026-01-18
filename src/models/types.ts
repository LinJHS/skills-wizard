export interface Skill {
  id: string; // Unique identifier (usually md5 of SKILL.md)
  name: string;
  description?: string;
  tags?: string[];
  md5: string;
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
  tags?: string[];
  customName?: string;
  customDescription?: string;
  source?: string;
  importedAt?: string;
}

export interface DiscoveredSkill {
  id?: string;
  name: string;
  path: string;
  md5: string;
  description?: string;
  isRemote?: boolean; // true if from GitHub
  remoteContent?: string; // For GitHub skills
}
