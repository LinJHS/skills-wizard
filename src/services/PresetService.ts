import { Preset } from '../models/types';
import { ConfigService } from './ConfigService';
import { FileService } from './FileService';
import { ScanService } from './ScanService';

/**
 * PresetService
 * Responsible for CRUD operations on presets.
 */
export class PresetService {
  private configService: ConfigService;
  private fileService: FileService;
  private scanService: ScanService;

  constructor(configService: ConfigService, fileService: FileService, scanService: ScanService) {
    this.configService = configService;
    this.fileService = fileService;
    this.scanService = scanService;
  }

  /**
   * Get all presets.
   */
  public getPresets(): Preset[] {
    const config = this.configService.getConfig();
    return config.presets || [];
  }

  /**
   * Get a preset by ID.
   */
  public getPresetById(presetId: string): Preset | undefined {
    const config = this.configService.getConfig();
    return (config.presets || []).find(p => p.id === presetId);
  }

  /**
   * Save a preset (create or update).
   */
  public async savePreset(preset: Preset, options: { allowOverwrite?: boolean } = {}): Promise<void> {
    await this.configService.ensureReady();
    const config = this.configService.getConfig();
    const imported = await this.scanService.getImportedSkills();
    const isNew = !config.presets.some(p => p.id === preset.id);
    
    if (isNew && imported.length < 1) {
      throw new Error('Create preset requires at least 1 imported skill');
    }
    
    const name = preset.name?.trim();
    if (!name) {
      throw new Error('Preset name cannot be empty');
    }
    
    const desired = this.fileService.normalizeName(name);
    const conflict = (config.presets || []).find(
      p => p.id !== preset.id && this.fileService.normalizeName(p.name) === desired
    );
    if (conflict) {
      if (!options.allowOverwrite) {
        throw new Error(`Preset name "${name}" already exists`);
      }
      config.presets = config.presets.filter(p => p.id !== conflict.id);
    }
    
    preset = { ...preset, name };
    const index = config.presets.findIndex(p => p.id === preset.id);
    if (index >= 0) {
      config.presets[index] = preset;
    } else {
      config.presets.push(preset);
    }
    await this.configService.saveConfig();
  }

  /**
   * Delete a preset.
   */
  public async deletePreset(presetId: string): Promise<void> {
    await this.configService.ensureReady();
    const config = this.configService.getConfig();
    config.presets = config.presets.filter(p => p.id !== presetId);
    await this.configService.saveConfig();
  }

  /**
   * Remove skills from a preset.
   */
  public async removeSkillsFromPreset(presetId: string, skillIds: string[]): Promise<void> {
    await this.configService.ensureReady();
    const config = this.configService.getConfig();
    const preset = config.presets.find(p => p.id === presetId);
    if (!preset) {
      return;
    }
    const next: Preset = {
      ...preset,
      skillIds: (preset.skillIds || []).filter(id => !skillIds.includes(id))
    };
    await this.savePreset(next);
  }

  /**
   * Add skills to a preset.
   */
  public async addSkillsToPreset(presetId: string, skillIds: string[]): Promise<void> {
    await this.configService.ensureReady();
    const config = this.configService.getConfig();
    const preset = config.presets.find(p => p.id === presetId);
    if (!preset) {
      throw new Error('Preset not found');
    }
    const currentSkillIds = new Set(preset.skillIds || []);
    for (const id of skillIds) {
      currentSkillIds.add(id);
    }
    const next: Preset = {
      ...preset,
      skillIds: Array.from(currentSkillIds)
    };
    await this.savePreset(next);
  }
}
