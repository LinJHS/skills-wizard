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

  // Temporary storage for discovered skills that aren't persisted yet (like custom paths or github)
  private tempDiscovered: DiscoveredSkill[] = [];

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.storagePath = context.globalStorageUri.fsPath;
    this.configPath = path.join(this.storagePath, 'config.json');
    this.config = { skills: {}, presets: [], defaultExportPath: '' };
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
    return this.calculateMD5FromBuffer(buffer);
  }

  public calculateMD5FromBuffer(buffer: Buffer): string {
    const hash = crypto.createHash('md5');
    hash.update(buffer);
    return hash.digest('hex');
  }

  public async scanForSkills(): Promise<{ discovered: DiscoveredSkill[], imported: Skill[] }> {
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
                        const md5 = await this.calculateMD5(skillMdPath);
                        // Avoid duplicates from tempDiscovered if re-scanned? 
                        // Actually tempDiscovered is for custom things.
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
    
    // Deduplicate discovered: if same MD5 exists in discovered, keep one?
    // If same MD5 exists in imported, the UI handles showing "Imported".
    // We should dedupe discovered list itself (e.g. same skill in multiple global paths or scanned twice).
    const uniqueDiscovered = Array.from(new Map(discovered.map(item => [item.md5, item])).values());

    return { discovered: uniqueDiscovered, imported };
  }

  public async scanCustomPath(targetPath: string) {
      // Recursive scan
      const found = await this.scanRecursively(targetPath);
      // Add to tempDiscovered
      for (const skill of found) {
          if (!this.tempDiscovered.some(s => s.md5 === skill.md5)) {
              this.tempDiscovered.push(skill);
          }
      }
  }

  private async scanRecursively(dir: string, depth: number = 0): Promise<DiscoveredSkill[]> {
      if (depth > 5) return [];
      const results: DiscoveredSkill[] = [];
      
      try {
          // Check if this is a skill
          const skillMdPath = path.join(dir, 'SKILL.md');
          if (await fs.pathExists(skillMdPath)) {
              const md5 = await this.calculateMD5(skillMdPath);
              return [{
                  name: path.basename(dir),
                  path: dir,
                  md5: md5,
                  sourceLocation: path.dirname(dir)
              }];
          }
          
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
              if (entry.isDirectory() && !entry.name.startsWith('.')) {
                  results.push(...await this.scanRecursively(path.join(dir, entry.name), depth + 1));
              }
          }
      } catch (e) {
          // ignore
      }
      return results;
  }

  public async scanGitHub(repoUrl: string) {
      // repoUrl: https://github.com/owner/repo
      const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (!match) throw new Error("Invalid GitHub URL");
      const owner = match[1];
      const repo = match[2];
      
      for (const relativePath of WORKSPACE_SKILL_PATHS) {
           // relativePath e.g. .claude/skills/
           // trim trailing slash
           const cleanPath = relativePath.replace(/\/$/, '');
           const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${cleanPath}`;
           
           try {
               const res = await fetch(apiUrl);
               if (res.ok) {
                   const items = await res.json() as unknown as any[];
                   if (Array.isArray(items)) {
                       for (const item of items) {
                           if (item.type === 'dir') {
                               // Check for SKILL.md inside
                               const skillMdUrl = `${item.url}/SKILL.md`; // item.url is the API url for the dir. This is wrong construction.
                               // item.url: https://api.github.com/repos/x/y/contents/.claude/skills/SkillName
                               // We need to check content of that dir.
                               
                               // Optimization: instead of listing dir, try fetching raw SKILL.md
                               // Raw URL: https://raw.githubusercontent.com/owner/repo/branch/path/to/SKILL.md
                               // We need branch. Default branch?
                               // The API item has `download_url` for files. For dir it is null.
                               
                               // Let's list the dir content to be sure.
                               const dirRes = await fetch(item.url);
                               if (dirRes.ok) {
                                   const dirItems = await dirRes.json() as unknown as any[];
                                   const skillMd = dirItems.find((f: any) => f.name === 'SKILL.md');
                                   if (skillMd && skillMd.download_url) {
                                       // Fetch content for MD5
                                       const mdContentRes = await fetch(skillMd.download_url);
                                       const mdBuffer = Buffer.from(await mdContentRes.arrayBuffer());
                                       const md5 = this.calculateMD5FromBuffer(mdBuffer);
                                       
                                       const skill: DiscoveredSkill = {
                                           name: item.name,
                                           path: item.url, // Store API URL for directory
                                           md5: md5,
                                           sourceLocation: repoUrl,
                                           isRemote: true,
                                           remoteUrl: item.url
                                       };
                                       
                                       if (!this.tempDiscovered.some(s => s.md5 === skill.md5)) {
                                           this.tempDiscovered.push(skill);
                                       }
                                   }
                               }
                           }
                       }
                   }
               }
           } catch (e) {
               console.error(`Failed to scan GitHub path ${relativePath}`, e);
           }
      }
  }

  public async importSkill(skill: DiscoveredSkill): Promise<void> {
    const targetDir = path.join(this.storagePath, 'skills', skill.name);
    
    if (skill.isRemote && skill.remoteUrl) {
        await fs.ensureDir(targetDir);
        await this.downloadGitHubDirectory(skill.remoteUrl, targetDir);
    } else {
        await fs.copy(skill.path, targetDir, { overwrite: true });
    }
    
    if (!this.config.skills[skill.md5]) {
        this.config.skills[skill.md5] = { tags: [] };
        await this.saveConfig();
    }
  }
  
  private async downloadGitHubDirectory(apiUrl: string, localDir: string) {
      const res = await fetch(apiUrl);
      if (!res.ok) throw new Error(`Failed to fetch ${apiUrl}`);
      const items = await res.json() as any[];
      
      for (const item of items) {
          if (item.type === 'file' && item.download_url) {
              const fileRes = await fetch(item.download_url);
              const buffer = Buffer.from(await fileRes.arrayBuffer());
              await fs.writeFile(path.join(localDir, item.name), buffer);
          } else if (item.type === 'dir') {
              const subDir = path.join(localDir, item.name);
              await fs.ensureDir(subDir);
              await this.downloadGitHubDirectory(item.url, subDir);
          }
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
  }
}
