import * as fs from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';
import { UserConfig } from '../models/types';
import { getDefaultSkillsWizardStoragePath, resolvePath } from '../utils/paths';

/**
 * ConfigService
 * Responsible for configuration management: loading, saving, migration, and settings.
 */
export class ConfigService {
  private context: vscode.ExtensionContext;
  private legacyStoragePath: string;
  private storagePath: string;
  private configPath: string;
  private config: UserConfig;
  private ready: Promise<void>;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.legacyStoragePath = context.globalStorageUri.fsPath;
    this.storagePath = this.getStoragePathFromSettings();
    this.configPath = path.join(this.storagePath, 'config.json');
    this.config = { skills: {}, presets: [], defaultExportPath: '' };
    this.ready = this.init(this.legacyStoragePath);
  }

  /**
   * Ensure the service is ready and check if storage path has changed.
   */
  public async ensureReady(): Promise<void> {
    const next = this.getStoragePathFromSettings();
    if (next !== this.storagePath) {
      const previous = this.storagePath;
      this.storagePath = next;
      this.configPath = path.join(this.storagePath, 'config.json');
      this.config = { skills: {}, presets: [], defaultExportPath: '' };
      this.ready = this.init(previous);
    }
    await this.ready;
  }

  /**
   * Get the storage path from settings or use default.
   */
  private getStoragePathFromSettings(): string {
    const custom = vscode.workspace.getConfiguration('skillsWizard').get<string>('storagePath')?.trim();
    if (custom) {
      return resolvePath(custom);
    }
    return getDefaultSkillsWizardStoragePath();
  }

  /**
   * Initialize the configuration system: ensure directories exist, migrate if needed, and load config.
   */
  private async init(migrateFromPath?: string): Promise<void> {
    await fs.ensureDir(this.storagePath);
    await fs.ensureDir(path.join(this.storagePath, 'skills'));
    if (migrateFromPath) {
      await this.maybeMigrateFrom(migrateFromPath);
    }
    await this.loadConfig();
  }

  /**
   * Migrate configuration and skills from a previous storage location.
   */
  private async maybeMigrateFrom(fromPath: string): Promise<void> {
    if (fromPath === this.storagePath) {
      return;
    }

    const fromConfig = path.join(fromPath, 'config.json');
    const fromSkillsDir = path.join(fromPath, 'skills');

    const toConfig = this.configPath;
    const toSkillsDir = path.join(this.storagePath, 'skills');

    const toHasConfig = await fs.pathExists(toConfig);
    const toHasSkills = await fs.pathExists(toSkillsDir) && (await fs.readdir(toSkillsDir)).length > 0;
    if (toHasConfig || toHasSkills) {
      return;
    }

    const fromHasConfig = await fs.pathExists(fromConfig);
    const fromHasSkills = await fs.pathExists(fromSkillsDir) && (await fs.readdir(fromSkillsDir)).length > 0;
    if (!fromHasConfig && !fromHasSkills) {
      return;
    }

    try {
      await fs.ensureDir(this.storagePath);
      await fs.copy(fromPath, this.storagePath, { overwrite: false, errorOnExist: false });
    } catch (e) {
      console.error('Failed to migrate storage', e);
    }
  }

  /**
   * Load configuration from disk.
   */
  private async loadConfig(): Promise<void> {
    if (await fs.pathExists(this.configPath)) {
      try {
        const stored = await fs.readJSON(this.configPath);
        this.config = { ...this.config, ...stored };
      } catch (e) {
        console.error('Failed to load config', e);
      }
    }
  }

  /**
   * Save configuration to disk.
   */
  public async saveConfig(): Promise<void> {
    await fs.writeJSON(this.configPath, this.config, { spaces: 2 });
  }

  /**
   * Get the current configuration.
   */
  public getConfig(): UserConfig {
    return this.config;
  }

  /**
   * Update the configuration (shallow merge).
   */
  public updateConfig(updates: Partial<UserConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Get the current storage path.
   */
  public getStoragePath(): string {
    return this.storagePath;
  }

  /**
   * Get the skills directory path.
   */
  public getSkillsPath(): string {
    return path.join(this.storagePath, 'skills');
  }

  /**
   * Update the default export path setting.
   */
  public updateDefaultExportPath(newPath: string): void {
    vscode.workspace.getConfiguration('skillsWizard').update('defaultExportPath', newPath, vscode.ConfigurationTarget.Global);
  }

  /**
   * Update the storage path setting.
   */
  public updateStoragePath(newPath: string): void {
    vscode.workspace.getConfiguration('skillsWizard').update('storagePath', newPath, vscode.ConfigurationTarget.Global);
  }

  /**
   * Get the default export path from settings.
   */
  public getDefaultExportPath(): string {
    return vscode.workspace.getConfiguration('skillsWizard').get('defaultExportPath') || '.claude/skills/';
  }
}
