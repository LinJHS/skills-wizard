/**
 * Storage Manager - Handles persistent storage operations
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import { UserConfig } from '../models/types';

export class StorageManager {
  private configPath: string;
  private config: UserConfig;

  constructor(private storagePath: string) {
    this.configPath = path.join(storagePath, 'config.json');
    this.config = { skills: {}, presets: [], defaultExportPath: '' };
  }

  async init(): Promise<void> {
    await fs.ensureDir(this.storagePath);
    if (await fs.pathExists(this.configPath)) {
      try {
        const raw = await fs.readFile(this.configPath, 'utf-8');
        this.config = JSON.parse(raw);
        this.config.skills = this.config.skills || {};
        this.config.presets = this.config.presets || [];
      } catch (e) {
        console.error('Failed to read config', e);
      }
    }
  }

  getConfig(): UserConfig {
    return this.config;
  }

  async saveConfig(config: UserConfig): Promise<void> {
    this.config = config;
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  getSkillsPath(): string {
    return path.join(this.storagePath, 'skills');
  }

  getSkillPath(skillId: string): string {
    return path.join(this.getSkillsPath(), skillId);
  }

  async ensureSkillsDir(): Promise<void> {
    await fs.ensureDir(this.getSkillsPath());
  }
}
