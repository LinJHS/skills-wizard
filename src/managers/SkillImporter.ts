/**
 * Skill Importer - Handles importing skills
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import { DiscoveredSkill, Skill, SkillMetadata } from '../models/types';
import { StorageManager } from './StorageManager';

export class SkillImporter {
  constructor(private storage: StorageManager) {}

  /**
   * Import a discovered skill
   */
  async importSkill(discoveredSkill: DiscoveredSkill): Promise<string> {
    const skillId = discoveredSkill.id || discoveredSkill.md5;
    const skillDir = this.storage.getSkillPath(skillId);
    
    await this.storage.ensureSkillsDir();
    await fs.ensureDir(skillDir);

    // Copy or download skill files
    if (discoveredSkill.isRemote && discoveredSkill.remoteContent) {
      // Remote skill from GitHub
      await fs.writeFile(path.join(skillDir, 'SKILL.md'), discoveredSkill.remoteContent, 'utf-8');
    } else if (discoveredSkill.path) {
      // Local skill
      await fs.copy(discoveredSkill.path, skillDir, { overwrite: true });
    } else {
      throw new Error('Invalid discovered skill: no path or remote content');
    }

    // Add to config
    const config = this.storage.getConfig();
    const metadata: SkillMetadata = {
      tags: [],
      source: discoveredSkill.isRemote ? 'github' : 'local',
      importedAt: new Date().toISOString()
    };
    
    config.skills[skillId] = metadata;
    await this.storage.saveConfig(config);

    return skillId;
  }

  /**
   * Get skill data by ID
   */
  async getSkillData(skillId: string): Promise<Skill | null> {
    const skillDir = this.storage.getSkillPath(skillId);
    const skillMdPath = path.join(skillDir, 'SKILL.md');

    if (!(await fs.pathExists(skillMdPath))) {
      return null;
    }

    const content = await fs.readFile(skillMdPath, 'utf-8');
    const md5 = crypto.createHash('md5').update(content).digest('hex');
    const name = path.basename(skillDir);

    // Parse description from SKILL.md
    const lines = content.split('\n');
    let description = '';
    for (const line of lines) {
      if (line.trim() && !line.startsWith('#')) {
        description = line.trim();
        break;
      }
    }

    const config = this.storage.getConfig();
    const metadata = config.skills[skillId] || {};

    return {
      id: skillId,
      name: metadata.customName || name,
      description: metadata.customDescription || description,
      md5,
      tags: metadata.tags
    };
  }

  /**
   * Get all imported skills
   */
  async getAllSkills(): Promise<Skill[]> {
    const config = this.storage.getConfig();
    const skillIds = Object.keys(config.skills);
    const skills: Skill[] = [];

    for (const id of skillIds) {
      const skill = await this.getSkillData(id);
      if (skill) {
        skills.push(skill);
      }
    }

    return skills;
  }

  /**
   * Delete a skill
   */
  async deleteSkill(skillId: string): Promise<void> {
    const skillDir = this.storage.getSkillPath(skillId);
    
    if (await fs.pathExists(skillDir)) {
      await fs.remove(skillDir);
    }

    const config = this.storage.getConfig();
    delete config.skills[skillId];
    await this.storage.saveConfig(config);
  }

  /**
   * Update skill metadata
   */
  async updateMetadata(skillId: string, updates: Partial<SkillMetadata>): Promise<void> {
    const config = this.storage.getConfig();
    
    if (!config.skills[skillId]) {
      throw new Error(`Skill ${skillId} not found`);
    }

    config.skills[skillId] = {
      ...config.skills[skillId],
      ...updates
    };

    await this.storage.saveConfig(config);
  }
}
