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
    // Validate and fix corrupted config
    await this.validateAndFixConfig();
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

    // Check if target has valid data (not just file existence)
    const toHasValidConfig = await this.hasValidConfig(toConfig);
    const toHasSkills = await fs.pathExists(toSkillsDir) && (await fs.readdir(toSkillsDir)).length > 0;
    
    // Only skip migration if target has valid config OR valid skills
    if (toHasValidConfig || toHasSkills) {
      console.log(`[ConfigService] Skipping migration: target has valid data (config: ${toHasValidConfig}, skills: ${toHasSkills})`);
      return;
    }

    const fromHasConfig = await fs.pathExists(fromConfig);
    const fromHasSkills = await fs.pathExists(fromSkillsDir) && (await fs.readdir(fromSkillsDir)).length > 0;
    if (!fromHasConfig && !fromHasSkills) {
      console.log('[ConfigService] No data to migrate from source');
      return;
    }

    try {
      console.log(`[ConfigService] Migrating data from ${fromPath} to ${this.storagePath}`);
      await fs.ensureDir(this.storagePath);
      await fs.copy(fromPath, this.storagePath, { overwrite: false, errorOnExist: false });
      console.log('[ConfigService] Migration completed successfully');
    } catch (e) {
      console.error('[ConfigService] Failed to migrate storage', e);
    }
  }

  /**
   * Check if a config file exists and contains valid data.
   */
  private async hasValidConfig(configPath: string): Promise<boolean> {
    try {
      if (!await fs.pathExists(configPath)) {
        return false;
      }
      const config = await fs.readJSON(configPath);
      // Consider config valid if it has any meaningful data
      return config && (
        (config.skills && Object.keys(config.skills).length > 0) ||
        (config.presets && config.presets.length > 0) ||
        (config.defaultExportPath && config.defaultExportPath.length > 0)
      );
    } catch (e) {
      // If we can't read or parse the config, it's not valid
      console.warn(`[ConfigService] Config file at ${configPath} is invalid:`, e);
      return false;
    }
  }

  /**
   * Validate config and fix any corruption issues.
   */
  private async validateAndFixConfig(): Promise<void> {
    // Ensure config has required structure
    if (!this.config.skills) {
      this.config.skills = {};
    }
    if (!this.config.presets) {
      this.config.presets = [];
    }
    if (!this.config.defaultExportPath) {
      this.config.defaultExportPath = '';
    }
    
    // Save if we had to fix the structure
    if (await fs.pathExists(this.configPath)) {
      try {
        const fileConfig = await fs.readJSON(this.configPath);
        if (!fileConfig.skills || !fileConfig.presets) {
          console.log('[ConfigService] Fixing corrupted config file');
          await this.saveConfig();
        }
      } catch (e) {
        console.error('[ConfigService] Config file is corrupted, reinitializing:', e);
        await this.saveConfig();
      }
    } else {
      // No config file exists, create initial one
      await this.saveConfig();
    }
  }

  /**
   * Load configuration from disk.
   */
  private async loadConfig(): Promise<void> {
    console.log(`[ConfigService] Loading config from: ${this.configPath}`);
    if (await fs.pathExists(this.configPath)) {
      try {
        const stored = await fs.readJSON(this.configPath);
        this.config = { ...this.config, ...stored };
        console.log(`[ConfigService] Config loaded successfully: ${Object.keys(stored.skills || {}).length} skills, ${(stored.presets || []).length} presets`);
      } catch (e) {
        console.error('[ConfigService] Failed to load config, will use default:', e);
        // Keep default config initialized in constructor
      }
    } else {
      console.log('[ConfigService] No config file found, will create new one');
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
