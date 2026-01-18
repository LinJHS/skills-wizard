/**
 * Presets View
 */

import { WebviewState, VSCodeAPI, UIState } from '../types';
import { el, clear, iconButton } from '../utils';
import { createSkillCard, createTagEditButton } from '../components/SkillCard';

export function renderPresetsView(
  root: HTMLElement,
  state: WebviewState,
  uiState: UIState,
  vscode: VSCodeAPI
): void {
  clear(root);
  const container = el('div', { class: 'stack' });
  root.appendChild(container);

  // Hint
  const hint = el('div', { class: 'hint', style: 'margin-bottom: 16px;' });
  hint.textContent = 'Tip: Go to My Skills, select skills, then click "Create preset"';
  container.appendChild(hint);

  // Search bar
  const searchRow = el('div', { class: 'row', style: 'margin-bottom: 12px;' });
  const searchInput = el('input', {
    type: 'text',
    placeholder: 'Search presets...',
    class: 'grow',
    id: 'search-presets'
  }) as HTMLInputElement;
  searchInput.addEventListener('input', () => {
    const term = searchInput.value.toLowerCase();
    const items = container.querySelectorAll('.preset-item');
    items.forEach((item) => {
      const presetName = (item as HTMLElement).dataset.presetName || '';
      (item as HTMLElement).style.display = presetName.toLowerCase().includes(term) ? 'block' : 'none';
    });
  });
  searchRow.appendChild(searchInput);
  container.appendChild(searchRow);

  // Bulk export row
  const bulkRow = el('div', { class: 'row', style: 'margin-bottom: 12px;' });
  const checkAll = el('input', { type: 'checkbox' }) as HTMLInputElement;
  checkAll.addEventListener('change', () => {
    const checked = checkAll.checked;
    root.querySelectorAll('.preset-check').forEach((cb) => {
      (cb as HTMLInputElement).checked = checked;
    });
  });
  bulkRow.appendChild(checkAll);
  bulkRow.appendChild(el('span', { class: 'select-all-label', text: 'Select All' }));

  const exportSelected = iconButton('export', 'Export (zip)', 'secondary');
  exportSelected.addEventListener('click', () => {
    const selectedIds: string[] = [];
    root.querySelectorAll('.preset-check:checked').forEach((cb) => {
      const presetId = (cb as HTMLInputElement).dataset.presetId;
      if (presetId) selectedIds.push(presetId);
    });
    if (selectedIds.length === 0) {
      alert('Please select at least one preset to export.');
      return;
    }
    vscode.postMessage({ type: 'exportPresetsZip', ids: selectedIds });
  });
  bulkRow.appendChild(exportSelected);

  const deleteSelected = iconButton('trash', 'Delete Selected', 'secondary');
  deleteSelected.addEventListener('click', () => {
    const selectedIds: string[] = [];
    root.querySelectorAll('.preset-check:checked').forEach((cb) => {
      const presetId = (cb as HTMLInputElement).dataset.presetId;
      if (presetId) selectedIds.push(presetId);
    });
    if (selectedIds.length === 0) {
      alert('Please select at least one preset to delete.');
      return;
    }
    vscode.postMessage({ type: 'requestBatchDeletePresets', ids: selectedIds });
  });
  bulkRow.appendChild(deleteSelected);
  container.appendChild(bulkRow);
  container.appendChild(el('hr'));

  if (!state.presets.length) {
    const emptyState = el('div', { class: 'empty' });
    emptyState.appendChild(document.createElement('br'));
    const msg = el('div', { class: 'muted', text: 'No presets yet. Go to My Skills to create one.' });
    emptyState.appendChild(msg);
    container.appendChild(emptyState);
    return;
  }

  state.presets.forEach((preset, presetIdx) => {
    const block = el('div', {
      class: 'preset-item',
      'data-preset-name': preset.name,
      'data-preset-idx': String(presetIdx)
    });

    // Header row
    const headerRow = el('div', { class: 'row' });
    const presetCheck = el('input', {
      type: 'checkbox',
      class: 'preset-check',
      'data-preset-id': preset.id
    }) as HTMLInputElement;
    presetCheck.addEventListener('click', (e) => e.stopPropagation());
    headerRow.appendChild(presetCheck);
    
    const skillCount = (preset.skillIds || []).length;
    const nameText = el('div', {
      class: 'skill-title editable',
      text: `${preset.name} (${skillCount} skills)`
    });
    nameText.title = 'Click to edit name';
    nameText.addEventListener('click', (e) => {
      e.stopPropagation();
      nameText.style.display = 'none';
      const input = el('input', { type: 'text', value: preset.name, class: 'grow' }) as HTMLInputElement;
      let saved = false;
      
      input.addEventListener('blur', () => {
        if (!saved) {
          saved = true;
          saveName();
        }
      });
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          saved = true;
          saveName();
        }
        if (ev.key === 'Escape') {
          if (headerRow.contains(input)) headerRow.removeChild(input);
          nameText.style.display = 'block';
        }
      });
      
      function saveName() {
        const newName = input.value.trim();
        if (newName && newName !== preset.name) {
          vscode.postMessage({ type: 'updatePreset', preset: { ...preset, name: newName } });
        }
        if (headerRow.contains(input)) {
          headerRow.removeChild(input);
        }
        nameText.textContent = `${newName || preset.name} (${skillCount} skills)`;
        nameText.style.display = 'block';
      }
      
      headerRow.insertBefore(input, nameText);
      setTimeout(() => input.focus(), 10);
    });
    headerRow.appendChild(nameText);

    headerRow.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.tagName.toLowerCase() === 'input') return;
      const isSelected = block.classList.contains('selected');
      root.querySelectorAll('.preset-item').forEach((i) => {
        i.classList.remove('selected');
        i.classList.remove('expanded');
        const ab = i.querySelector('.preset-actions') as HTMLElement;
        if (ab) ab.style.display = 'none';
        const exp = i.querySelector('.preset-expanded') as HTMLElement;
        if (exp) exp.style.display = 'none';
      });
      if (!isSelected) {
        block.classList.add('selected');
        const ab = block.querySelector('.preset-actions') as HTMLElement;
        if (ab) ab.style.display = 'flex';
        uiState.selectedPresetId = preset.id;
      }
    });

    block.appendChild(headerRow);

    // Expanded section
    const expanded = el('div', { class: 'preset-expanded', style: 'display:none; margin-top:12px;' });
    const presetSkills = state.imported.filter((s) => (preset.skillIds || []).includes(s.id));

    if (presetSkills.length === 0) {
      expanded.appendChild(el('div', { class: 'muted', text: 'No skills in this preset.' }));
    } else {
      // Bulk actions for preset skills
      const presetBulkRow = el('div', { class: 'row', style: 'margin-bottom: 12px;' });
      const checkAllPreset = el('input', { type: 'checkbox' }) as HTMLInputElement;
      checkAllPreset.addEventListener('change', () => {
        const checked = checkAllPreset.checked;
        expanded.querySelectorAll('.preset-skill-check').forEach((cb) => {
          (cb as HTMLInputElement).checked = checked;
        });
      });
      presetBulkRow.appendChild(checkAllPreset);
      presetBulkRow.appendChild(el('span', { class: 'select-all-label', text: 'Select All' }));

      const btnRemoveFromPreset = iconButton('remove', 'Remove from preset', 'secondary');
      btnRemoveFromPreset.addEventListener('click', (e) => {
        e.stopPropagation();
        const selectedIds: string[] = [];
        expanded.querySelectorAll('.preset-skill-check:checked').forEach((cb) => {
          const skillId = (cb as HTMLInputElement).dataset.skillId;
          if (skillId) selectedIds.push(skillId);
        });
        if (selectedIds.length === 0) {
          alert('Please select at least one skill to remove.');
          return;
        }
        vscode.postMessage({ type: 'requestRemoveFromPreset', presetId: preset.id, skillIds: selectedIds });
      });
      presetBulkRow.appendChild(btnRemoveFromPreset);
      expanded.appendChild(presetBulkRow);

      presetSkills.forEach((skill) => {
        const { card: skillCard, actions, checkbox: cb } = createSkillCard(skill, vscode, {
          className: 'skill-card-mini',
          nameClass: 'skill-title-small editable',
          checkboxClass: 'preset-skill-check',
          actionBarClass: 'row action-bar',
          actionBarStyle: 'display:none; margin-top: 12px;'
        });

        skillCard.addEventListener('click', (e) => {
          const target = e.target as HTMLElement;
          if (target.tagName.toLowerCase() === 'input' || target.tagName.toLowerCase() === 'button') {
            return;
          }
          const isSelected = skillCard.classList.contains('selected');
          expanded.querySelectorAll('.skill-card-mini').forEach((card) => {
            card.classList.remove('selected');
            const ab = card.querySelector('.action-bar') as HTMLElement;
            if (ab) ab.style.display = 'none';
          });
          if (!isSelected) {
            skillCard.classList.add('selected');
            if (actions) actions.style.display = 'flex';
            if (cb) cb.checked = true;
          } else if (cb) {
            cb.checked = false;
          }
        });

        if (actions) {
          let tagsBtn: HTMLButtonElement;
          const removeBtn = iconButton('remove', 'Remove', 'secondary');
          removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            vscode.postMessage({ type: 'requestRemoveFromPreset', presetId: preset.id, skillIds: [skill.id] });
          });
          const viewBtn = iconButton('file-code', 'View files', 'secondary');
          viewBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            vscode.postMessage({ type: 'openSkillFile', id: skill.id });
          });
          const restoreActions = () => {
            if (!actions) return;
            clear(actions);
            if (tagsBtn) actions.appendChild(tagsBtn);
            actions.appendChild(viewBtn);
            actions.appendChild(removeBtn);
          };
          tagsBtn = createTagEditButton(skill, actions, restoreActions, vscode);
          restoreActions();
        }

        expanded.appendChild(skillCard);
      });
    }
    block.appendChild(expanded);

    // Preset-level Actions
    const actions = el('div', { class: 'row preset-actions', style: 'display:none; margin-top:12px;' });

    const btnEditSkills = iconButton('edit', 'Edit skills', 'secondary');
    btnEditSkills.addEventListener('click', (e) => {
      e.stopPropagation();
      const isExpanded = block.classList.contains('expanded');
      block.classList.toggle('expanded');
      expanded.style.display = isExpanded ? 'none' : 'block';
      btnEditSkills.textContent = '';
      btnEditSkills.appendChild(
        isExpanded
          ? iconButton('edit', 'Edit skills', 'secondary').querySelector('.codicon')!
          : iconButton('chevron-up', 'Hide skills', 'secondary').querySelector('.codicon')!
      );
      btnEditSkills.appendChild(document.createTextNode(isExpanded ? ' Edit skills' : ' Hide skills'));
      if (isExpanded) {
        uiState.expandedPresetIds.delete(preset.id);
      } else {
        uiState.expandedPresetIds.add(preset.id);
      }
    });
    actions.appendChild(btnEditSkills);

    const applyMerge = iconButton('layers', 'Apply (Merge)', 'primary');
    applyMerge.addEventListener('click', () =>
      vscode.postMessage({ type: 'applyPreset', id: preset.id, mode: 'merge' })
    );
    actions.appendChild(applyMerge);

    const applyReplace = iconButton('replace', 'Apply (Replace)', 'secondary');
    applyReplace.addEventListener('click', () =>
      vscode.postMessage({ type: 'applyPreset', id: preset.id, mode: 'replace' })
    );
    actions.appendChild(applyReplace);

    const exportOne = iconButton('export', 'Export', 'secondary');
    exportOne.addEventListener('click', () => vscode.postMessage({ type: 'exportPresetsZip', ids: [preset.id] }));
    actions.appendChild(exportOne);

    const del = iconButton('trash', 'Delete', 'secondary');
    del.addEventListener('click', () => vscode.postMessage({ type: 'requestDeletePreset', id: preset.id }));
    actions.appendChild(del);

    block.appendChild(actions);
    container.appendChild(block);

    const shouldExpand = uiState.expandedPresetIds.has(preset.id);
    if (shouldExpand) {
      block.classList.add('expanded');
      expanded.style.display = 'block';
      btnEditSkills.textContent = '';
      btnEditSkills.appendChild(iconButton('chevron-up', '', 'secondary').querySelector('.codicon')!);
      btnEditSkills.appendChild(document.createTextNode(' Hide skills'));
    }
    if (uiState.selectedPresetId === preset.id) {
      block.classList.add('selected');
      actions.style.display = 'flex';
    }
  });
}
