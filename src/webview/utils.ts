/**
 * Utility functions for webview
 */

/**
 * Parse comma-separated tags
 */
export function parseTags(text: string | undefined | null): string[] {
  return String(text || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Create a DOM element with attributes and children
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, any> = {},
  children: (HTMLElement | string)[] = []
): HTMLElementTagNameMap[K] {
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
      const dataKey = k.slice(5).replace(/-([a-z])/g, (g) => g[1].toUpperCase());
      (node as any).dataset[dataKey] = String(v);
    } else if (k === 'value' && (tag === 'input' || tag === 'textarea' || tag === 'select')) {
      (node as any).value = String(v);
    } else if (k === 'checked' && tag === 'input') {
      (node as any).checked = !!v;
    } else {
      node.setAttribute(k, String(v));
    }
  }
  
  if (Array.isArray(children)) {
    for (const c of children) {
      if (typeof c === 'string') {
        node.appendChild(document.createTextNode(c));
      } else {
        node.appendChild(c);
      }
    }
  }
  
  return node;
}

/**
 * Clear all children of a node
 */
export function clear(node: HTMLElement): void {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

/**
 * Create a codicon element
 */
export function icon(name: string, className?: string): HTMLElement {
  const i = document.createElement('i');
  i.className = `codicon codicon-${name}${className ? ' ' + className : ''}`;
  return i;
}

/**
 * Create a button with icon
 */
export function iconButton(
  iconName: string,
  text?: string,
  className: string = 'secondary'
): HTMLButtonElement {
  const btn = el('button', { class: className });
  btn.appendChild(icon(iconName));
  if (text) {
    btn.appendChild(document.createTextNode(' ' + text));
  }
  return btn;
}
