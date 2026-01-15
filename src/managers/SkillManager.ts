import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import { resolvePath, GLOBAL_SKILL_PATHS, WORKSPACE_SKILL_PATHS } from '../utils/paths';
import { Skill, Preset, UserConfig, DiscoveredSkill, SkillMetadata } from '../models/types';

export class SkillManager {
  private context: vscode.ExtensionContext;
  private storagePath: string;
  private configPath: string;
  private config: UserConfig;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.storagePath = context.globalStorageUri.fsPath;
    this.configPath = path.join(this.storagePath, 'config.json');
    this.config = { skills: {}, presets: [], defaultExportPath: '' }; // defaultExportPath unused here now
    this.init();
  }

  private async init() {
    await fs.ensureDir(this.storagePath);
    await fs.ensureDir(path.join(this.storagePath, 'skills'));
    await this.loadConfig();
  }

  private async loadConfig() {
    if (await fs.pathExists(this.configPath)) {
      try {
        const stored = await fs.readJSON(this.configPath);
        this.config = { ...this.config, ...stored };
      } catch (e) {
        console.error('Failed to load config', e);
      }
    }
  }

  private async saveConfig() {
    await fs.writeJSON(this.configPath, this.config, { spaces: 2 });
  }

  public async calculateMD5(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath);
    const hash = crypto.createHash('md5');
    hash.update(buffer);
    return hash.digest('hex');
  }

  public async scanForSkills(): Promise<{ discovered: DiscoveredSkill[], imported: Skill[] }> {
    const discovered: DiscoveredSkill[] = [];
    
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
                        const md5 = await this.calculateMD5(skillMdPath);
                        discovered.push({
                            name: entry.name,
                            path: skillPath,
                            md5: md5,
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
                               const md5 = await this.calculateMD5(skillMdPath);
                               discovered.push({
                                   name: entry.name,
                                   path: skillPath,
                                   md5: md5,
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
    const imported: Skill[] = [];
    const internalSkillsDir = path.join(this.storagePath, 'skills');
    if (await fs.pathExists(internalSkillsDir)) {
        const entries = await fs.readdir(internalSkillsDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const skillPath = path.join(internalSkillsDir, entry.name);
                const skillMdPath = path.join(skillPath, 'SKILL.md');
                if (await fs.pathExists(skillMdPath)) {
                     const md5 = await this.calculateMD5(skillMdPath);
                     const meta = this.config.skills[md5] || {};
                     imported.push({
                         id: md5,
                         name: entry.name,
                         path: skillPath,
                         description: meta.customDescription,
                         tags: meta.tags || [],
                         md5: md5,
                         source: 'extension',
                         isImported: true
                     });
                }
            }
        }
    }

    return { discovered, imported };
  }

  public async importSkill(skill: DiscoveredSkill): Promise<void> {
    const targetDir = path.join(this.storagePath, 'skills', skill.name);
    await fs.copy(skill.path, targetDir, { overwrite: true });
    
    if (!this.config.skills[skill.md5]) {
        this.config.skills[skill.md5] = { tags: [] };
        await this.saveConfig();
    }
  }

  public async deleteSkill(skillId: string): Promise<void> {
      const { imported } = await this.scanForSkills();
      const skill = imported.find(s => s.id === skillId);
      if (skill) {
          await fs.remove(skill.path);
          delete this.config.skills[skillId];
          await this.saveConfig();
      }
  }

  public async updateSkillMetadata(skillId: string, metadata: Partial<SkillMetadata>) {
      if (!this.config.skills[skillId]) {
          this.config.skills[skillId] = { tags: [] };
      }
      this.config.skills[skillId] = { ...this.config.skills[skillId], ...metadata };
      await this.saveConfig();
  }
  
  public getPresets(): Preset[] {
      return this.config.presets || [];
  }

  public async savePreset(preset: Preset) {
      const index = this.config.presets.findIndex(p => p.id === preset.id);
      if (index >= 0) {
          this.config.presets[index] = preset;
      } else {
          this.config.presets.push(preset);
      }
      await this.saveConfig();
  }

  public async deletePreset(presetId: string) {
      this.config.presets = this.config.presets.filter(p => p.id !== presetId);
      await this.saveConfig();
  }

  private getDefaultExportPath(): string {
      return vscode.workspace.getConfiguration('skillsWizard').get('defaultExportPath') || '.claude/skills/';
  }

  public async exportSkillToWorkspace(skillId: string, merge: boolean = true) {
      const { imported } = await this.scanForSkills();
      const skill = imported.find(s => s.id === skillId);
      if (!skill) return;

      if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
          throw new Error("No workspace open");
      }
      const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
      const relativeTarget = this.getDefaultExportPath();
      const targetDir = path.join(rootPath, relativeTarget, skill.name);
      
      await fs.ensureDir(path.dirname(targetDir));
      await fs.copy(skill.path, targetDir, { overwrite: true });
  }
  
  public async applyPreset(presetId: string, mode: 'merge' | 'replace') {
       const preset = this.config.presets.find(p => p.id === presetId);
      if (!preset) return;
      
      const { imported } = await this.scanForSkills();
      const skillsToApply = imported.filter(s => preset.skillIds.includes(s.id));
      
      if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
          throw new Error("No workspace open");
      }
      const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
      const relativeTarget = this.getDefaultExportPath();
      const targetBase = path.join(rootPath, relativeTarget);
      
      if (mode === 'replace') {
          if (await fs.pathExists(targetBase)) {
              await fs.emptyDir(targetBase);
          }
      }
      
      for (const skill of skillsToApply) {
          const targetDir = path.join(targetBase, skill.name);
          await fs.copy(skill.path, targetDir, { overwrite: true });
      }
  }

  public updateDefaultExportPath(newPath: string) {
      vscode.workspace.getConfiguration('skillsWizard').update('defaultExportPath', newPath, vscode.ConfigurationTarget.Global);
      // No need to save to internal config, relies on VS Code settings
  }
}
