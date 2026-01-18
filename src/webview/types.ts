/**
 * Webview types and interfaces
 */

export interface Skill {
  id: string;
  name: string;
  description?: string;
  md5: string;
  tags?: string[];
  isRemote?: boolean;
  customName?: string;
  customDescription?: string;
}

export interface Preset {
  id: string;
  name: string;
  skillIds: string[];
}

export interface WebviewState {
  discovered: Skill[];
  imported: Skill[];
  presets: Preset[];
  defaultExportPath: string;
  storagePath: string;
}

export interface UIState {
  expandedPresetIds: Set<string>;
  selectedPresetId: string | null;
  tagFilter: string;
}

export type ViewType =
  | 'skillsWizard.importView'
  | 'skillsWizard.mySkillsView'
  | 'skillsWizard.presetsView'
  | 'skillsWizard.settingsView';

export interface MessageToExtension {
  type: string;
  [key: string]: any;
}

export interface VSCodeAPI {
  postMessage(message: MessageToExtension): void;
  getState(): any;
  setState(state: any): void;
}

declare global {
  interface Window {
    acquireVsCodeApi(): VSCodeAPI;
  }
}
