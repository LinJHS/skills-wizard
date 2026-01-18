/**
 * Main webview entry point
 */

import { WebviewState, UIState, ViewType, VSCodeAPI } from './types';
import { renderImportView } from './views/ImportView';
import { renderMySkillsView } from './views/MySkillsView';
import { renderPresetsView } from './views/PresetsView';
import { renderSettingsView } from './views/SettingsView';

// Acquire VS Code API
const vscode: VSCodeAPI = window.acquireVsCodeApi();

// State
let state: WebviewState = {
  discovered: [],
  imported: [],
  presets: [],
  defaultExportPath: '.claude/skills/',
  storagePath: '',
};

const uiState: UIState = {
  expandedPresetIds: new Set(),
  selectedPresetId: null,
  tagFilter: 'all',
};

/**
 * Get the current view type from body data attribute
 */
function getViewType(): ViewType {
  return (document.body.getAttribute('data-view') as ViewType) || 'skillsWizard.importView';
}

/**
 * Render all views
 */
function renderAll(): void {
  const viewType = getViewType();
  const root = document.getElementById('app-root');
  if (!root) return;

  if (viewType === 'skillsWizard.importView') {
    renderImportView(root, state, vscode);
  } else if (viewType === 'skillsWizard.mySkillsView') {
    renderMySkillsView(root, state, vscode);
  } else if (viewType === 'skillsWizard.presetsView') {
    renderPresetsView(root, state, uiState, vscode);
  } else if (viewType === 'skillsWizard.settingsView') {
    renderSettingsView(root, state, vscode);
  }
}

/**
 * Handle messages from extension
 */
window.addEventListener('message', (event) => {
  const message = event.data;

  if (message?.type === 'state') {
    state = {
      discovered: message.discovered ?? [],
      imported: message.imported ?? [],
      presets: message.presets ?? [],
      defaultExportPath: message.defaultExportPath ?? '.claude/skills/',
      storagePath: message.storagePath ?? '',
    };
    renderAll();
  }
});

/**
 * Signal webview is ready
 */
window.addEventListener('load', () => {
  vscode.postMessage({ type: 'webviewReady' });
});

// Initial load
vscode.postMessage({ type: 'refresh' });
