// @ts-check

const vscode = acquireVsCodeApi();

/** @type {{ discovered:any[]; imported:any[]; presets:any[]; defaultExportPath:string; storagePath:string }} */
let state = {
  discovered: [],
  imported: [],
  presets: [],
  defaultExportPath: '.claude/skills/',
  storagePath: '',
};

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

function getViewType() {
  return document.body.getAttribute('data-view') || 'skillsWizard.importView';
}

function parseTags(text) {
  return String(text || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    if (k === 'text') {
      node.textContent = String(v);
    } else if (k === 'class') {
      node.className = String(v);
    } else if (k === 'style') {
      node.style.cssText = String(v);
    } else if (k.startsWith('data-')) {
      // Handle data-* attributes via dataset
      const dataKey = k.slice(5).replace(/-([a-z])/g, (g) => g[1].toUpperCase()); // kebab to camel
      node.dataset[dataKey] = String(v);
    } else {
      node.setAttribute(k, String(v));
    }
  }
  if (Array.isArray(children)) {
    for (const c of children) node.appendChild(c);
  }
  return node;
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function renderAll() {
  const viewType = getViewType();
  const root = document.getElementById('app-root');
  if (!root) return;
  clear(root);

  if (viewType === 'skillsWizard.importView') {
    renderImportView(root);
  } else if (viewType === 'skillsWizard.mySkillsView') {
    renderMySkillsView(root);
  } else if (viewType === 'skillsWizard.presetsView') {
    renderPresetsView(root);
  } else if (viewType === 'skillsWizard.settingsView') {
    renderSettingsView(root);
  }
}

function renderImportView(root) {
  // Top actions
  const actions = el('div', { class: 'stack' });
  const row1 = el('div', { class: 'row' });
  
  const btnScan = el('vscode-button');
  btnScan.textContent = 'Scan (Global + Workspace)';
  btnScan.addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
  row1.appendChild(btnScan);

  const btnScanFolder = el('vscode-button', { appearance: 'secondary' });
  btnScanFolder.textContent = 'Import from folder…';
  btnScanFolder.addEventListener('click', () => vscode.postMessage({ type: 'scanCustomPath' }));
  row1.appendChild(btnScanFolder);
  actions.appendChild(row1);

  const row2 = el('div', { class: 'row' });
  const ghInput = el('vscode-text-field', { placeholder: 'https://github.com/owner/repo', class: 'grow' });
  row2.appendChild(ghInput);
  
  const btnScanGh = el('vscode-button', { appearance: 'secondary' });
  btnScanGh.textContent = 'Import from GitHub';
  btnScanGh.addEventListener('click', () => {
    if (ghInput.value) vscode.postMessage({ type: 'scanGitHub', url: ghInput.value });
  });
  row2.appendChild(btnScanGh);
  actions.appendChild(row2);
  actions.appendChild(el('vscode-divider'));
  root.appendChild(actions);

  const container = el('div', { class: 'stack' });
  root.appendChild(container);

  if (!state.discovered.length) {
    container.appendChild(el('div', { class: 'empty muted', text: 'No discovered skills yet. Use Scan / Import to find skills.' }));
    return;
  }

  // Bulk actions row
  const bulkRow = el('div', { class: 'row', style: 'margin-bottom: 8px;' });
  const checkAll = el('vscode-checkbox');
  checkAll.addEventListener('change', () => {
    const checked = checkAll.checked;
    root.querySelectorAll('.item-check').forEach(cb => cb.checked = checked);
  });
  bulkRow.appendChild(checkAll);
  
  const btnImportAll = el('vscode-button', { appearance: 'secondary' });
  btnImportAll.textContent = 'Import Selected';
  btnImportAll.addEventListener('click', () => {
    const selected = [];
    root.querySelectorAll('.item-check:checked').forEach(cb => {
      const idx = parseInt(cb.dataset.index);
      if (state.discovered[idx]) selected.push(state.discovered[idx]);
    });
    if (selected.length === 0) return;
    // Sequential import or batch? For now sequential messages
    selected.forEach(skill => {
        // Find tags input for this item
        const tagInput = document.getElementById(`tags-${skill.md5}`);
        const tags = tagInput ? parseTags(tagInput.value) : [];
        vscode.postMessage({ type: 'importSkill', skill, tags });
    });
  });
  bulkRow.appendChild(btnImportAll);
  container.appendChild(bulkRow);

  state.discovered.forEach((skill, index) => {
    const importedByMd5 = state.imported.find((s) => s.md5 === skill.md5);
    const importedByName = state.imported.find((s) => s.name === skill.name);
    const nameConflict = !!importedByName && !importedByMd5;

    const item = el('div', { class: 'skill-item' });
    // Click to toggle checkbox
    item.addEventListener('click', (e) => {
      if (e.target.tagName.toLowerCase().includes('input') || e.target.tagName.toLowerCase().includes('button')) return;
      const cb = item.querySelector('.item-check');
      cb.checked = !cb.checked;
    });

    const header = el('div', { class: 'row' });
    const cb = el('vscode-checkbox', { class: 'item-check', 'data-index': index });
    header.appendChild(cb);
    header.appendChild(el('div', { class: 'skill-title', text: skill.name }));
    item.appendChild(header);

    item.appendChild(el('div', { class: 'muted', text: skill.description || '' }));

    const meta = el('div', { class: 'skill-meta' });
    if (skill.isRemote) {
      meta.appendChild(el('vscode-badge', { text: 'GitHub' }));
    }
    if (importedByMd5) {
      meta.appendChild(el('vscode-badge', { text: 'Imported' }));
    } else if (nameConflict) {
      meta.appendChild(el('vscode-badge', { text: 'Name conflict' }));
    }
    item.appendChild(meta);

    const row = el('div', { class: 'row' });
    const tagsField = el('vscode-text-field', { placeholder: 'tag1, tag2', class: 'grow', id: `tags-${skill.md5}` });
    tagsField.value = importedByMd5?.tags?.join(', ') || '';
    row.appendChild(tagsField);

    const importBtn = el('vscode-button', { appearance: importedByMd5 || nameConflict ? 'secondary' : 'primary' });
    importBtn.textContent = importedByMd5 ? 'Re-import' : nameConflict ? 'Overwrite' : 'Import';
    importBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'importSkill', skill, tags: parseTags(tagsField.value) });
    });
    row.appendChild(importBtn);
    item.appendChild(row);

    container.appendChild(item);
  });
}

function renderMySkillsView(root) {
  const container = el('div', { class: 'stack' });
  root.appendChild(container);

  if (!state.imported.length) {
    container.appendChild(el('div', { class: 'empty muted', text: 'No imported skills yet.' }));
    return;
  }

  // Bulk actions
  const bulkRow = el('div', { class: 'row', style: 'margin-bottom: 8px;' });
  const checkAll = el('vscode-checkbox');
  checkAll.addEventListener('change', () => {
    const checked = checkAll.checked;
    root.querySelectorAll('.item-check').forEach(cb => {
        cb.checked = checked;
        // Also trigger selection logic
        const item = cb.closest('.skill-item');
        if (checked) item.classList.add('selected');
        else item.classList.remove('selected');
    });
  });
  bulkRow.appendChild(checkAll);
  
  const btnDeleteAll = el('vscode-button', { appearance: 'secondary' });
  btnDeleteAll.textContent = 'Delete Selected';
  btnDeleteAll.addEventListener('click', () => {
    const selectedIds = [];
    root.querySelectorAll('.item-check:checked').forEach(cb => {
      const skillId = cb.dataset.skillId;
      if (skillId) selectedIds.push(skillId);
    });
    if (selectedIds.length === 0) return;
    if (confirm(`Delete ${selectedIds.length} skills?`)) {
        // Send batch delete message - backend will handle sequentially
        vscode.postMessage({ type: 'batchDeleteSkills', ids: selectedIds });
    }
  });
  bulkRow.appendChild(btnDeleteAll);

  // Create Preset from Selected button
  const btnCreatePresetFromSelected = el('vscode-button', { appearance: 'secondary' });
  btnCreatePresetFromSelected.textContent = 'Create preset';
  btnCreatePresetFromSelected.addEventListener('click', () => {
    const selectedIds = [];
    root.querySelectorAll('.item-check:checked').forEach(cb => {
      const skillId = cb.dataset.skillId;
      if (skillId) selectedIds.push(skillId);
    });
    if (selectedIds.length === 0) return;
    
    // Show inline input for preset name (original place)
    const overlay = el('div', { class: 'row', style: 'margin: 8px 0; background: var(--vscode-input-background); padding: 8px; border-radius: 4px;' });
    const nameInput = el('vscode-text-field', { placeholder: 'Preset name', class: 'grow' });
    const btnSave = el('vscode-button');
    btnSave.textContent = 'Create';
    btnSave.addEventListener('click', () => save());
    const btnCancel = el('vscode-button', { appearance: 'secondary' });
    btnCancel.textContent = 'Cancel';
    btnCancel.addEventListener('click', () => container.removeChild(overlay));
    
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    
    function save() {
      const name = nameInput.value.trim();
      if (!name) return;
      vscode.postMessage({ type: 'createPresetWithSkills', name, skillIds: selectedIds });
      container.removeChild(overlay);
    }
    
    overlay.appendChild(nameInput);
    overlay.appendChild(btnSave);
    overlay.appendChild(btnCancel);
    container.insertBefore(overlay, bulkRow.nextSibling); // Insert right after bulkRow
    nameInput.focus();
  });
  bulkRow.appendChild(btnCreatePresetFromSelected);
  
  // Search bar
  const searchRow = el('div', { class: 'row', style: 'margin-bottom: 8px;' });
  const searchInput = el('vscode-text-field', { placeholder: 'Search skills...', class: 'grow', id: 'search-my-skills' });
  searchInput.addEventListener('input', () => {
    // Re-render just the filtered list
    const term = searchInput.value.toLowerCase();
    const items = container.querySelectorAll('.skill-item');
    items.forEach((item, idx) => {
      const skill = state.imported[idx];
      if (!skill) return;
      const matches = !term || 
        skill.name.toLowerCase().includes(term) ||
        (skill.description || '').toLowerCase().includes(term) ||
        (skill.tags || []).some(t => t.toLowerCase().includes(term));
      item.style.display = matches ? 'block' : 'none';
    });
  });
  searchRow.appendChild(searchInput);
  container.appendChild(searchRow);
  container.appendChild(bulkRow);

  // Render all items (search filter applied live above)
  const searchTerm = '';
  state.imported.forEach((skill, index) => {
    const item = el('div', { class: 'skill-item', 'data-skill-id': skill.id });
    
    // Header with checkbox and title
    const header = el('div', { class: 'row' });
    const cb = el('vscode-checkbox', { class: 'item-check', 'data-index': index, 'data-skill-id': skill.id });
    header.appendChild(cb);
    header.appendChild(el('div', { class: 'skill-title', text: skill.name }));
    item.appendChild(header);

    // Click to select/toggle action bar
    item.addEventListener('click', (e) => {
      if (e.target.tagName.toLowerCase().includes('input') || e.target.tagName.toLowerCase().includes('button') || e.target.tagName.toLowerCase().includes('vscode-')) return;
      // Toggle selection visual
      const isSelected = item.classList.contains('selected');
      // Deselect all others
      root.querySelectorAll('.skill-item').forEach(i => {
          i.classList.remove('selected');
          const ab = i.querySelector('.action-bar');
          if (ab) ab.style.display = 'none';
      });
      
      if (!isSelected) {
          item.classList.add('selected');
          const ab = item.querySelector('.action-bar');
          if (ab) ab.style.display = 'flex';
          // Show add-tags placeholder when selected
          const addTagsPlaceholder = item.querySelector('.add-tags-placeholder');
          if (addTagsPlaceholder) addTagsPlaceholder.style.display = 'flex';
          cb.checked = true;
      } else {
          const addTagsPlaceholder = item.querySelector('.add-tags-placeholder');
          if (addTagsPlaceholder) addTagsPlaceholder.style.display = 'none';
          cb.checked = false;
      }
    });

    // Description (Inline Edit)
    const descRow = el('div', { class: 'row' });
    const descText = el('div', { class: 'muted editable', text: skill.description || '(no description)' });
    descText.title = 'Click to edit description';
    descText.addEventListener('click', () => {
        descText.style.display = 'none';
        const input = el('vscode-text-field', { value: skill.description || '' });
        input.addEventListener('blur', () => saveDesc());
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveDesc(); });
        function saveDesc() {
            if (input.value !== (skill.description || '')) {
                vscode.postMessage({ type: 'updateSkillMetadata', id: skill.id, customDescription: input.value });
            }
            descRow.removeChild(input);
            descText.textContent = input.value || '(no description)';
            descText.style.display = 'block';
        }
        descRow.appendChild(input);
        input.focus();
    });
    descRow.appendChild(descText);
    item.appendChild(descRow);

    // Tags (Inline Edit) - only show "Add tags" when item is selected
    const tagsWrap = el('div', { class: 'skill-meta editable' });
    if (skill.tags && skill.tags.length > 0) {
        for (const t of skill.tags) {
            const tag = el('vscode-tag');
            tag.textContent = t;
            tagsWrap.appendChild(tag);
        }
        tagsWrap.title = 'Click to edit tags';
    } else {
        // Don't show "Add tags" unless selected
        tagsWrap.className = 'skill-meta add-tags-placeholder';
        tagsWrap.style.display = 'none'; // Hide by default
        tagsWrap.textContent = '+ Add tags';
        tagsWrap.title = 'Click to add tags';
    }
    tagsWrap.addEventListener('click', () => {
        tagsWrap.style.display = 'none';
        const input = el('vscode-text-field', { value: (skill.tags || []).join(', ') });
        input.addEventListener('blur', () => saveTags());
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveTags(); });
        function saveTags() {
            const newTags = parseTags(input.value);
            // Simple check if changed
            if (JSON.stringify(newTags) !== JSON.stringify(skill.tags || [])) {
                vscode.postMessage({ type: 'updateSkillMetadata', id: skill.id, tags: newTags });
            }
            item.removeChild(input);
            tagsWrap.style.display = 'flex'; // Restore flex
            // Re-render handled by state update, but for instant feedback:
            clear(tagsWrap);
            if (newTags.length > 0) {
                tagsWrap.className = 'skill-meta editable';
                for (const t of newTags) {
                    const tag = el('vscode-tag');
                    tag.textContent = t;
                    tagsWrap.appendChild(tag);
                }
            } else {
                tagsWrap.textContent = '+ Add tags';
                tagsWrap.className = 'skill-meta editable muted';
            }
        }
        item.insertBefore(input, tagsWrap.nextSibling); // Insert after tagsWrap
        input.focus();
    });
    item.appendChild(tagsWrap);

    // Action Bar (Hidden by default)
    const actions = el('div', { class: 'row action-bar', style: 'display:none; margin-top: 8px;' });

    const addBtn = el('vscode-button');
    addBtn.textContent = 'Add to...';
    addBtn.addEventListener('click', () => vscode.postMessage({ type: 'addToWorkspace', id: skill.id }));
    actions.appendChild(addBtn);

    const delBtn = el('vscode-button', { appearance: 'secondary' });
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => vscode.postMessage({ type: 'requestDeleteSkill', id: skill.id }));
    actions.appendChild(delBtn);

    item.appendChild(actions);
    container.appendChild(item);
  });
}

function renderPresetsView(root) {
  const container = el('div', { class: 'stack' });
  root.appendChild(container);

  // Hint: create presets from My Skills page
  const hint = el('div', { class: 'muted', style: 'margin-bottom: 8px;' });
  hint.textContent = 'Tip: Go to My Skills, select skills, then click "Create preset"';
  container.appendChild(hint);

  // Search bar for presets
  const searchRow = el('div', { class: 'row' });
  const searchInput = el('vscode-text-field', { placeholder: 'Search presets...', class: 'grow', id: 'search-presets' });
  searchInput.addEventListener('input', () => {
    const term = searchInput.value.toLowerCase();
    const items = container.querySelectorAll('.preset-item');
    items.forEach((item) => {
      const presetName = item.dataset.presetName || '';
      item.style.display = presetName.toLowerCase().includes(term) ? 'block' : 'none';
    });
  });
  searchRow.appendChild(searchInput);
  container.appendChild(searchRow);
  container.appendChild(el('vscode-divider'));

  if (!state.presets.length) {
    container.appendChild(el('div', { class: 'empty muted', text: 'No presets yet. Go to My Skills to create one.' }));
    return;
  }

  state.presets.forEach((preset, presetIdx) => {
    const block = el('div', { class: 'preset-item', 'data-preset-name': preset.name, 'data-preset-idx': String(presetIdx) });
    
    // Click to select preset (toggle selection + show action buttons)
    block.addEventListener('click', (e) => {
      if (e.target.tagName.toLowerCase().includes('input') || e.target.tagName.toLowerCase().includes('button') || e.target.tagName.toLowerCase().includes('vscode-')) return;
      const isSelected = block.classList.contains('selected');
      // Deselect all other presets
      root.querySelectorAll('.preset-item').forEach(i => {
        i.classList.remove('selected');
        i.classList.remove('expanded');
        const ab = i.querySelector('.preset-actions');
        if (ab) ab.style.display = 'none';
        const exp = i.querySelector('.preset-expanded');
        if (exp) exp.style.display = 'none';
      });
      if (!isSelected) {
        block.classList.add('selected');
        const ab = block.querySelector('.preset-actions');
        if (ab) ab.style.display = 'flex';
      }
    });

    // Header row: preset name (inline editable)
    const headerRow = el('div', { class: 'row' });
    const skillCount = (preset.skillIds || []).length;
    const nameText = el('div', { class: 'skill-title editable', text: `${preset.name} (${skillCount} skills)` });
    nameText.title = 'Click to edit name';
    nameText.addEventListener('click', (e) => {
      e.stopPropagation();
      nameText.style.display = 'none';
      const input = el('vscode-text-field', { value: preset.name, class: 'grow' });
      input.addEventListener('blur', () => saveName());
      input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') saveName(); });
      function saveName() {
        const newName = input.value.trim();
        if (newName && newName !== preset.name) {
          vscode.postMessage({ type: 'updatePreset', preset: { ...preset, name: newName } });
        }
        headerRow.removeChild(input);
        nameText.textContent = `${newName || preset.name} (${skillCount} skills)`;
        nameText.style.display = 'block';
      }
      headerRow.insertBefore(input, nameText);
      input.focus();
    });
    headerRow.appendChild(nameText);
    block.appendChild(headerRow);

    // Expanded section (hidden by default): shows full skill cards
    const expanded = el('div', { class: 'preset-expanded', style: 'display:none; margin-top:8px;' });
    
    const presetSkills = state.imported.filter(s => (preset.skillIds || []).includes(s.id));
    
    if (presetSkills.length === 0) {
      expanded.appendChild(el('div', { class: 'muted', text: 'No skills in this preset.' }));
    } else {
      presetSkills.forEach(skill => {
        const skillCard = el('div', { class: 'skill-card-mini' });
        
        // Header
        const cardHeader = el('div', { class: 'row' });
        const cb = el('vscode-checkbox');
        cb.checked = true; // Always checked since it's in the preset
        cb.addEventListener('change', (e) => {
          e.stopPropagation();
          const next = { ...preset, skillIds: Array.isArray(preset.skillIds) ? [...preset.skillIds] : [] };
          if (cb.checked) {
            if (!next.skillIds.includes(skill.id)) next.skillIds.push(skill.id);
          } else {
            next.skillIds = next.skillIds.filter((id) => id !== skill.id);
          }
          vscode.postMessage({ type: 'updatePreset', preset: next });
        });
        cardHeader.appendChild(cb);
        cardHeader.appendChild(el('div', { class: 'skill-title-small', text: skill.name }));
        skillCard.appendChild(cardHeader);
        
        // Description (Inline Edit) - globally synced
        const descText = el('div', { class: 'muted editable', text: skill.description || '(no description)' });
        descText.title = 'Click to edit (global)';
        descText.addEventListener('click', (e) => {
          e.stopPropagation();
          descText.style.display = 'none';
          const input = el('vscode-text-field', { value: skill.description || '', class: 'grow' });
          input.addEventListener('blur', () => saveDesc());
          input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') saveDesc(); });
          function saveDesc() {
            if (input.value !== (skill.description || '')) {
              vscode.postMessage({ type: 'updateSkillMetadata', id: skill.id, customDescription: input.value });
            }
            skillCard.removeChild(input);
            descText.textContent = input.value || '(no description)';
            descText.style.display = 'block';
          }
          skillCard.insertBefore(input, descText.nextSibling);
          input.focus();
        });
        skillCard.appendChild(descText);

        // Tags (Inline Edit) - globally synced
        const tagsWrap = el('div', { class: 'skill-meta editable' });
        if (skill.tags && skill.tags.length > 0) {
          for (const t of skill.tags) {
            const tag = el('vscode-tag');
            tag.textContent = t;
            tagsWrap.appendChild(tag);
          }
        } else {
          tagsWrap.textContent = '+ Add tags';
          tagsWrap.className = 'skill-meta muted editable';
        }
        tagsWrap.title = 'Click to edit (global)';
        tagsWrap.addEventListener('click', (e) => {
          e.stopPropagation();
          tagsWrap.style.display = 'none';
          const input = el('vscode-text-field', { value: (skill.tags || []).join(', '), class: 'grow' });
          input.addEventListener('blur', () => saveTags());
          input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') saveTags(); });
          function saveTags() {
            const newTags = parseTags(input.value);
            if (JSON.stringify(newTags) !== JSON.stringify(skill.tags || [])) {
              vscode.postMessage({ type: 'updateSkillMetadata', id: skill.id, tags: newTags });
            }
            skillCard.removeChild(input);
            tagsWrap.style.display = 'flex';
            clear(tagsWrap);
            if (newTags.length > 0) {
              tagsWrap.className = 'skill-meta editable';
              for (const t of newTags) {
                const tag = el('vscode-tag');
                tag.textContent = t;
                tagsWrap.appendChild(tag);
              }
            } else {
              tagsWrap.textContent = '+ Add tags';
              tagsWrap.className = 'skill-meta muted editable';
            }
          }
          skillCard.insertBefore(input, tagsWrap.nextSibling);
          input.focus();
        });
        skillCard.appendChild(tagsWrap);

        expanded.appendChild(skillCard);
      });
    }
    block.appendChild(expanded);

    // Preset-level Actions (Hidden by default, show when selected)
    const actions = el('div', { class: 'row preset-actions', style: 'display:none; margin-top:8px;' });
    
    const btnEditName = el('vscode-button', { appearance: 'secondary' });
    btnEditName.textContent = 'Edit name';
    btnEditName.addEventListener('click', (e) => {
      e.stopPropagation();
      nameText.click(); // Trigger inline edit
    });
    actions.appendChild(btnEditName);

    const btnEditSkills = el('vscode-button', { appearance: 'secondary' });
    btnEditSkills.textContent = 'Edit skills';
    btnEditSkills.addEventListener('click', (e) => {
      e.stopPropagation();
      const isExpanded = block.classList.contains('expanded');
      block.classList.toggle('expanded');
      expanded.style.display = isExpanded ? 'none' : 'block';
      btnEditSkills.textContent = isExpanded ? 'Edit skills' : 'Hide skills';
    });
    actions.appendChild(btnEditSkills);

    const applyMerge = el('vscode-button');
    applyMerge.textContent = 'Apply (Merge)';
    applyMerge.addEventListener('click', () => vscode.postMessage({ type: 'applyPreset', id: preset.id, mode: 'merge' }));
    actions.appendChild(applyMerge);

    const applyReplace = el('vscode-button', { appearance: 'secondary' });
    applyReplace.textContent = 'Apply (Replace)';
    applyReplace.addEventListener('click', () => vscode.postMessage({ type: 'applyPreset', id: preset.id, mode: 'replace' }));
    actions.appendChild(applyReplace);

    const del = el('vscode-button', { appearance: 'secondary' });
    del.textContent = 'Delete';
    del.addEventListener('click', () => vscode.postMessage({ type: 'requestDeletePreset', id: preset.id }));
    actions.appendChild(del);

    block.appendChild(actions);
    container.appendChild(block);
  });
}

function renderSettingsView(root) {
  const container = el('div', { class: 'stack' });
  root.appendChild(container);

  const row1 = el('div', { class: 'stack' });
  const label1 = el('div', { text: 'Default Export Path' });
  const field1 = el('vscode-text-field', { value: state.defaultExportPath || '.claude/skills/', class: 'grow' });
  const help1 = el('div', { class: 'muted', text: 'Relative to the chosen folder.' });
  row1.appendChild(label1);
  row1.appendChild(field1);
  row1.appendChild(help1);
  container.appendChild(row1);

  const row2 = el('div', { class: 'stack' });
  const label2 = el('div', { text: 'Storage Path' });
  const field2 = el('vscode-text-field', { value: state.storagePath || '', class: 'grow', placeholder: '(empty = default profile storage)' });
  const help2 = el('div', { class: 'muted', text: 'Storage path for imported skills & presets.' });
  row2.appendChild(label2);
  row2.appendChild(field2);
  row2.appendChild(help2);
  container.appendChild(row2);

  const btnSave = el('vscode-button');
  btnSave.textContent = 'Save Settings';
  btnSave.addEventListener('click', () => {
      vscode.postMessage({ type: 'updateSettings', defaultExportPath: field1.value, storagePath: field2.value });
  });
  container.appendChild(btnSave);
}

// Initial load
vscode.postMessage({ type: 'refresh' });