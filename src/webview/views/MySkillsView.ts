/**
 * My Skills View
 */

import { WebviewState, VSCodeAPI } from '../types';
import { el, clear, iconButton } from '../utils';
import { createSkillCard, createTagEditButton } from '../components/SkillCard';

export function renderMySkillsView(root: HTMLElement, state: WebviewState, vscode: VSCodeAPI): void {
  clear(root);
  const container = el('div', { class: 'stack' });
  root.appendChild(container);

  if (!state.imported.length) {
    const emptyState = el('div', { class: 'empty' });
    emptyState.appendChild(document.createElement('br'));
    const msg = el('div', { class: 'muted', text: 'No imported skills yet.' });
    emptyState.appendChild(msg);
    container.appendChild(emptyState);
    return;
  }

  // Search bar
  const searchRow = el('div', { class: 'row', style: 'margin-bottom: 12px;' });
  const searchInput = el('input', {
    type: 'text',
    placeholder: 'Search skills...',
    class: 'grow',
    id: 'search-my-skills'
  }) as HTMLInputElement;

  function applyMySkillsFilters() {
    const term = searchInput.value.toLowerCase();
    const tag = tagSelect.value;
    const items = container.querySelectorAll('.skill-item');
    items.forEach((item) => {
      const originalIdx = parseInt((item as HTMLElement).dataset.originalIndex || '0');
      const skill = state.imported[originalIdx];
      if (!skill) return;
      const matchesTerm =
        !term ||
        skill.name.toLowerCase().includes(term) ||
        (skill.description || '').toLowerCase().includes(term) ||
        (skill.tags || []).some((t) => t.toLowerCase().includes(term));
      const matchesTag = tag === 'all' || (skill.tags || []).includes(tag);
      (item as HTMLElement).style.display = matchesTerm && matchesTag ? 'block' : 'none';
    });
  }

  searchInput.addEventListener('input', applyMySkillsFilters);
  searchRow.appendChild(searchInput);
  container.appendChild(searchRow);

  // Tag filter
  const tagRow = el('div', { class: 'row', style: 'margin-bottom: 12px;' });
  tagRow.appendChild(el('span', { text: 'Filter by tag:' }));
  const tagSelect = el('select', { class: 'grow' }) as HTMLSelectElement;
  const uniqueTags = Array.from(
    new Set(state.imported.flatMap((s) => (Array.isArray(s.tags) ? s.tags : [])))
  ).sort();
  tagSelect.appendChild(el('option', { value: 'all', text: 'All tags' }));
  uniqueTags.forEach((tag) => {
    tagSelect.appendChild(el('option', { value: tag, text: tag }));
  });
  tagSelect.value = 'all';
  tagSelect.addEventListener('change', applyMySkillsFilters);
  tagRow.appendChild(tagSelect);
  container.appendChild(tagRow);

  // Bulk actions
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

  const btnDeleteAll = iconButton('trash', 'Delete Selected', 'secondary');
  btnDeleteAll.addEventListener('click', () => {
    const selectedIds: string[] = [];
    root.querySelectorAll('.item-check:checked').forEach((cb) => {
      const skillId = (cb as HTMLInputElement).dataset.skillId;
      if (skillId) selectedIds.push(skillId);
    });
    if (selectedIds.length === 0) {
      alert('Please select at least one skill to delete.');
      return;
    }
    vscode.postMessage({ type: 'requestBatchDeleteSkills', ids: selectedIds });
  });
  bulkRow.appendChild(btnDeleteAll);

  const btnExportSelected = iconButton('export', 'Export (zip)', 'secondary');
  btnExportSelected.addEventListener('click', () => {
    const selectedIds: string[] = [];
    root.querySelectorAll('.item-check:checked').forEach((cb) => {
      const skillId = (cb as HTMLInputElement).dataset.skillId;
      if (skillId) selectedIds.push(skillId);
    });
    if (selectedIds.length === 0) {
      alert('Please select at least one skill to export.');
      return;
    }
    vscode.postMessage({ type: 'exportSkillsZip', ids: selectedIds });
  });
  bulkRow.appendChild(btnExportSelected);

  const btnCreatePresetFromSelected = iconButton('layers', 'Create preset', 'secondary');
  btnCreatePresetFromSelected.addEventListener('click', (e) => {
    e.stopPropagation();
    const selectedIds: string[] = [];
    root.querySelectorAll('.item-check:checked').forEach((cb) => {
      const skillId = (cb as HTMLInputElement).dataset.skillId;
      if (skillId) selectedIds.push(skillId);
    });
    if (selectedIds.length === 0) {
      alert('Please select at least one skill first.');
      return;
    }

    const existing = container.querySelector('.preset-name-overlay');
    if (existing) container.removeChild(existing);

    const overlay = el('div', {
      class: 'preset-name-overlay row',
      style: 'margin: 12px 0; background: var(--vscode-input-background); padding: 12px; border-radius: 4px;'
    });
    const nameInput = el('input', { type: 'text', placeholder: 'Preset name', class: 'grow' }) as HTMLInputElement;
    const btnSave = iconButton('check', 'Create', 'primary');
    btnSave.addEventListener('click', () => save());
    const btnCancel = iconButton('close', 'Cancel', 'secondary');
    btnCancel.addEventListener('click', () => {
      const overlayEl = container.querySelector('.preset-name-overlay');
      if (overlayEl) container.removeChild(overlayEl);
    });

    nameInput.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') save();
      if (ev.key === 'Escape') {
        const overlayEl = container.querySelector('.preset-name-overlay');
        if (overlayEl) container.removeChild(overlayEl);
      }
    });

    function save() {
      const name = nameInput.value.trim();
      if (!name) return;
      vscode.postMessage({ type: 'createPresetWithSkills', name, skillIds: selectedIds });
      const overlayEl = container.querySelector('.preset-name-overlay');
      if (overlayEl) container.removeChild(overlayEl);
    }

    overlay.appendChild(nameInput);
    overlay.appendChild(btnSave);
    overlay.appendChild(btnCancel);
    if (bulkRow.nextSibling) {
      container.insertBefore(overlay, bulkRow.nextSibling);
    } else {
      container.appendChild(overlay);
    }
    setTimeout(() => nameInput.focus(), 50);
  });
  bulkRow.appendChild(btnCreatePresetFromSelected);

  container.appendChild(bulkRow);

  // Render all skills
  state.imported.forEach((skill, originalIndex) => {
    const { card: item, actions, checkbox: cb } = createSkillCard(skill, vscode, {
      className: 'skill-item',
      checkboxClass: 'item-check',
      actionBarStyle: 'display:none; margin-top: 12px;'
    });
    (item as any).dataset.skillId = skill.id;
    (item as any).dataset.originalIndex = String(originalIndex);

    item.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.tagName.toLowerCase() === 'input' || target.tagName.toLowerCase() === 'button') {
        return;
      }
      const isSelected = item.classList.contains('selected');
      root.querySelectorAll('.skill-item').forEach((i) => {
        i.classList.remove('selected');
        const ab = i.querySelector('.action-bar') as HTMLElement;
        if (ab) ab.style.display = 'none';
      });
      if (!isSelected) {
        item.classList.add('selected');
        if (actions) actions.style.display = 'flex';
        if (cb) cb.checked = true;
      } else {
        if (actions) actions.style.display = 'none';
        if (cb) cb.checked = false;
      }
    });

    if (actions) {
      const addBtn = iconButton('plus', 'Add to workspace', 'primary');
      addBtn.addEventListener('click', () => vscode.postMessage({ type: 'addToWorkspace', id: skill.id }));

      const viewBtn = iconButton('file-code', 'View files', 'secondary');
      viewBtn.addEventListener('click', () => vscode.postMessage({ type: 'openSkillFile', id: skill.id }));

      const delBtn = iconButton('trash', 'Delete', 'secondary');
      delBtn.addEventListener('click', () => vscode.postMessage({ type: 'requestDeleteSkill', id: skill.id }));

      let tagsBtn: HTMLButtonElement;
      const restoreActions = () => {
        if (!actions) return;
        clear(actions);
        actions.appendChild(addBtn);
        actions.appendChild(viewBtn);
        if (tagsBtn) actions.appendChild(tagsBtn);
        actions.appendChild(delBtn);
      };

      tagsBtn = createTagEditButton(skill, actions, restoreActions, vscode);
      restoreActions();
    }

    container.appendChild(item);
  });
  
  applyMySkillsFilters();
}
