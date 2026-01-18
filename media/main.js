// @ts-ignore

const vscode = acquireVsCodeApi();

// Signal that the webview is ready to receive data
window.addEventListener('load', () => {
    vscode.postMessage({ type: 'webviewReady' });
});

/** @type {{ discovered:any[]; imported:any[]; presets:any[]; defaultExportPath:string; storagePath:string }} */
let state = {
  discovered: [],
  imported: [],
  presets: [],
  defaultExportPath: '.claude/skills/',
  storagePath: '',
};

const uiState = {
  expandedPresetIds: new Set(),
  selectedPresetId: null,
  tagFilter: 'all',
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
    } else if (k === 'value' && (tag === 'input' || tag === 'textarea' || tag === 'select')) {
      // Set value property for input/textarea
      node.value = String(v);
    } else if (k === 'checked' && tag === 'input') {
      // Set checked property for checkbox/radio
      node.checked = !!v;
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

function createTagEditButton(skill, actions, restoreActions) {
  const tagsBtn = el('button', { class: 'secondary' });
  tagsBtn.textContent = (skill.tags && skill.tags.length > 0) ? 'Edit tags' : 'Add tags';
  tagsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const currentTags = (skill.tags || []).join(', ');
    const input = el('input', { type: 'text', value: currentTags, placeholder: 'tag1, tag2', class: 'grow' });
    const saveBtn = el('button', { class: 'primary' });
    saveBtn.textContent = 'Save';
    const cancelBtn = el('button', { class: 'secondary' });
    cancelBtn.textContent = 'Cancel';

    clear(actions);
    actions.appendChild(input);
    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    input.focus();

    function saveTags() {
      const newTags = parseTags(input.value);
      if (JSON.stringify(newTags) !== JSON.stringify(skill.tags || [])) {
        vscode.postMessage({ type: 'updateSkillMetadata', id: skill.id, tags: newTags });
      }
    }

    function restore() {
      clear(actions);
      restoreActions();
    }

    saveBtn.addEventListener('click', () => { saveTags(); restore(); });
    cancelBtn.addEventListener('click', restore);
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { saveTags(); restore(); }
      if (ev.key === 'Escape') restore();
    });
  });
  return tagsBtn;
}

function createSkillCard(skill, options = {}) {
  const {
    className = 'skill-item',
    nameClass = 'skill-title editable',
    checkboxClass,
    onCardClick,
    showActions = true,
    actionBarClass = 'row action-bar',
    actionBarStyle,
  } = options;

  const card = el('div', { class: className });
  if (typeof onCardClick === 'function') {
    card.addEventListener('click', onCardClick);
  }

  const header = el('div', { class: 'row' });
  let checkbox;
  if (checkboxClass) {
    checkbox = el('input', { type: 'checkbox', class: checkboxClass, 'data-skill-id': skill.id });
    checkbox.addEventListener('click', (e) => e.stopPropagation());
    header.appendChild(checkbox);
  }

  const nameEl = el('div', { class: nameClass, text: skill.name });
  nameEl.title = 'Click to edit name';
  nameEl.addEventListener('click', (e) => {
    e.stopPropagation();
    nameEl.style.display = 'none';
    const input = el('input', { type: 'text', value: skill.name, class: 'grow' });
    input.addEventListener('blur', () => saveName());
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveName(); });
    function saveName() {
      const newName = input.value.trim();
      if (newName && newName !== skill.name) {
        vscode.postMessage({ type: 'updateSkillMetadata', id: skill.id, customName: newName });
      }
      header.removeChild(input);
      nameEl.textContent = newName || skill.name;
      nameEl.style.display = 'block';
    }
    header.appendChild(input);
    input.focus();
  });
  header.appendChild(nameEl);
  card.appendChild(header);

  const descRow = el('div', { class: 'row' });
  const descText = el('div', { class: 'muted editable', text: skill.description || '(no description)' });
  descText.title = 'Click to edit description';
  descText.addEventListener('click', (e) => {
    e.stopPropagation();
    descText.style.display = 'none';
    const input = el('input', { type: 'text', value: skill.description || '', class: 'grow' });
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
  card.appendChild(descRow);

  if (skill.tags && skill.tags.length > 0) {
    const tagsWrap = el('div', { class: 'skill-meta' });
    for (const t of skill.tags) {
      const tag = el('span', { class: 'tag', text: t });
      tagsWrap.appendChild(tag);
    }
    card.appendChild(tagsWrap);
  }

  let actions;
  if (showActions) {
    actions = el('div', { class: actionBarClass, style: actionBarStyle });
    card.appendChild(actions);
  }

  return { card, actions, checkbox };
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
  
  const btnScan = el('button', { class: 'primary' });
  btnScan.textContent = 'Scan (Global + Workspace)';
  btnScan.addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
  row1.appendChild(btnScan);

  const btnScanFolder = el('button', { class: 'secondary' });
  btnScanFolder.textContent = 'Import from folder…';
  btnScanFolder.addEventListener('click', () => vscode.postMessage({ type: 'scanCustomPath' }));
  row1.appendChild(btnScanFolder);

  const btnImportBundle = el('button', { class: 'secondary' });
  btnImportBundle.textContent = 'Import bundle (.zip or folder)…';
  btnImportBundle.addEventListener('click', () => vscode.postMessage({ type: 'importBundle' }));
  row1.appendChild(btnImportBundle);
  actions.appendChild(row1);

  const row2 = el('div', { class: 'row' });
  const btnScanGh = el('button', { class: 'secondary' });
  btnScanGh.textContent = 'Import from GitHub';
  btnScanGh.addEventListener('click', () => {
    const existing = actions.querySelector('.github-input-row');
    if (existing) {
      const input = existing.querySelector('input');
      if (input) input.focus();
      return;
    }

    const inputRow = el('div', { class: 'row github-input-row', style: 'margin-top: 6px;' });
    const input = el('input', { type: 'text', placeholder: 'https://github.com/owner/repo', class: 'grow' });
    const submit = el('button', { class: 'secondary' });
    submit.textContent = 'Scan';
    const cancel = el('button', { class: 'secondary' });
    cancel.textContent = 'Cancel';

    function cleanup() {
      if (actions.contains(inputRow)) actions.removeChild(inputRow);
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
    actions.appendChild(inputRow);
    setTimeout(() => input.focus(), 10);
  });
  row2.appendChild(btnScanGh);
  actions.appendChild(row2);
  actions.appendChild(el('hr'));
  root.appendChild(actions);

  const container = el('div', { class: 'stack' });
  root.appendChild(container);

  if (!state.discovered.length) {
    container.appendChild(el('div', { class: 'empty muted', text: 'No discovered skills yet. Use Scan / Import to find skills.' }));
    return;
  }

  // Bulk actions row
  const bulkRow = el('div', { class: 'row', style: 'margin-bottom: 8px;' });
  const checkAll = el('input', { type: 'checkbox' });
  checkAll.addEventListener('change', () => {
    const checked = checkAll.checked;
    root.querySelectorAll('.item-check').forEach(cb => cb.checked = checked);
  });
  bulkRow.appendChild(checkAll);
  bulkRow.appendChild(el('span', { class: 'select-all-label', text: 'Select All' }));
  
  const btnImportAll = el('button', { class: 'secondary' });
  btnImportAll.textContent = 'Import Selected';
  btnImportAll.addEventListener('click', () => {
    const items = [];
    root.querySelectorAll('.item-check:checked').forEach(cb => {
      const idx = parseInt(cb.dataset.index);
      if (!state.discovered[idx]) return;
      const skill = state.discovered[idx];
      const tagInput = document.getElementById(`tags-${skill.md5}`);
      const tags = tagInput ? parseTags(tagInput.value) : [];
      items.push({ skill, tags });
    });
    if (items.length === 0) return;
    // Use batch import and show count
    vscode.postMessage({ type: 'batchImportSkills', items, count: items.length });
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
      if (e.target.tagName.toLowerCase() === 'input' || e.target.tagName.toLowerCase() === 'button') return;
      const cb = item.querySelector('.item-check');
      cb.checked = !cb.checked;
    });

    const header = el('div', { class: 'row' });
    const cb = el('input', { type: 'checkbox', class: 'item-check', 'data-index': index });
    header.appendChild(cb);
    header.appendChild(el('div', { class: 'skill-title', text: skill.name }));
    item.appendChild(header);

    item.appendChild(el('div', { class: 'muted', text: skill.description || '' }));

    const meta = el('div', { class: 'skill-meta' });
    if (skill.isRemote) {
      meta.appendChild(el('span', { class: 'badge badge-remote', text: 'GitHub' }));
    }
    if (importedByMd5) {
      meta.appendChild(el('span', { class: 'badge', text: 'Imported' }));
    } else if (nameConflict) {
      meta.appendChild(el('span', { class: 'badge', text: 'Name conflict' }));
    }
    item.appendChild(meta);

    const row = el('div', { class: 'row' });
    const tagsField = el('input', { type: 'text', placeholder: 'tag1, tag2', class: 'grow', id: `tags-${skill.md5}` });
    tagsField.value = importedByMd5?.tags?.join(', ') || '';
    row.appendChild(tagsField);

    const importBtn = el('button', { class: importedByMd5 || nameConflict ? 'secondary' : 'primary' });
    importBtn.textContent = importedByMd5 ? 'Re-import' : nameConflict ? 'Overwrite' : 'Import';
    importBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'importSkill', skill, tags: parseTags(tagsField.value), isSingle: true });
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

  // Search bar
  const searchRow = el('div', { class: 'row', style: 'margin-bottom: 8px;' });
  const searchInput = el('input', { type: 'text', placeholder: 'Search skills...', class: 'grow', id: 'search-my-skills' });
  function applyMySkillsFilters() {
    const term = searchInput.value.toLowerCase();
    const tag = tagSelect.value;
    const items = container.querySelectorAll('.skill-item');
    items.forEach((item) => {
      const originalIdx = parseInt(item.dataset.originalIndex || '0');
      const skill = state.imported[originalIdx];
      if (!skill) return;
      const matchesTerm = !term ||
        skill.name.toLowerCase().includes(term) ||
        (skill.description || '').toLowerCase().includes(term) ||
        (skill.tags || []).some(t => t.toLowerCase().includes(term));
      const matchesTag = tag === 'all' || (skill.tags || []).includes(tag);
      item.style.display = matchesTerm && matchesTag ? 'block' : 'none';
    });
  }
  searchInput.addEventListener('input', applyMySkillsFilters);
  searchRow.appendChild(searchInput);
  container.appendChild(searchRow);

  // Tag filter
  const tagRow = el('div', { class: 'row', style: 'margin-bottom: 8px;' });
  tagRow.appendChild(el('span', { text: 'Tag' }));
  const tagSelect = el('select', { class: 'grow' });
  const uniqueTags = Array.from(new Set(
    state.imported.flatMap(s => Array.isArray(s.tags) ? s.tags : [])
  )).sort();
  tagSelect.appendChild(el('option', { value: 'all', text: 'All tags' }));
  uniqueTags.forEach(tag => {
    tagSelect.appendChild(el('option', { value: tag, text: tag }));
  });
  if (!uniqueTags.includes(uiState.tagFilter)) {
    uiState.tagFilter = 'all';
  }
  tagSelect.value = uiState.tagFilter;
  tagSelect.addEventListener('change', () => {
    uiState.tagFilter = tagSelect.value;
    applyMySkillsFilters();
  });
  tagRow.appendChild(tagSelect);
  container.appendChild(tagRow);

  // Bulk actions
  const bulkRow = el('div', { class: 'row', style: 'margin-bottom: 8px;' });
  const checkAll = el('input', { type: 'checkbox' });
  checkAll.addEventListener('change', () => {
    const checked = checkAll.checked;
    root.querySelectorAll('.item-check').forEach(cb => {
      cb.checked = checked;
    });
  });
  bulkRow.appendChild(checkAll);
  bulkRow.appendChild(el('span', { class: 'select-all-label', text: 'Select All' }));
  
  const btnDeleteAll = el('button', { class: 'secondary' });
  btnDeleteAll.textContent = 'Delete Selected';
  btnDeleteAll.addEventListener('click', () => {
    const selectedIds = [];
    root.querySelectorAll('.item-check:checked').forEach(cb => {
      const skillId = cb.dataset.skillId;
      if (skillId) selectedIds.push(skillId);
    });
    if (selectedIds.length === 0) {
      alert('Please select at least one skill to delete.');
      return;
    }
    vscode.postMessage({ type: 'requestBatchDeleteSkills', ids: selectedIds });
  });
  bulkRow.appendChild(btnDeleteAll);

  const btnExportSelected = el('button', { class: 'secondary' });
  btnExportSelected.textContent = 'Export Selected (zip)';
  btnExportSelected.addEventListener('click', () => {
    const selectedIds = [];
    root.querySelectorAll('.item-check:checked').forEach(cb => {
      const skillId = cb.dataset.skillId;
      if (skillId) selectedIds.push(skillId);
    });
    if (selectedIds.length === 0) {
      alert('Please select at least one skill to export.');
      return;
    }
    vscode.postMessage({ type: 'exportSkillsZip', ids: selectedIds });
  });
  bulkRow.appendChild(btnExportSelected);

  // Create Preset from Selected button
  const btnCreatePresetFromSelected = el('button', { class: 'secondary' });
  btnCreatePresetFromSelected.textContent = 'Create preset';
  btnCreatePresetFromSelected.addEventListener('click', (e) => {
    e.stopPropagation();
    const selectedIds = [];
    root.querySelectorAll('.item-check:checked').forEach(cb => {
      const skillId = cb.dataset.skillId;
      if (skillId) selectedIds.push(skillId);
    });
    if (selectedIds.length === 0) {
      alert('Please select at least one skill first.');
      return;
    }
    
    // Remove existing overlay if any
    const existing = container.querySelector('.preset-name-overlay');
    if (existing) container.removeChild(existing);
    
    // Show inline input for preset name (insert after bulkRow)
    const overlay = el('div', { class: 'preset-name-overlay row', style: 'margin: 8px 0; background: var(--vscode-input-background); padding: 8px; border-radius: 4px;' });
    const nameInput = el('input', { type: 'text', placeholder: 'Preset name', class: 'grow' });
    const btnSave = el('button', { class: 'primary' });
    btnSave.textContent = 'Create';
    btnSave.addEventListener('click', () => save());
    const btnCancel = el('button', { class: 'secondary' });
    btnCancel.textContent = 'Cancel';
    btnCancel.addEventListener('click', () => {
      const overlayEl = container.querySelector('.preset-name-overlay');
      if (overlayEl) container.removeChild(overlayEl);
    });
    
    nameInput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') save(); });
    
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
    // Insert after bulkRow
    if (bulkRow.nextSibling) {
      container.insertBefore(overlay, bulkRow.nextSibling);
    } else {
      container.appendChild(overlay);
    }
    setTimeout(() => nameInput.focus(), 50);
  });
  bulkRow.appendChild(btnCreatePresetFromSelected);
  
  container.appendChild(bulkRow);

  // Render all items (search filter applied live via DOM style.display)
  state.imported.forEach((skill, originalIndex) => {
    const { card: item, actions, checkbox: cb } = createSkillCard(skill, {
      className: 'skill-item',
      checkboxClass: 'item-check',
      actionBarStyle: 'display:none; margin-top: 8px;'
    });
    item.dataset.skillId = skill.id;
    item.dataset.originalIndex = String(originalIndex);

    // Click to select/toggle action bar
    item.addEventListener('click', (e) => {
      if (e.target.tagName.toLowerCase() === 'input' || e.target.tagName.toLowerCase() === 'button') return;
      const isSelected = item.classList.contains('selected');
      root.querySelectorAll('.skill-item').forEach(i => {
        i.classList.remove('selected');
        const ab = i.querySelector('.action-bar');
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

    const addBtn = el('button', { class: 'primary' });
    addBtn.textContent = 'Add to...';
    addBtn.addEventListener('click', () => vscode.postMessage({ type: 'addToWorkspace', id: skill.id }));

    const viewBtn = el('button', { class: 'secondary' });
    viewBtn.textContent = 'View files';
    viewBtn.addEventListener('click', () => vscode.postMessage({ type: 'openSkillFile', id: skill.id }));

    const delBtn = el('button', { class: 'secondary' });
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => vscode.postMessage({ type: 'requestDeleteSkill', id: skill.id }));

    let tagsBtn;
    const restoreActions = () => {
      if (!actions) return;
      actions.appendChild(addBtn);
      actions.appendChild(viewBtn);
      if (tagsBtn) actions.appendChild(tagsBtn);
      actions.appendChild(delBtn);
    };

    tagsBtn = createTagEditButton(skill, actions, restoreActions);
    restoreActions();

    container.appendChild(item);
  });
  applyMySkillsFilters();
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
  const searchInput = el('input', { type: 'text', placeholder: 'Search presets...', class: 'grow', id: 'search-presets' });
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
  
  // Bulk export row
  const bulkRow = el('div', { class: 'row', style: 'margin-bottom: 8px;' });
  const checkAll = el('input', { type: 'checkbox' });
  checkAll.addEventListener('change', () => {
    const checked = checkAll.checked;
    root.querySelectorAll('.preset-check').forEach(cb => {
      cb.checked = checked;
    });
  });
  bulkRow.appendChild(checkAll);
  bulkRow.appendChild(el('span', { class: 'select-all-label', text: 'Select All' }));
  
  const exportSelected = el('button', { class: 'secondary' });
  exportSelected.textContent = 'Export Selected (zip)';
  exportSelected.addEventListener('click', () => {
    const selectedIds = [];
    root.querySelectorAll('.preset-check:checked').forEach(cb => {
      const presetId = cb.dataset.presetId;
      if (presetId) selectedIds.push(presetId);
    });
    if (selectedIds.length === 0) {
      alert('Please select at least one preset to export.');
      return;
    }
    vscode.postMessage({ type: 'exportPresetsZip', ids: selectedIds });
  });
  bulkRow.appendChild(exportSelected);

  const deleteSelected = el('button', { class: 'secondary' });
  deleteSelected.textContent = 'Delete Selected';
  deleteSelected.addEventListener('click', () => {
    const selectedIds = [];
    root.querySelectorAll('.preset-check:checked').forEach(cb => {
      const presetId = cb.dataset.presetId;
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
    container.appendChild(el('div', { class: 'empty muted', text: 'No presets yet. Go to My Skills to create one.' }));
    return;
  }

  state.presets.forEach((preset, presetIdx) => {
    const block = el('div', { class: 'preset-item', 'data-preset-name': preset.name, 'data-preset-idx': String(presetIdx) });
    
    // Header row: preset name (inline editable)
    const headerRow = el('div', { class: 'row' });
    const presetCheck = el('input', { type: 'checkbox', class: 'preset-check', 'data-preset-id': preset.id });
    presetCheck.addEventListener('click', (e) => e.stopPropagation());
    headerRow.appendChild(presetCheck);
    const skillCount = (preset.skillIds || []).length;
    const nameText = el('div', { class: 'skill-title editable', text: `${preset.name} (${skillCount} skills)` });
    nameText.title = 'Click to edit name';
    nameText.addEventListener('click', (e) => {
      e.stopPropagation();
      nameText.style.display = 'none';
      const input = el('input', { type: 'text', value: preset.name, class: 'grow' });
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
    
    // Click header row to select preset (toggle selection + show action buttons)
    headerRow.addEventListener('click', (e) => {
      if (e.target.tagName.toLowerCase() === 'input') return;
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
        uiState.selectedPresetId = preset.id;
      }
    });
    
    block.appendChild(headerRow);

    // Expanded section (hidden by default): shows full skill cards
    const expanded = el('div', { class: 'preset-expanded', style: 'display:none; margin-top:8px;' });
    
    const presetSkills = state.imported.filter(s => (preset.skillIds || []).includes(s.id));
    
    if (presetSkills.length === 0) {
      expanded.appendChild(el('div', { class: 'muted', text: 'No skills in this preset.' }));
    } else {
      // Bulk actions for preset skills
      const presetBulkRow = el('div', { class: 'row', style: 'margin-bottom: 8px;' });
      const checkAllPreset = el('input', { type: 'checkbox' });
      checkAllPreset.addEventListener('change', () => {
        const checked = checkAllPreset.checked;
        expanded.querySelectorAll('.preset-skill-check').forEach(cb => cb.checked = checked);
      });
      presetBulkRow.appendChild(checkAllPreset);
      presetBulkRow.appendChild(el('span', { class: 'select-all-label', text: 'Select All' }));
      
      const btnRemoveFromPreset = el('button', { class: 'secondary' });
      btnRemoveFromPreset.textContent = 'Remove from preset';
      btnRemoveFromPreset.addEventListener('click', (e) => {
        e.stopPropagation();
        const selectedIds = [];
        expanded.querySelectorAll('.preset-skill-check:checked').forEach(cb => {
          const skillId = cb.dataset.skillId;
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

      presetSkills.forEach(skill => {
        const { card: skillCard, actions, checkbox: cb } = createSkillCard(skill, {
          className: 'skill-card-mini',
          nameClass: 'skill-title-small editable',
          checkboxClass: 'preset-skill-check',
          actionBarClass: 'row action-bar',
          actionBarStyle: 'display:none; margin-top: 8px;'
        });

        skillCard.addEventListener('click', (e) => {
          if (e.target.tagName.toLowerCase() === 'input' || e.target.tagName.toLowerCase() === 'button') return;
          const isSelected = skillCard.classList.contains('selected');
          expanded.querySelectorAll('.skill-card-mini').forEach(card => {
            card.classList.remove('selected');
            const ab = card.querySelector('.action-bar');
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

        let tagsBtn;
        const removeBtn = el('button', { class: 'secondary' });
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          vscode.postMessage({ type: 'requestRemoveFromPreset', presetId: preset.id, skillIds: [skill.id] });
        });
        const viewBtn = el('button', { class: 'secondary' });
        viewBtn.textContent = 'View files';
        viewBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          vscode.postMessage({ type: 'openSkillFile', id: skill.id });
        });
        const restoreActions = () => {
          if (!actions) return;
          if (tagsBtn) actions.appendChild(tagsBtn);
          actions.appendChild(viewBtn);
          actions.appendChild(removeBtn);
        };
        tagsBtn = createTagEditButton(skill, actions, restoreActions);
        restoreActions();

        expanded.appendChild(skillCard);
      });
    }
    block.appendChild(expanded);

    // Preset-level Actions (Hidden by default, show when selected)
    const actions = el('div', { class: 'row preset-actions', style: 'display:none; margin-top:8px;' });
    
    const btnEditSkills = el('button', { class: 'secondary' });
    btnEditSkills.textContent = 'Edit skills';
    btnEditSkills.addEventListener('click', (e) => {
      e.stopPropagation();
      const isExpanded = block.classList.contains('expanded');
      block.classList.toggle('expanded');
      expanded.style.display = isExpanded ? 'none' : 'block';
      btnEditSkills.textContent = isExpanded ? 'Edit skills' : 'Hide skills';
      if (isExpanded) {
        uiState.expandedPresetIds.delete(preset.id);
      } else {
        uiState.expandedPresetIds.add(preset.id);
      }
    });
    actions.appendChild(btnEditSkills);

    const applyMerge = el('button', { class: 'primary' });
    applyMerge.textContent = 'Apply (Merge)';
    applyMerge.addEventListener('click', () => vscode.postMessage({ type: 'applyPreset', id: preset.id, mode: 'merge' }));
    actions.appendChild(applyMerge);

    const applyReplace = el('button', { class: 'secondary' });
    applyReplace.textContent = 'Apply (Replace)';
    applyReplace.addEventListener('click', () => vscode.postMessage({ type: 'applyPreset', id: preset.id, mode: 'replace' }));
    actions.appendChild(applyReplace);

    const exportOne = el('button', { class: 'secondary' });
    exportOne.textContent = 'Export (zip)';
    exportOne.addEventListener('click', () => vscode.postMessage({ type: 'exportPresetsZip', ids: [preset.id] }));
    actions.appendChild(exportOne);

    const del = el('button', { class: 'secondary' });
    del.textContent = 'Delete';
    del.addEventListener('click', () => vscode.postMessage({ type: 'requestDeletePreset', id: preset.id }));
    actions.appendChild(del);

    block.appendChild(actions);
    container.appendChild(block);

    const shouldExpand = uiState.expandedPresetIds.has(preset.id);
    if (shouldExpand) {
      block.classList.add('expanded');
      expanded.style.display = 'block';
      btnEditSkills.textContent = 'Hide skills';
    }
    if (uiState.selectedPresetId === preset.id) {
      block.classList.add('selected');
      actions.style.display = 'flex';
    }
  });
}

function renderSettingsView(root) {
  const container = el('div', { class: 'stack' });
  root.appendChild(container);

  const row1 = el('div', { class: 'stack' });
  const label1 = el('div', { text: 'Default Export Path' });
  const field1 = el('input', { type: 'text', value: state.defaultExportPath || '.claude/skills/', class: 'grow' });
  const help1 = el('div', { class: 'muted', text: 'Relative to the chosen folder.' });
  row1.appendChild(label1);
  row1.appendChild(field1);
  row1.appendChild(help1);
  container.appendChild(row1);

  const row2 = el('div', { class: 'stack' });
  const label2 = el('div', { text: 'Storage Path' });
  const field2 = el('input', { type: 'text', value: state.storagePath || '', class: 'grow', placeholder: '(empty = default profile storage)' });
  const help2 = el('div', { class: 'muted', text: 'Storage path for imported skills & presets.' });
  row2.appendChild(label2);
  row2.appendChild(field2);
  row2.appendChild(help2);
  container.appendChild(row2);

  const btnSave = el('button', { class: 'primary' });
  btnSave.textContent = 'Save Settings';
  btnSave.addEventListener('click', () => {
      vscode.postMessage({ type: 'updateSettings', defaultExportPath: field1.value, storagePath: field2.value });
  });
  container.appendChild(btnSave);
}

// Initial load
vscode.postMessage({ type: 'refresh' });