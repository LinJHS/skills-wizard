import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';
import { DiscoveredSkill, Skill, SkillMetadata } from '../models/types';
import { GLOBAL_SKILL_PATHS, WORKSPACE_SKILL_PATHS, resolvePath } from '../utils/paths';
import { FileService } from './FileService';
import { ConfigService } from './ConfigService';

/**
 * ScanService
 * Responsible for scanning skills from various sources: global paths, workspace paths, and custom paths.
 */
export class ScanService {
  private fileService: FileService;
  private configService: ConfigService;
  
  // Temporary storage for discovered skills that aren't persisted yet (like custom paths or github)
  private tempDiscovered: DiscoveredSkill[] = [];

  constructor(fileService: FileService, configService: ConfigService) {
    this.fileService = fileService;
    this.configService = configService;
  }

  /**
   * Scan for skills from global and workspace paths, and return both discovered and imported skills.
   */
  public async scanForSkills(): Promise<{ discovered: DiscoveredSkill[], imported: Skill[] }> {
    await this.configService.ensureReady();
    const discovered: DiscoveredSkill[] = [...this.tempDiscovered];
    
    // 1. Scan Global Paths
    for (const pattern of GLOBAL_SKILL_PATHS) {
      const resolvedBase = resolvePath(pattern);
      if (await fs.pathExists(resolvedBase)) {
        try {
          const entries = await fs.readdir(resolvedBase, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              const skillPath = path.join(resolvedBase, entry.name);
              const skillMdPath = path.join(skillPath, 'SKILL.md');
              if (await fs.pathExists(skillMdPath)) {
                const md5 = await this.fileService.calculateMD5(skillMdPath);
                const description = await this.fileService.readSkillDescriptionFromFile(skillMdPath);
                discovered.push({
                  name: entry.name,
                  path: skillPath,
                  md5: md5,
                  description,
                  sourceLocation: resolvedBase
                });
              }
            }
          }
        } catch (err) {
          // Ignore access errors
        }
      }
    }

    // 2. Scan Workspace Paths
    if (vscode.workspace.workspaceFolders) {
      for (const folder of vscode.workspace.workspaceFolders) {
        for (const relativePath of WORKSPACE_SKILL_PATHS) {
          const workspaceBase = path.join(folder.uri.fsPath, relativePath);
          if (await fs.pathExists(workspaceBase)) {
            try {
              const entries = await fs.readdir(workspaceBase, { withFileTypes: true });
              for (const entry of entries) {
                if (entry.isDirectory()) {
                  const skillPath = path.join(workspaceBase, entry.name);
                  const skillMdPath = path.join(skillPath, 'SKILL.md');
                  if (await fs.pathExists(skillMdPath)) {
                    const md5 = await this.fileService.calculateMD5(skillMdPath);
                    const description = await this.fileService.readSkillDescriptionFromFile(skillMdPath);
                    discovered.push({
                      name: entry.name,
                      path: skillPath,
                      md5: md5,
                      description,
                      sourceLocation: workspaceBase
                    });
                  }
                }
              }
            } catch (err) {
              // Ignore
            }
          }
        }
      }
    }

    // 3. Get Imported Skills
    const imported = await this.getImportedSkills();
    
    // Deduplicate discovered: if same MD5 exists in discovered, keep one
    const uniqueDiscovered = Array.from(new Map(discovered.map(item => [item.md5, item])).values());

    return { discovered: uniqueDiscovered, imported };
  }

  /**
   * Get all imported skills from storage.
   */
  public async getImportedSkills(): Promise<Skill[]> {
    await this.configService.ensureReady();
    const imported: Skill[] = [];
    const config = this.configService.getConfig();
    const internalSkillsDir = this.configService.getSkillsPath();
    
    if (await fs.pathExists(internalSkillsDir)) {
      const entries = await fs.readdir(internalSkillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillPath = path.join(internalSkillsDir, entry.name);
          const skillMdPath = path.join(skillPath, 'SKILL.md');
          if (await fs.pathExists(skillMdPath)) {
            const md5 = await this.fileService.calculateMD5(skillMdPath);
            const meta = config.skills[md5] || {};
            
            // Read from file for latest data
            const content = await fs.readFile(skillMdPath, 'utf8');
            const fileDescription = this.fileService.extractDescriptionFromSkillMd(content);
            const fileName = this.fileService.extractNameFromSkillMd(content);
            
            imported.push({
              id: md5,
              name: fileName || meta.customName || entry.name,
              path: skillPath,
              description: fileDescription || meta.customDescription,
              tags: meta.tags || [],
              md5: md5,
              source: 'extension',
              isImported: true
            });
          }
        }
      }
    }
    
    return imported;
  }

  /**
   * Scan a custom path recursively for skills.
   */
  public async scanCustomPath(targetPath: string): Promise<{ added: number; total: number }> {
    await this.configService.ensureReady();
    const skillPaths = await this.fileService.scanRecursively(targetPath);
    const found: DiscoveredSkill[] = [];
    
    for (const skillPath of skillPaths) {
      const skillMdPath = path.join(skillPath, 'SKILL.md');
      const md5 = await this.fileService.calculateMD5(skillMdPath);
      const description = await this.fileService.readSkillDescriptionFromFile(skillMdPath);
      found.push({
        name: path.basename(skillPath),
        path: skillPath,
        md5: md5,
        description,
        sourceLocation: path.dirname(skillPath)
      });
    }
    
    let added = 0;
    for (const skill of found) {
      if (!this.tempDiscovered.some(s => s.md5 === skill.md5)) {
        this.tempDiscovered.push(skill);
        added += 1;
      }
    }
    return { added, total: found.length };
  }

  /**
   * Add skills to temporary discovered list (used by GitHub scanner).
   */
  public addToTempDiscovered(skills: DiscoveredSkill[]): number {
    let added = 0;
    for (const skill of skills) {
      if (!this.tempDiscovered.some(s => s.md5 === skill.md5)) {
        this.tempDiscovered.push(skill);
        added += 1;
      }
    }
    return added;
  }

  /**
   * Clear temporary discovered skills.
   */
  public clearTempDiscovered(): void {
    this.tempDiscovered = [];
  }

  /**
   * Get a skill by its ID.
   */
  public async getSkillById(skillId: string): Promise<Skill | undefined> {
    const imported = await this.getImportedSkills();
    return imported.find(s => s.id === skillId);
  }

  /**
   * Get the file path of a skill's SKILL.md.
   */
  public async getSkillFilePath(skillId: string): Promise<string | undefined> {
    const skill = await this.getSkillById(skillId);
    if (!skill) {
      return undefined;
    }
    const skillMd = path.join(skill.path, 'SKILL.md');
    if (await fs.pathExists(skillMd)) {
      return skillMd;
    }
    return undefined;
  }

  /**
   * Update skill metadata in config.
   */
  public async updateSkillMetadata(skillId: string, metadata: Partial<SkillMetadata>): Promise<void> {
    await this.configService.ensureReady();
    
    if (metadata.customName !== undefined) {
      const trimmed = String(metadata.customName).trim();
      if (!trimmed) {
        throw new Error('Skill name cannot be empty');
      }
      const imported = await this.getImportedSkills();
      const desired = this.fileService.normalizeName(trimmed);
      const conflict = imported.find(s => s.id !== skillId && this.fileService.normalizeName(s.name) === desired);
      if (conflict) {
        throw new Error(`Skill name "${trimmed}" already exists`);
      }
      metadata.customName = trimmed;
    }
    
    const config = this.configService.getConfig();
    if (!config.skills[skillId]) {
      config.skills[skillId] = { tags: [] };
    }
    config.skills[skillId] = { ...config.skills[skillId], ...metadata };
    await this.configService.saveConfig();
  }

  /**
   * Delete a skill from storage.
   */
  public async deleteSkill(skillId: string): Promise<void> {
    await this.configService.ensureReady();
    const skill = await this.getSkillById(skillId);
    if (skill) {
      await fs.remove(skill.path);
      const config = this.configService.getConfig();
      delete config.skills[skillId];
      // Also remove from presets
      config.presets = (config.presets || []).map(p => ({
        ...p,
        skillIds: (p.skillIds || []).filter(id => id !== skillId)
      }));
      await this.configService.saveConfig();
    }
  }
}
