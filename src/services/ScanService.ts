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
  public async scanForSkills(): Promise<{ 
    discovered: DiscoveredSkill[], 
    imported: Skill[],
    allDiscovered: DiscoveredSkill[] // All discovered including already imported
  }> {
    await this.configService.ensureReady();
    const discovered: DiscoveredSkill[] = [...this.tempDiscovered];
    
    // Get storage path to exclude it from scanning
    const storagePath = this.configService.getSkillsPath();
    const normalizedStoragePath = path.normalize(storagePath);
    
    // 1. Scan Global Paths (excluding our own storage directory)
    for (const pattern of GLOBAL_SKILL_PATHS) {
      const resolvedBase = resolvePath(pattern);
      const normalizedBase = path.normalize(resolvedBase);
      
      // Skip if this is our storage directory
      if (normalizedBase === normalizedStoragePath || 
          normalizedStoragePath.startsWith(normalizedBase + path.sep)) {
        continue;
      }
      
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

    // 2. Scan Workspace Paths (excluding our own storage directory)
    if (vscode.workspace.workspaceFolders) {
      for (const folder of vscode.workspace.workspaceFolders) {
        for (const relativePath of WORKSPACE_SKILL_PATHS) {
          const workspaceBase = path.join(folder.uri.fsPath, relativePath);
          const normalizedWorkspaceBase = path.normalize(workspaceBase);
          
          // Skip if this is our storage directory
          if (normalizedWorkspaceBase === normalizedStoragePath || 
              normalizedStoragePath.startsWith(normalizedWorkspaceBase + path.sep)) {
            continue;
          }
          
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
    
    // Filter out skills that are already imported (same MD5)
    const importedMd5s = new Set(imported.map(s => s.md5));
    const notImported = uniqueDiscovered.filter(s => !importedMd5s.has(s.md5));

    return { 
      discovered: notImported, 
      imported,
      allDiscovered: uniqueDiscovered // Return all discovered for UI display
    };
  }

  /**
   * Get all imported skills from storage.
   * Uses file system as source of truth and cleans up orphaned config entries.
   */
  public async getImportedSkills(): Promise<Skill[]> {
    await this.configService.ensureReady();
    const imported: Skill[] = [];
    const config = this.configService.getConfig();
    const internalSkillsDir = this.configService.getSkillsPath();
    
    console.log(`[ScanService] Loading imported skills from: ${internalSkillsDir}`);
    
    const validSkillIds = new Set<string>();
    let configChanged = false;
    
    if (await fs.pathExists(internalSkillsDir)) {
      const entries = await fs.readdir(internalSkillsDir, { withFileTypes: true });
      console.log(`[ScanService] Found ${entries.filter(e => e.isDirectory()).length} directories`);
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillPath = path.join(internalSkillsDir, entry.name);
          const skillMdPath = path.join(skillPath, 'SKILL.md');
          if (await fs.pathExists(skillMdPath)) {
            try {
              const md5 = await this.fileService.calculateMD5(skillMdPath);
              console.log(`[ScanService] Processing skill: folder=${entry.name}, md5=${md5}`);
              validSkillIds.add(md5);
              
              // Ensure metadata exists in config
              if (!config.skills[md5]) {
                config.skills[md5] = { tags: [] };
                configChanged = true;
              }
              
              const meta = config.skills[md5];
              
              // Read from file for latest data
              const content = await fs.readFile(skillMdPath, 'utf8');
              const fileDescription = this.fileService.extractDescriptionFromSkillMd(content);
              const fileName = this.fileService.extractNameFromSkillMd(content);
              
              // Folder name should be MD5, but fall back to entry.name for backward compatibility
              const displayName = fileName || meta.customName || entry.name;
              
              imported.push({
                id: md5,
                name: displayName,
                path: skillPath,
                description: fileDescription || meta.customDescription,
                tags: meta.tags || [],
                md5: md5,
                source: 'extension',
                isImported: true
              });
              console.log(`[ScanService] Added skill: ${displayName} (${md5})`);
            } catch (err) {
              // Skip invalid skills
              console.error(`Failed to load skill from ${skillPath}:`, err);
            }
          }
        }
      }
    }
    
    console.log(`[ScanService] Total imported skills: ${imported.length}`);
    console.log(`[ScanService] Valid skill IDs: ${Array.from(validSkillIds).join(', ')}`);
    
    // Clean up orphaned config entries (skills in config but not in file system)
    for (const skillId of Object.keys(config.skills)) {
      if (!validSkillIds.has(skillId)) {
        console.warn(`Cleaning up orphaned skill metadata: ${skillId}`);
        delete config.skills[skillId];
        configChanged = true;
      }
    }
    
    // Remove orphaned skill IDs from presets
    const originalPresets = JSON.stringify(config.presets);
    config.presets = (config.presets || []).map(p => ({
      ...p,
      skillIds: (p.skillIds || []).filter(id => validSkillIds.has(id))
    }));
    if (JSON.stringify(config.presets) !== originalPresets) {
      console.log('[ScanService] Cleaned up orphaned skills from presets');
      configChanged = true;
    }
    
    if (configChanged) {
      await this.configService.saveConfig();
    }
    
    return imported;
  }

  /**
   * Scan a custom path recursively for skills.
   */
  public async scanCustomPath(targetPath: string): Promise<{ added: number; total: number }> {
    await this.configService.ensureReady();
    
    // Prevent scanning our own storage directory
    const storagePath = this.configService.getSkillsPath();
    const normalizedStoragePath = path.normalize(storagePath);
    const normalizedTargetPath = path.normalize(targetPath);
    
    if (normalizedTargetPath === normalizedStoragePath || 
        normalizedTargetPath.startsWith(normalizedStoragePath + path.sep) ||
        normalizedStoragePath.startsWith(normalizedTargetPath + path.sep)) {
      throw new Error('Cannot scan the Skills Wizard storage directory itself. Please scan workspace or other external paths.');
    }
    
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
