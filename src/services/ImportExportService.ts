import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import AdmZip = require('adm-zip');
import { DiscoveredSkill, Preset } from '../models/types';
import { ConfigService } from './ConfigService';
import { FileService } from './FileService';
import { ScanService } from './ScanService';
import { GitHubService } from './GitHubService';

/**
 * ImportExportService
 * Responsible for importing and exporting skills and presets.
 */
export class ImportExportService {
  private configService: ConfigService;
  private fileService: FileService;
  private scanService: ScanService;
  private githubService: GitHubService;

  constructor(
    configService: ConfigService,
    fileService: FileService,
    scanService: ScanService,
    githubService: GitHubService
  ) {
    this.configService = configService;
    this.fileService = fileService;
    this.scanService = scanService;
    this.githubService = githubService;
  }

  /**
   * Import a skill from a discovered skill (local or remote).
   */
  public async importSkill(skill: DiscoveredSkill): Promise<string> {
    await this.configService.ensureReady();
    
    // Use MD5 as folder name for consistency and uniqueness
    // This prevents issues when skill name changes
    const targetDir = path.join(this.configService.getSkillsPath(), skill.md5);
    const existingSkillMd = path.join(targetDir, 'SKILL.md');
    const existingMd5 = (await fs.pathExists(existingSkillMd))
      ? await this.fileService.calculateMD5(existingSkillMd)
      : undefined;
    
    if (skill.isRemote && skill.remoteUrl) {
      await fs.ensureDir(targetDir);
      await this.githubService.downloadGitHubDirectory(skill.remoteUrl, targetDir);
    } else {
      await fs.copy(skill.path, targetDir, { overwrite: true });
    }

    // Re-compute ID from what we actually imported
    const importedSkillMd = path.join(targetDir, 'SKILL.md');
    const importedMd5 = await this.fileService.calculateMD5(importedSkillMd);

    // Verify MD5 matches (should be the same if content didn't change)
    if (importedMd5 !== skill.md5) {
      // Content changed, need to move to new folder
      const newTargetDir = path.join(this.configService.getSkillsPath(), importedMd5);
      if (await fs.pathExists(targetDir)) {
        await fs.move(targetDir, newTargetDir, { overwrite: true });
      }
      
      // Migrate metadata and presets
      if (existingMd5 && existingMd5 !== importedMd5) {
        await this.migrateSkillId(existingMd5, importedMd5);
      }
    } else if (existingMd5 && existingMd5 !== importedMd5) {
      // Different MD5, migrate
      await this.migrateSkillId(existingMd5, importedMd5);
    }

    // Ensure metadata exists for the imported skill
    const config = this.configService.getConfig();
    if (!config.skills[importedMd5]) {
      config.skills[importedMd5] = { tags: [], source: skill.source };
    } else if (!config.skills[importedMd5].source) {
      // Update existing entry to include source if missing
      config.skills[importedMd5].source = skill.source;
    }

    await this.configService.saveConfig();
    return importedMd5;
  }

  /**
   * Migrate skill metadata and preset references from old ID to new ID.
   */
  private async migrateSkillId(oldId: string, newId: string): Promise<void> {
    const config = this.configService.getConfig();
    const oldMeta = config.skills[oldId];
    if (oldMeta && !config.skills[newId]) {
      config.skills[newId] = oldMeta;
    }
    delete config.skills[oldId];
    config.presets = (config.presets || []).map(p => ({
      ...p,
      skillIds: (p.skillIds || []).map(id => (id === oldId ? newId : id))
    }));
  }

  /**
   * Export skills to a zip file.
   */
  public async exportSkillsToZip(skillIds: string[], outputPath: string): Promise<void> {
    await this.configService.ensureReady();
    const imported = await this.scanService.getImportedSkills();
    const uniqueIds = Array.from(new Set(skillIds));
    const skills = imported.filter(s => uniqueIds.includes(s.id));
    if (skills.length === 0) {
      throw new Error('No skills selected for export');
    }
    const zip = new AdmZip();
    for (const skill of skills) {
      zip.addLocalFolder(skill.path, path.posix.join('skills', skill.name));
    }
    zip.writeZip(outputPath);
  }

  /**
   * Export presets (and their associated skills) to a zip file.
   */
  public async exportPresetsToZip(presetIds: string[] | 'all', outputPath: string): Promise<void> {
    await this.configService.ensureReady();
    const config = this.configService.getConfig();
    const imported = await this.scanService.getImportedSkills();
    const skillById = new Map(imported.map(s => [s.id, s]));
    
    const presets = presetIds === 'all'
      ? (config.presets || [])
      : (config.presets || []).filter(p => presetIds.includes(p.id));
    if (presets.length === 0) {
      throw new Error('No presets selected for export');
    }
    
    const exportPresets = presets.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      skillIds: Array.isArray(p.skillIds) ? p.skillIds : [],
      skillNames: (p.skillIds || [])
        .map(id => skillById.get(id)?.name)
        .filter((name): name is string => typeof name === 'string')
    }));
    
    const zip = new AdmZip();
    const bundle = { version: 2, presets: exportPresets };
    zip.addFile('presets.json', Buffer.from(JSON.stringify(bundle, null, 2), 'utf8'));

    const skillIdsToExport = new Set<string>();
    for (const preset of presets) {
      for (const id of preset.skillIds || []) {
        if (skillById.has(id)) {
          skillIdsToExport.add(id);
        }
      }
    }
    for (const id of skillIdsToExport) {
      const skill = skillById.get(id);
      if (skill) {
        zip.addLocalFolder(skill.path, path.posix.join('skills', skill.name));
      }
    }
    zip.writeZip(outputPath);
  }

  /**
   * Import a bundle (zip or directory) containing skills and/or presets.
   */
  public async importBundle(
    sourcePath: string,
    allowOverwrite: boolean,
    importPresetsAsIs: boolean = false
  ): Promise<{
    totalSkills: number;
    imported: number;
    overwritten: number;
    skipped: number;
    presetsImported: number;
    presetsOverwritten: number;
    presetsSkipped: number;
  }> {
    await this.configService.ensureReady();
    const stat = await fs.stat(sourcePath);
    if (stat.isDirectory()) {
      return this.importFromDirectory(sourcePath, allowOverwrite, importPresetsAsIs);
    }
    if (stat.isFile() && sourcePath.toLowerCase().endsWith('.zip')) {
      return this.importFromZip(sourcePath, allowOverwrite, importPresetsAsIs);
    }
    throw new Error('Unsupported import source (use a folder or .zip file)');
  }

  /**
   * Import from a zip file.
   */
  private async importFromZip(
    zipPath: string,
    allowOverwrite: boolean,
    importPresetsAsIs: boolean
  ): Promise<any> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-wizard-'));
    try {
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(tempDir, true);
      return await this.importFromDirectory(tempDir, allowOverwrite, importPresetsAsIs);
    } finally {
      await fs.remove(tempDir);
    }
  }

  /**
   * Import from a directory containing skills and/or presets.json.
   */
  private async importFromDirectory(
    sourceDir: string,
    allowOverwrite: boolean,
    importPresetsAsIs: boolean
  ): Promise<any> {
    const skillPaths = await this.fileService.scanRecursively(sourceDir, 0, 10);
    const discovered: DiscoveredSkill[] = [];
    
    for (const skillPath of skillPaths) {
      const skillMdPath = path.join(skillPath, 'SKILL.md');
      const md5 = await this.fileService.calculateMD5(skillMdPath);
      const description = await this.fileService.readSkillDescriptionFromFile(skillMdPath);
      discovered.push({
        name: path.basename(skillPath),
        path: skillPath,
        md5: md5,
        description,
        sourceLocation: path.dirname(skillPath)
      });
    }
    
    // Deduplicate by name
    const uniqueByName = new Map<string, DiscoveredSkill>();
    for (const skill of discovered) {
      const key = this.fileService.normalizeName(skill.name);
      if (!uniqueByName.has(key)) {
        uniqueByName.set(key, skill);
      }
    }
    const uniqueSkills = Array.from(uniqueByName.values());
    
    const imported = await this.scanService.getImportedSkills();
    const existingByName = new Map(imported.map(s => [this.fileService.normalizeName(s.name), s]));

    let importedCount = 0;
    let overwrittenCount = 0;
    let skippedCount = 0;

    for (const skill of uniqueSkills) {
      const existing = existingByName.get(this.fileService.normalizeName(skill.name));
      if (existing && existing.md5 !== skill.md5) {
        if (!allowOverwrite) {
          skippedCount += 1;
          continue;
        }
        overwrittenCount += 1;
      }
      await this.importSkill(skill);
      importedCount += 1;
    }

    // Import presets
    const presetResults = await this.importPresetsFromDirectory(sourceDir, allowOverwrite, importPresetsAsIs);

    return {
      totalSkills: uniqueSkills.length,
      imported: importedCount,
      overwritten: overwrittenCount,
      skipped: skippedCount,
      presetsImported: presetResults.imported,
      presetsOverwritten: presetResults.overwritten,
      presetsSkipped: presetResults.skipped
    };
  }

  /**
   * Import presets from a directory containing presets.json.
   */
  private async importPresetsFromDirectory(
    sourceDir: string,
    allowOverwrite: boolean,
    importPresetsAsIs: boolean
  ): Promise<{ imported: number; overwritten: number; skipped: number }> {
    let presetsImported = 0;
    let presetsOverwritten = 0;
    let presetsSkipped = 0;

    const presetFile = path.join(sourceDir, 'presets.json');
    if (!(await fs.pathExists(presetFile))) {
      return { imported: 0, overwritten: 0, skipped: 0 };
    }

    try {
      const raw = await fs.readJSON(presetFile);
      const presetItems = Array.isArray(raw?.presets) ? raw.presets : [];
      if (presetItems.length === 0) {
        return { imported: 0, overwritten: 0, skipped: 0 };
      }

      const afterImport = await this.scanService.getImportedSkills();
      const nameToId = new Map(afterImport.map(s => [this.fileService.normalizeName(s.name), s.id]));
      const idsInStore = new Set(afterImport.map(s => s.id));
      const config = this.configService.getConfig();

      for (const item of presetItems) {
        const presetName = typeof item?.name === 'string' ? item.name.trim() : '';
        if (!presetName) {
          continue;
        }
        const description = typeof item?.description === 'string' ? item.description : undefined;
        const skillIdsFromNames = (Array.isArray(item?.skillNames) ? item.skillNames : [])
          .map((n: any) => (typeof n === 'string' ? nameToId.get(this.fileService.normalizeName(n)) : undefined))
          .filter((id: string | undefined): id is string => typeof id === 'string');
        const skillIdsFromIds = (Array.isArray(item?.skillIds) ? item.skillIds : [])
          .filter((id: any): id is string => typeof id === 'string' && idsInStore.has(id));
        const skillIds = (importPresetsAsIs && skillIdsFromIds.length > 0)
          ? skillIdsFromIds
          : skillIdsFromNames;
        if (skillIds.length === 0) {
          continue;
        }
        const presetId = typeof item?.id === 'string' && item.id.trim().length > 0
          ? item.id.trim()
          : Date.now().toString() + Math.random().toString(16).slice(2);
        const conflictById = (config.presets || []).find(p => p.id === presetId);
        const conflictByName = (config.presets || []).find(
          p => this.fileService.normalizeName(p.name) === this.fileService.normalizeName(presetName) && p.id !== presetId
        );
        const conflict = conflictById || conflictByName;
        if (conflict && !allowOverwrite) {
          presetsSkipped += 1;
          continue;
        }
        if (conflict && allowOverwrite) {
          presetsOverwritten += 1;
          // Remove old preset
          config.presets = config.presets.filter(p => p.id !== conflict.id);
        }
        const preset: Preset = {
          id: conflict?.id ?? presetId,
          name: presetName,
          description,
          skillIds
        };
        config.presets.push(preset);
        if (!conflict) {
          presetsImported += 1;
        }
      }
      await this.configService.saveConfig();
    } catch (e) {
      console.error('Failed to import presets.json', e);
    }

    return { imported: presetsImported, overwritten: presetsOverwritten, skipped: presetsSkipped };
  }

  /**
   * Export a single skill to the workspace.
   */
  public async exportSkillToWorkspace(skillId: string): Promise<void> {
    await this.configService.ensureReady();
    const skill = await this.scanService.getSkillById(skillId);
    if (!skill) {
      return;
    }

    const rootPath = await this.pickTargetRootFolder();
    if (!rootPath) {
      return; // User cancelled
    }
    const relativeTarget = await this.getOrPromptApplyPath();
    if (!relativeTarget) {
      return; // User cancelled
    }
    const targetDir = path.join(rootPath, relativeTarget, skill.name);
    
    await fs.ensureDir(path.dirname(targetDir));
    await fs.copy(skill.path, targetDir, { overwrite: true });
  }

  /**
   * Apply a preset to the workspace.
   */
  public async applyPreset(presetId: string, mode: 'merge' | 'replace'): Promise<void> {
    await this.configService.ensureReady();
    const config = this.configService.getConfig();
    const preset = config.presets.find(p => p.id === presetId);
    if (!preset) {
      return;
    }
    
    const imported = await this.scanService.getImportedSkills();
    const skillsToApply = imported.filter(s => preset.skillIds.includes(s.id));
    
    const rootPath = await this.pickTargetRootFolder();
    if (!rootPath) {
      return; // User cancelled
    }
    const relativeTarget = await this.getOrPromptApplyPath();
    if (!relativeTarget) {
      return; // User cancelled
    }
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

  /**
   * Get the default apply path, or prompt user to set it if not configured.
   */
  private async getOrPromptApplyPath(): Promise<string | undefined> {
    let applyPath = this.configService.getDefaultApplyPath();
    
    if (!applyPath || applyPath.trim().length === 0) {
      // Not set, prompt user to input
      const input = await vscode.window.showInputBox({
        prompt: 'Enter the default path to apply skills to in the workspace (relative to workspace root)',
        placeHolder: '.claude/skills/',
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Path cannot be empty';
          }
          return null;
        }
      });
      
      if (!input) {
        return undefined; // User cancelled
      }
      
      // Save it persistently
      this.configService.updateDefaultApplyPath(input.trim());
      applyPath = input.trim();
    }
    
    return applyPath;
  }

  /**
   * Pick a target root folder for export (workspace or custom).
   */
  private async pickTargetRootFolder(): Promise<string | undefined> {
    // Prefer workspace folder (if any)
    const picked = await vscode.window.showWorkspaceFolderPick();
    if (picked) {
      return picked.uri.fsPath;
    }

    const activeUri = vscode.window.activeTextEditor?.document?.uri;
    if (activeUri && activeUri.scheme === 'file') {
      return path.dirname(activeUri.fsPath);
    }

    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Select target folder'
    });
    if (!uris || !uris[0]) {
      return undefined;
    }
    return uris[0].fsPath;
  }
}
