/**
 * Import Skills View
 */

import { WebviewState, VSCodeAPI, Skill } from '../types';
import { el, clear, parseTags, icon, iconButton } from '../utils';

export function renderImportView(root: HTMLElement, state: WebviewState, vscode: VSCodeAPI): void {
  clear(root);

  // Top actions section
  const actionsContainer = el('div', { class: 'stack' });
  
  // Row 1: Main scan buttons
  const row1 = el('div', { class: 'row' });
  
  const btnScan = iconButton('refresh', 'Scan Global + Workspace', 'primary');
  btnScan.addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
  row1.appendChild(btnScan);

  const btnScanFolder = iconButton('folder-opened', 'Import from folder', 'secondary');
  btnScanFolder.addEventListener('click', () => vscode.postMessage({ type: 'scanCustomPath' }));
  row1.appendChild(btnScanFolder);

  const btnImportBundle = iconButton('file-zip', 'Import bundle', 'secondary');
  btnImportBundle.addEventListener('click', () => vscode.postMessage({ type: 'importBundle' }));
  row1.appendChild(btnImportBundle);
  
  actionsContainer.appendChild(row1);

  // Row 2: GitHub import
  const row2 = el('div', { class: 'row' });
  const btnScanGh = iconButton('github', 'Import from GitHub', 'secondary');
  btnScanGh.addEventListener('click', () => {
    const existing = actionsContainer.querySelector('.github-input-row');
    if (existing) {
      const input = existing.querySelector('input');
      if (input) input.focus();
      return;
    }

    const inputRow = el('div', { class: 'row github-input-row', style: 'margin-top: 8px;' });
    const input = el('input', {
      type: 'text',
      placeholder: 'https://github.com/owner/repo',
      class: 'grow'
    }) as HTMLInputElement;
    const submit = iconButton('search', 'Scan', 'secondary');
    const cancel = iconButton('close', 'Cancel', 'secondary');

    function cleanup() {
      if (actionsContainer.contains(inputRow)) {
        actionsContainer.removeChild(inputRow);
      }
    }

    function submitUrl() {
      const url = input.value.trim();
      if (!url) return;
      vscode.postMessage({ type: 'scanGitHub', url });
      cleanup();
    }

    submit.addEventListener('click', submitUrl);
    cancel.addEventListener('click', cleanup);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitUrl();
      if (e.key === 'Escape') cleanup();
    });

    inputRow.appendChild(input);
    inputRow.appendChild(submit);
    inputRow.appendChild(cancel);
    actionsContainer.appendChild(inputRow);
    setTimeout(() => input.focus(), 10);
  });
  row2.appendChild(btnScanGh);
  actionsContainer.appendChild(row2);
  actionsContainer.appendChild(el('hr'));
  root.appendChild(actionsContainer);

  // Skills container
  const container = el('div', { class: 'stack' });
  root.appendChild(container);

  if (!state.discovered.length) {
    const emptyState = el('div', { class: 'empty' });
    emptyState.appendChild(icon('inbox', 'codicon-large'));
    emptyState.appendChild(el('div', { class: 'muted', text: 'No discovered skills yet. Use Scan or Import buttons above.' }));
    container.appendChild(emptyState);
    return;
  }

  // Bulk actions row
  const bulkRow = el('div', { class: 'row', style: 'margin-bottom: 12px;' });
  const checkAll = el('input', { type: 'checkbox' }) as HTMLInputElement;
  checkAll.addEventListener('change', () => {
    const checked = checkAll.checked;
    root.querySelectorAll('.item-check').forEach((cb) => {
      (cb as HTMLInputElement).checked = checked;
    });
  });
  bulkRow.appendChild(checkAll);
  bulkRow.appendChild(el('span', { class: 'select-all-label', text: 'Select All' }));

  const btnImportAll = iconButton('cloud-download', 'Import Selected', 'secondary');
  btnImportAll.addEventListener('click', () => {
    const items: Array<{ skill: Skill; tags: string[] }> = [];
    root.querySelectorAll('.item-check:checked').forEach((cb) => {
      const idx = parseInt((cb as HTMLInputElement).dataset.index || '0');
      if (!state.discovered[idx]) return;
      const skill = state.discovered[idx];
      const tagInput = document.getElementById(`tags-${skill.md5}`) as HTMLInputElement | null;
      const tags = tagInput ? parseTags(tagInput.value) : [];
      items.push({ skill, tags });
    });
    if (items.length === 0) return;
    vscode.postMessage({ type: 'batchImportSkills', items, count: items.length });
  });
  bulkRow.appendChild(btnImportAll);
  container.appendChild(bulkRow);

  // Render each discovered skill
  state.discovered.forEach((skill, index) => {
    const importedByMd5 = state.imported.find((s) => s.md5 === skill.md5);
    const importedByName = state.imported.find((s) => s.name === skill.name);
    const nameConflict = !!importedByName && !importedByMd5;

    const item = el('div', { class: 'skill-item' });
    item.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.tagName.toLowerCase() === 'input' || target.tagName.toLowerCase() === 'button') {
        return;
      }
      const cb = item.querySelector('.item-check') as HTMLInputElement;
      if (cb) cb.checked = !cb.checked;
    });

    const header = el('div', { class: 'row' });
    const cb = el('input', {
      type: 'checkbox',
      class: 'item-check',
      'data-index': index
    }) as HTMLInputElement;
    header.appendChild(cb);
    header.appendChild(el('div', { class: 'skill-title', text: skill.name }));
    item.appendChild(header);

    item.appendChild(el('div', { class: 'muted', text: skill.description || '' }));

    const meta = el('div', { class: 'skill-meta' });
    if (skill.isRemote) {
      const badge = el('span', { class: 'badge badge-remote' });
      badge.appendChild(icon('github'));
      badge.appendChild(document.createTextNode(' GitHub'));
      meta.appendChild(badge);
    }
    if (importedByMd5) {
      const badge = el('span', { class: 'badge' });
      badge.appendChild(icon('check'));
      badge.appendChild(document.createTextNode(' Imported'));
      meta.appendChild(badge);
    } else if (nameConflict) {
      const badge = el('span', { class: 'badge' });
      badge.appendChild(icon('warning'));
      badge.appendChild(document.createTextNode(' Name conflict'));
      meta.appendChild(badge);
    }
    item.appendChild(meta);

    const row = el('div', { class: 'row' });
    const tagsField = el('input', {
      type: 'text',
      placeholder: 'tag1, tag2',
      class: 'grow',
      id: `tags-${skill.md5}`,
      value: importedByMd5?.tags?.join(', ') || ''
    }) as HTMLInputElement;
    row.appendChild(tagsField);

    const importBtn = iconButton(
      importedByMd5 ? 'sync' : 'cloud-download',
      importedByMd5 ? 'Re-import' : nameConflict ? 'Overwrite' : 'Import',
      importedByMd5 || nameConflict ? 'secondary' : 'primary'
    );
    importBtn.addEventListener('click', () => {
      vscode.postMessage({
        type: 'importSkill',
        skill,
        tags: parseTags(tagsField.value),
        isSingle: true
      });
    });
    row.appendChild(importBtn);
    item.appendChild(row);

    container.appendChild(item);
  });
}
