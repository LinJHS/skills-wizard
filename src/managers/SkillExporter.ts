/**
 * Skill Exporter - Handles exporting skills to workspace and zip
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';
import AdmZip = require('adm-zip');
import { StorageManager } from './StorageManager';
import { resolvePath } from '../utils/paths';

export class SkillExporter {
  constructor(private storage: StorageManager) {}

  /**
   * Export skill to workspace
   */
  async exportToWorkspace(skillId: string, targetPath?: string): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      throw new Error('No workspace folder open');
    }

    const skillDir = this.storage.getSkillPath(skillId);
    if (!(await fs.pathExists(skillDir))) {
      throw new Error('Skill not found');
    }

    let exportPath: string;
    if (targetPath) {
      exportPath = targetPath;
    } else {
      // Use default export path from config
      const defaultExportPath = vscode.workspace.getConfiguration('skillsWizard').get<string>('defaultExportPath') || '.claude/skills/';
      const skillName = path.basename(skillDir);
      exportPath = path.join(workspaceFolders[0].uri.fsPath, defaultExportPath, skillName);
    }

    await fs.ensureDir(path.dirname(exportPath));
    await fs.copy(skillDir, exportPath, { overwrite: true });
  }

  /**
   * Export skills to zip file
   */
  async exportToZip(skillIds: string[], zipPath: string): Promise<void> {
    const zip = new AdmZip();

    for (const skillId of skillIds) {
      const skillDir = this.storage.getSkillPath(skillId);
      if (await fs.pathExists(skillDir)) {
        const skillName = path.basename(skillDir);
        zip.addLocalFolder(skillDir, skillName);
      }
    }

    zip.writeZip(zipPath);
  }

  /**
   * Export presets to zip file
   */
  async exportPresetsToZip(presetIds: string[] | 'all', zipPath: string): Promise<void> {
    const config = this.storage.getConfig();
    const zip = new AdmZip();

    const presetsToExport = presetIds === 'all' 
      ? config.presets 
      : config.presets.filter(p => presetIds.includes(p.id));

    // Add presets config
    zip.addFile('presets.json', Buffer.from(JSON.stringify(presetsToExport, null, 2), 'utf-8'));

    // Add all skills from presets
    const skillIdsSet = new Set<string>();
    for (const preset of presetsToExport) {
      for (const skillId of preset.skillIds) {
        skillIdsSet.add(skillId);
      }
    }

    for (const skillId of skillIdsSet) {
      const skillDir = this.storage.getSkillPath(skillId);
      if (await fs.pathExists(skillDir)) {
        const skillName = path.basename(skillDir);
        zip.addLocalFolder(skillDir, `skills/${skillName}`);
      }
    }

    zip.writeZip(zipPath);
  }

  /**
   * Import bundle (zip or folder)
   */
  async importBundle(
    bundlePath: string,
    allowOverwrite: boolean,
    importPresetsAsIs: boolean
  ): Promise<{
    imported: number;
    overwritten: number;
    skipped: number;
    totalSkills: number;
    presetsImported: number;
    presetsOverwritten: number;
    presetsSkipped: number;
  }> {
    const stat = await fs.stat(bundlePath);
    let tempDir: string;
    let cleanup = false;

    if (stat.isDirectory()) {
      tempDir = bundlePath;
    } else {
      // Extract zip to temp directory
      const zip = new AdmZip(bundlePath);
      tempDir = path.join(this.storage.getSkillsPath(), `temp-${Date.now()}`);
      zip.extractAllTo(tempDir, true);
      cleanup = true;
    }

    let imported = 0;
    let overwritten = 0;
    let skipped = 0;
    let totalSkills = 0;

    try {
      // Import skills
      const skillsDir = path.join(tempDir, 'skills');
      if (await fs.pathExists(skillsDir)) {
        const entries = await fs.readdir(skillsDir);
        totalSkills = entries.length;

        for (const entry of entries) {
          const skillPath = path.join(skillsDir, entry);
          const stat = await fs.stat(skillPath);
          if (stat.isDirectory()) {
            const skillMdPath = path.join(skillPath, 'SKILL.md');
            if (await fs.pathExists(skillMdPath)) {
              const content = await fs.readFile(skillMdPath, 'utf-8');
              const md5 = require('crypto').createHash('md5').update(content).digest('hex');
              
              const targetPath = this.storage.getSkillPath(md5);
              const exists = await fs.pathExists(targetPath);

              if (exists && !allowOverwrite) {
                skipped++;
              } else {
                await fs.copy(skillPath, targetPath, { overwrite: true });
                if (exists) {
                  overwritten++;
                } else {
                  imported++;
                }

                // Update config
                const config = this.storage.getConfig();
                if (!config.skills[md5]) {
                  config.skills[md5] = {
                    tags: [],
                    source: 'import',
                    importedAt: new Date().toISOString()
                  };
                  await this.storage.saveConfig(config);
                }
              }
            }
          }
        }
      }

      // Import presets
      let presetsImported = 0;
      let presetsOverwritten = 0;
      let presetsSkipped = 0;

      const presetsFile = path.join(tempDir, 'presets.json');
      if (await fs.pathExists(presetsFile)) {
        const presetsData = JSON.parse(await fs.readFile(presetsFile, 'utf-8'));
        const config = this.storage.getConfig();

        for (const preset of presetsData) {
          const existingIndex = config.presets.findIndex(p => p.name === preset.name);
          
          if (existingIndex >= 0) {
            if (allowOverwrite) {
              if (importPresetsAsIs) {
                config.presets[existingIndex] = preset;
              } else {
                config.presets[existingIndex].skillIds = preset.skillIds;
              }
              presetsOverwritten++;
            } else {
              presetsSkipped++;
            }
          } else {
            if (importPresetsAsIs) {
              config.presets.push(preset);
            } else {
              config.presets.push({
                id: Date.now().toString() + Math.random(),
                name: preset.name,
                skillIds: preset.skillIds
              });
            }
            presetsImported++;
          }
        }

        await this.storage.saveConfig(config);
      }

      return {
        imported,
        overwritten,
        skipped,
        totalSkills,
        presetsImported,
        presetsOverwritten,
        presetsSkipped
      };
    } finally {
      if (cleanup && await fs.pathExists(tempDir)) {
        await fs.remove(tempDir);
      }
    }
  }
}
