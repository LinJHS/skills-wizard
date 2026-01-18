/**
 * Skill card component
 */

import { Skill, VSCodeAPI } from '../types';
import { el, clear, parseTags, icon, iconButton } from '../utils';

export interface SkillCardOptions {
  className?: string;
  nameClass?: string;
  checkboxClass?: string;
  onCardClick?: (e: Event) => void;
  showActions?: boolean;
  actionBarClass?: string;
  actionBarStyle?: string;
}

export interface SkillCardResult {
  card: HTMLElement;
  actions: HTMLElement | null;
  checkbox: HTMLInputElement | null;
}

/**
 * Create tag edit button
 */
function createTagEditButton(
  skill: Skill,
  actions: HTMLElement,
  restoreActions: () => void,
  vscode: VSCodeAPI
): HTMLButtonElement {
  const tagsBtn = iconButton(
    'tag',
    skill.tags && skill.tags.length > 0 ? 'Edit tags' : 'Add tags',
    'secondary'
  );
  
  tagsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const currentTags = (skill.tags || []).join(', ');
    const input = el('input', {
      type: 'text',
      value: currentTags,
      placeholder: 'tag1, tag2',
      class: 'grow'
    });
    const saveBtn = iconButton('check', 'Save', 'primary');
    const cancelBtn = iconButton('close', 'Cancel', 'secondary');

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

    saveBtn.addEventListener('click', () => {
      saveTags();
      restore();
    });
    cancelBtn.addEventListener('click', restore);
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        saveTags();
        restore();
      }
      if (ev.key === 'Escape') restore();
    });
  });
  
  return tagsBtn;
}

/**
 * Create a skill card component
 */
export function createSkillCard(
  skill: Skill,
  vscode: VSCodeAPI,
  options: SkillCardOptions = {}
): SkillCardResult {
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

  // Header row
  const header = el('div', { class: 'row' });
  let checkbox: HTMLInputElement | null = null;
  
  if (checkboxClass) {
    checkbox = el('input', {
      type: 'checkbox',
      class: checkboxClass,
      'data-skill-id': skill.id
    }) as HTMLInputElement;
    checkbox.addEventListener('click', (e) => e.stopPropagation());
    header.appendChild(checkbox);
  }

  // Skill name (editable)
  const nameEl = el('div', { class: nameClass, text: skill.name });
  nameEl.title = 'Click to edit name';
  nameEl.addEventListener('click', (e) => {
    e.stopPropagation();
    nameEl.style.display = 'none';
    const input = el('input', { type: 'text', value: skill.name, class: 'grow' }) as HTMLInputElement;
    
    input.addEventListener('blur', () => saveName());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveName();
      if (e.key === 'Escape') {
        header.removeChild(input);
        nameEl.style.display = 'block';
      }
    });
    
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

  // Description (editable)
  const descRow = el('div', { class: 'row' });
  const descText = el('div', {
    class: 'muted editable',
    text: skill.description || '(no description)'
  });
  descText.title = 'Click to edit description';
  descText.addEventListener('click', (e) => {
    e.stopPropagation();
    descText.style.display = 'none';
    const input = el('input', {
      type: 'text',
      value: skill.description || '',
      class: 'grow'
    }) as HTMLInputElement;
    
    input.addEventListener('blur', () => saveDesc());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveDesc();
      if (e.key === 'Escape') {
        descRow.removeChild(input);
        descText.style.display = 'block';
      }
    });
    
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

  // Tags display
  if (skill.tags && skill.tags.length > 0) {
    const tagsWrap = el('div', { class: 'skill-meta' });
    for (const t of skill.tags) {
      const tag = el('span', { class: 'tag', text: t });
      tagsWrap.appendChild(tag);
    }
    card.appendChild(tagsWrap);
  }

  // Action bar
  let actions: HTMLElement | null = null;
  if (showActions) {
    actions = el('div', { class: actionBarClass, style: actionBarStyle });
    card.appendChild(actions);
  }

  return { card, actions, checkbox };
}

export { createTagEditButton };
