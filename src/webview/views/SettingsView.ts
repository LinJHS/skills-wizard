/**
 * Settings View
 */

import { WebviewState, VSCodeAPI } from '../types';
import { el, clear, iconButton } from '../utils';

export function renderSettingsView(root: HTMLElement, state: WebviewState, vscode: VSCodeAPI): void {
  clear(root);
  const container = el('div', { class: 'stack' });
  root.appendChild(container);

  const row1 = el('div', { class: 'stack', style: 'margin-bottom: 24px;' });
  const label1 = el('div', { text: 'Default Export Path', style: 'font-weight: 600; margin-bottom: 8px;' });
  const field1 = el('input', {
    type: 'text',
    value: state.defaultExportPath || '.claude/skills/',
    class: 'grow',
    id: 'setting-export-path'
  }) as HTMLInputElement;
  const help1 = el('div', {
    class: 'muted',
    text: 'Relative path where skills will be exported in the workspace.',
    style: 'margin-top: 6px;'
  });
  row1.appendChild(label1);
  row1.appendChild(field1);
  row1.appendChild(help1);
  container.appendChild(row1);

  const row2 = el('div', { class: 'stack', style: 'margin-bottom: 24px;' });
  const label2 = el('div', { text: 'Storage Path', style: 'font-weight: 600; margin-bottom: 8px;' });
  const field2 = el('input', {
    type: 'text',
    value: state.storagePath || '',
    class: 'grow',
    placeholder: '(empty = default profile storage)',
    id: 'setting-storage-path'
  }) as HTMLInputElement;
  const help2 = el('div', {
    class: 'muted',
    text: 'Custom storage path for imported skills & presets. Leave empty to use default.',
    style: 'margin-top: 6px;'
  });
  row2.appendChild(label2);
  row2.appendChild(field2);
  row2.appendChild(help2);
  container.appendChild(row2);

  const btnSave = iconButton('save', 'Save Settings', 'primary');
  btnSave.addEventListener('click', () => {
    vscode.postMessage({
      type: 'updateSettings',
      defaultExportPath: field1.value,
      storagePath: field2.value
    });
  });
  container.appendChild(btnSave);
}
