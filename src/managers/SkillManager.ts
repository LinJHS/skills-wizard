import * as vscode from 'vscode';
import { Skill, Preset, DiscoveredSkill, SkillMetadata } from '../models/types';
import { ConfigService } from '../services/ConfigService';
import { FileService } from '../services/FileService';
import { ScanService } from '../services/ScanService';
import { GitHubService } from '../services/GitHubService';
import { ImportExportService } from '../services/ImportExportService';
import { PresetService } from '../services/PresetService';

/**
 * SkillManager
 * Main coordinator that orchestrates all skill-related operations by delegating to specialized services.
 * This class provides a unified interface for the extension to interact with skills, presets, and configurations.
 */
export class SkillManager {
  // Services
  private configService: ConfigService;
  private fileService: FileService;
  private scanService: ScanService;
  private githubService: GitHubService;
  private importExportService: ImportExportService;
  private presetService: PresetService;

  constructor(context: vscode.ExtensionContext) {
    // Initialize services in dependency order
    this.configService = new ConfigService(context);
    this.fileService = new FileService();
    this.scanService = new ScanService(this.fileService, this.configService);
    this.githubService = new GitHubService(this.fileService);
    this.importExportService = new ImportExportService(
      this.configService,
      this.fileService,
      this.scanService,
      this.githubService
    );
    this.presetService = new PresetService(this.configService, this.fileService, this.scanService);
  }

  // ==================== Scanning Operations ====================

  /**
   * Scan for skills from global and workspace paths.
   */
  public async scanForSkills(): Promise<{ discovered: DiscoveredSkill[], imported: Skill[] }> {
    return this.scanService.scanForSkills();
  }

  /**
   * Scan a custom path for skills.
   */
  public async scanCustomPath(targetPath: string): Promise<{ added: number; total: number }> {
    return this.scanService.scanCustomPath(targetPath);
  }

  /**
   * Scan a GitHub repository for skills.
   */
  public async scanGitHub(repoUrl: string): Promise<{ added: number; total: number }> {
    await this.configService.ensureReady();
    const skills = await this.githubService.scanGitHub(repoUrl);
    const added = this.scanService.addToTempDiscovered(skills);
    return { added, total: skills.length };
  }

  // ==================== Import/Export Operations ====================

  /**
   * Import a skill.
   */
  public async importSkill(skill: DiscoveredSkill): Promise<string> {
    return this.importExportService.importSkill(skill);
  }

  /**
   * Import a bundle (zip or directory).
   */
  public async importBundle(
    sourcePath: string,
    allowOverwrite: boolean,
    importPresetsAsIs: boolean = false
  ) {
    return this.importExportService.importBundle(sourcePath, allowOverwrite, importPresetsAsIs);
  }

  /**
   * Export skills to a zip file.
   */
  public async exportSkillsToZip(skillIds: string[], outputPath: string): Promise<void> {
    return this.importExportService.exportSkillsToZip(skillIds, outputPath);
  }

  /**
   * Export presets to a zip file.
   */
  public async exportPresetsToZip(presetIds: string[] | 'all', outputPath: string): Promise<void> {
    return this.importExportService.exportPresetsToZip(presetIds, outputPath);
  }

  /**
   * Export a skill to the workspace.
   */
  public async exportSkillToWorkspace(skillId: string, merge: boolean = true): Promise<void> {
    return this.importExportService.exportSkillToWorkspace(skillId);
  }

  /**
   * Apply a preset to the workspace.
   */
  public async applyPreset(presetId: string, mode: 'merge' | 'replace'): Promise<void> {
    return this.importExportService.applyPreset(presetId, mode);
  }

  // ==================== Skill Management ====================

  /**
   * Delete a skill.
   */
  public async deleteSkill(skillId: string): Promise<void> {
    return this.scanService.deleteSkill(skillId);
  }

  /**
   * Update skill metadata.
   */
  public async updateSkillMetadata(skillId: string, metadata: Partial<SkillMetadata>): Promise<void> {
    return this.scanService.updateSkillMetadata(skillId, metadata);
  }

  /**
   * Get the file path of a skill's SKILL.md.
   */
  public async getSkillFilePath(skillId: string): Promise<string | undefined> {
    return this.scanService.getSkillFilePath(skillId);
  }

  // ==================== Preset Management ====================

  /**
   * Get all presets.
   */
  public getPresets(): Preset[] {
    return this.presetService.getPresets();
  }

  /**
   * Save a preset (create or update).
   */
  public async savePreset(preset: Preset, options: { allowOverwrite?: boolean } = {}): Promise<void> {
    return this.presetService.savePreset(preset, options);
  }

  /**
   * Delete a preset.
   */
  public async deletePreset(presetId: string): Promise<void> {
    return this.presetService.deletePreset(presetId);
  }

  /**
   * Remove skills from a preset.
   */
  public async removeSkillsFromPreset(presetId: string, skillIds: string[]): Promise<void> {
    return this.presetService.removeSkillsFromPreset(presetId, skillIds);
  }

  // ==================== Configuration Management ====================

  /**
   * Update the default export path.
   */
  public updateDefaultExportPath(newPath: string): void {
    this.configService.updateDefaultExportPath(newPath);
  }

  /**
   * Update the storage path.
   */
  public updateStoragePath(newPath: string): void {
    this.configService.updateStoragePath(newPath);
  }

  /**
   * Get the effective storage path.
   */
  public async getEffectiveStoragePath(): Promise<string> {
    await this.configService.ensureReady();
    return this.configService.getStoragePath();
  }

  // ==================== Utility Methods ====================

  /**
   * Calculate MD5 hash of a file.
   */
  public async calculateMD5(filePath: string): Promise<string> {
    return this.fileService.calculateMD5(filePath);
  }

  /**
   * Calculate MD5 hash from a buffer.
   */
  public calculateMD5FromBuffer(buffer: Buffer): string {
    return this.fileService.calculateMD5FromBuffer(buffer);
  }

  /**
   * Update skill name in SKILL.md file.
   */
  public async updateSkillName(skillId: string, newName: string): Promise<void> {
    const skillPath = await this.scanService.getSkillFilePath(skillId);
    if (skillPath) {
      await this.fileService.updateSkillName(skillPath, newName);
    }
  }

  /**
   * Update skill description in SKILL.md file.
   */
  public async updateSkillDescription(skillId: string, newDescription: string): Promise<void> {
    const skillPath = await this.scanService.getSkillFilePath(skillId);
    if (skillPath) {
      await this.fileService.updateSkillDescription(skillPath, newDescription);
    }
  }
}
