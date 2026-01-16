import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import { getDefaultSkillsWizardStoragePath, resolvePath, GLOBAL_SKILL_PATHS, WORKSPACE_SKILL_PATHS, GITHUB_EXTRA_SKILL_PATHS } from '../utils/paths';
import { Skill, Preset, UserConfig, DiscoveredSkill, SkillMetadata } from '../models/types';

export class SkillManager {
  private context: vscode.ExtensionContext;
  private legacyStoragePath: string;
  private storagePath: string;
  private configPath: string;
  private config: UserConfig;
  private ready: Promise<void>;

  // Temporary storage for discovered skills that aren't persisted yet (like custom paths or github)
  private tempDiscovered: DiscoveredSkill[] = [];

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.legacyStoragePath = context.globalStorageUri.fsPath;
    this.storagePath = this.getStoragePathFromSettings();
    this.configPath = path.join(this.storagePath, 'config.json');
    this.config = { skills: {}, presets: [], defaultExportPath: '' };
    this.ready = this.init(this.legacyStoragePath);
  }

  private getStoragePathFromSettings(): string {
    const custom = vscode.workspace.getConfiguration('skillsWizard').get<string>('storagePath')?.trim();
    if (custom) {
      return resolvePath(custom);
    }
    return getDefaultSkillsWizardStoragePath();
  }

  private async ensureReady(): Promise<void> {
    const next = this.getStoragePathFromSettings();
    if (next !== this.storagePath) {
      const previous = this.storagePath;
      this.storagePath = next;
      this.configPath = path.join(this.storagePath, 'config.json');
      this.config = { skills: {}, presets: [], defaultExportPath: '' };
      this.ready = this.init(previous);
    }
    await this.ready;
  }

  private async init(migrateFromPath?: string) {
    await fs.ensureDir(this.storagePath);
    await fs.ensureDir(path.join(this.storagePath, 'skills'));
    if (migrateFromPath) {
      await this.maybeMigrateFrom(migrateFromPath);
    }
    await this.loadConfig();
  }

  private async maybeMigrateFrom(fromPath: string) {
    if (fromPath === this.storagePath) {
      return;
    }

    const fromConfig = path.join(fromPath, 'config.json');
    const fromSkillsDir = path.join(fromPath, 'skills');

    const toConfig = this.configPath;
    const toSkillsDir = path.join(this.storagePath, 'skills');

    const toHasConfig = await fs.pathExists(toConfig);
    const toHasSkills = await fs.pathExists(toSkillsDir) && (await fs.readdir(toSkillsDir)).length > 0;
    if (toHasConfig || toHasSkills) {
      return;
    }

    const fromHasConfig = await fs.pathExists(fromConfig);
    const fromHasSkills = await fs.pathExists(fromSkillsDir) && (await fs.readdir(fromSkillsDir)).length > 0;
    if (!fromHasConfig && !fromHasSkills) {
      return;
    }

    try {
      await fs.ensureDir(this.storagePath);
      // Copy config + skills into the new storage root. If the user explicitly changed storagePath later,
      // we only auto-migrate when the destination is still empty.
      await fs.copy(fromPath, this.storagePath, { overwrite: false, errorOnExist: false });
    } catch (e) {
      console.error('Failed to migrate storage', e);
    }
  }

  private async loadConfig() {
    if (await fs.pathExists(this.configPath)) {
      try {
        const stored = await fs.readJSON(this.configPath);
        this.config = { ...this.config, ...stored };
      } catch (e) {
        console.error('Failed to load config', e);
      }
    }
  }

  private async saveConfig() {
    await fs.writeJSON(this.configPath, this.config, { spaces: 2 });
  }

  public async calculateMD5(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath);
    return this.calculateMD5FromBuffer(buffer);
  }

  public calculateMD5FromBuffer(buffer: Buffer): string {
    const hash = crypto.createHash('md5');
    hash.update(buffer);
    return hash.digest('hex');
  }

  private extractDescriptionFromSkillMd(content: string): string | undefined {
    const lines = content.split(/\r?\n/);
    
    // Check for YAML frontmatter (---...---)
    if (lines[0]?.trim() === '---') {
      const endIdx = lines.slice(1).findIndex(l => l.trim() === '---');
      if (endIdx >= 0) {
        const frontmatter = lines.slice(1, endIdx + 1).join('\n');
        // Simple YAML parsing for description field (key: "value" or key: value)
        const match = frontmatter.match(/^\s*description:\s*["']?([^"'\n]+)["']?/m);
        if (match && match[1]) {
          const desc = match[1].trim();
          return desc.length > 200 ? desc.slice(0, 200) + '…' : desc;
        }
      }
    }
    
    // Fallback: first non-empty line (skip leading dashes/hashes)
    const trimmed = lines.map(l => l.trim());
    const first = trimmed.find(l => l.length > 0 && !l.startsWith('---') && !l.startsWith('#'));
    if (!first) {
      return undefined;
    }
    return first.length > 200 ? first.slice(0, 200) + '…' : first;
  }

  private async readSkillDescriptionFromFile(skillMdPath: string): Promise<string | undefined> {
    try {
      const content = await fs.readFile(skillMdPath, 'utf8');
      return this.extractDescriptionFromSkillMd(content);
    } catch {
      return undefined;
    }
  }

  public async scanForSkills(): Promise<{ discovered: DiscoveredSkill[], imported: Skill[] }> {
    await this.ensureReady();
    const discovered: DiscoveredSkill[] = [...this.tempDiscovered];
    
    // 1. Scan Global Paths
    for (const pattern of GLOBAL_SKILL_PATHS) {
      const resolvedBase = resolvePath(pattern);
      if (await fs.pathExists(resolvedBase)) {
        try {
            const entries = await fs.readdir(resolvedBase, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const skillPath = path.join(resolvedBase, entry.name);
                    const skillMdPath = path.join(skillPath, 'SKILL.md');
                    if (await fs.pathExists(skillMdPath)) {
                        const md5 = await this.calculateMD5(skillMdPath);
                        const description = await this.readSkillDescriptionFromFile(skillMdPath);
                        // Avoid duplicates from tempDiscovered if re-scanned? 
                        // Actually tempDiscovered is for custom things.
                        discovered.push({
                            name: entry.name,
                            path: skillPath,
                            md5: md5,
                            description,
                            sourceLocation: resolvedBase
                        });
                    }
                }
            }
        } catch (err) {
            // Ignore access errors
        }
      }
    }

    // 2. Scan Workspace Paths
    if (vscode.workspace.workspaceFolders) {
      for (const folder of vscode.workspace.workspaceFolders) {
        for (const relativePath of WORKSPACE_SKILL_PATHS) {
           const workspaceBase = path.join(folder.uri.fsPath, relativePath);
           if (await fs.pathExists(workspaceBase)) {
               try {
                   const entries = await fs.readdir(workspaceBase, { withFileTypes: true });
                   for (const entry of entries) {
                       if (entry.isDirectory()) {
                           const skillPath = path.join(workspaceBase, entry.name);
                           const skillMdPath = path.join(skillPath, 'SKILL.md');
                           if (await fs.pathExists(skillMdPath)) {
                               const md5 = await this.calculateMD5(skillMdPath);
                               const description = await this.readSkillDescriptionFromFile(skillMdPath);
                               discovered.push({
                                   name: entry.name,
                                   path: skillPath,
                                   md5: md5,
                                   description,
                                   sourceLocation: workspaceBase 
                               });
                           }
                       }
                   }
               } catch (err) {
                   // Ignore
               }
           }
        }
      }
    }

    // 3. Get Imported Skills
    const imported: Skill[] = [];
    const internalSkillsDir = path.join(this.storagePath, 'skills');
    if (await fs.pathExists(internalSkillsDir)) {
        const entries = await fs.readdir(internalSkillsDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const skillPath = path.join(internalSkillsDir, entry.name);
                const skillMdPath = path.join(skillPath, 'SKILL.md');
                if (await fs.pathExists(skillMdPath)) {
                     const md5 = await this.calculateMD5(skillMdPath);
                     const meta = this.config.skills[md5] || {};
                     const fileDescription = await this.readSkillDescriptionFromFile(skillMdPath);
                     imported.push({
                         id: md5,
                         name: entry.name,
                         path: skillPath,
                         description: meta.customDescription ?? fileDescription,
                         tags: meta.tags || [],
                         md5: md5,
                         source: 'extension',
                         isImported: true
                     });
                }
            }
        }
    }
    
    // Deduplicate discovered: if same MD5 exists in discovered, keep one?
    // If same MD5 exists in imported, the UI handles showing "Imported".
    // We should dedupe discovered list itself (e.g. same skill in multiple global paths or scanned twice).
    const uniqueDiscovered = Array.from(new Map(discovered.map(item => [item.md5, item])).values());

    return { discovered: uniqueDiscovered, imported };
  }

  public async scanCustomPath(targetPath: string) {
      await this.ensureReady();
      // Recursive scan
      const found = await this.scanRecursively(targetPath);
      // Add to tempDiscovered
      for (const skill of found) {
          if (!this.tempDiscovered.some(s => s.md5 === skill.md5)) {
              this.tempDiscovered.push(skill);
          }
      }
  }

  private async scanRecursively(dir: string, depth: number = 0): Promise<DiscoveredSkill[]> {
      if (depth > 5) {
        return [];
      }
      const results: DiscoveredSkill[] = [];
      
      try {
          // Check if this is a skill
          const skillMdPath = path.join(dir, 'SKILL.md');
          if (await fs.pathExists(skillMdPath)) {
              const md5 = await this.calculateMD5(skillMdPath);
              const description = await this.readSkillDescriptionFromFile(skillMdPath);
              return [{
                  name: path.basename(dir),
                  path: dir,
                  md5: md5,
                  description,
                  sourceLocation: path.dirname(dir)
              }];
          }
          
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
              if (entry.isDirectory() && !entry.name.startsWith('.')) {
                  results.push(...await this.scanRecursively(path.join(dir, entry.name), depth + 1));
              }
          }
      } catch (e) {
          // ignore
      }
      return results;
  }

  private parseGitHubRepoUrl(repoUrl: string): { owner: string; repo: string; ref?: string; subPath?: string } {
    // Supports:
    // - https://github.com/owner/repo
    // - https://github.com/owner/repo.git
    // - https://github.com/owner/repo/tree/branch
    // - https://github.com/owner/repo/tree/branch/sub/path
    const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)(?:\/tree\/([^/]+)(?:\/(.+))?)?/);
    if (!match) {
      throw new Error('Invalid GitHub URL');
    }
    const owner = match[1];
    const repo = match[2].replace(/\.git$/, '');
    const ref = match[3];
    const subPath = match[4];
    return { owner, repo, ref, subPath };
  }

  private withGitHubRef(urlStr: string, ref: string): string {
    try {
      const u = new URL(urlStr);
      if (!u.searchParams.has('ref')) {
        u.searchParams.set('ref', ref);
      }
      return u.toString();
    } catch {
      // Fallback for non-absolute URLs (shouldn't happen for GitHub API).
      return urlStr.includes('?') ? `${urlStr}&ref=${encodeURIComponent(ref)}` : `${urlStr}?ref=${encodeURIComponent(ref)}`;
    }
  }

  private getGitHubHeaders(): Record<string, string> {
    return {
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'skills-wizard',
    };
  }

  private normalizeGitHubSubPath(subPath: string): string {
    const trimmed = subPath.replace(/^\//, '').replace(/\/$/, '');
    return trimmed.length === 0 ? '' : trimmed + '/';
  }

  private async scanGitHubTreeForSkills(params: {
    repoUrl: string;
    owner: string;
    repo: string;
    ref: string;
    subPathPrefix?: string; // normalized, with trailing slash
    maxSkills?: number;
  }): Promise<{ added: number; total: number; truncated: boolean }> {
    const { repoUrl, owner, repo, ref } = params;
    const subPathPrefix = params.subPathPrefix;
    const maxSkills = params.maxSkills ?? 200;

    // 1) Resolve commit sha for the ref
    const branchRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/branches/${encodeURIComponent(ref)}`,
      { headers: this.getGitHubHeaders() }
    );
    if (!branchRes.ok) {
      throw new Error(`GitHub branch lookup failed (${branchRes.status})`);
    }
    const branchJson = (await branchRes.json()) as any;
    const sha: string | undefined = branchJson?.commit?.sha;
    if (!sha) {
      throw new Error('GitHub branch lookup did not return commit sha');
    }

    // 2) Fetch recursive tree
    const treeRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`,
      { headers: this.getGitHubHeaders() }
    );
    if (!treeRes.ok) {
      throw new Error(`GitHub tree scan failed (${treeRes.status})`);
    }
    const treeJson = (await treeRes.json()) as any;
    const entries: Array<{ path: string; type: string }> = Array.isArray(treeJson?.tree) ? treeJson.tree : [];

    // 3) Find all SKILL.md paths
    const skillMdPathsAll = entries
      .filter((e) => e?.type === 'blob' && typeof e.path === 'string' && e.path.endsWith('SKILL.md'))
      .map((e) => e.path)
      .filter((p) => (subPathPrefix ? p.startsWith(subPathPrefix) : true));

    const total = skillMdPathsAll.length;
    const truncated = total > maxSkills;
    const skillMdPaths = truncated ? skillMdPathsAll.slice(0, maxSkills) : skillMdPathsAll;

    let added = 0;

    for (const skillMdPath of skillMdPaths) {
      const dirPath = path.posix.dirname(skillMdPath);
      if (dirPath === '.' || dirPath === '/') {continue;}

      const mdApiUrl = this.withGitHubRef(
        `https://api.github.com/repos/${owner}/${repo}/contents/${dirPath}/SKILL.md`,
        ref
      );
      const mdMetaRes = await fetch(mdApiUrl, { headers: this.getGitHubHeaders() });
      if (!mdMetaRes.ok) {
        continue;
      }
      const mdMeta = (await mdMetaRes.json()) as any;
      const downloadUrl: string | undefined = mdMeta?.download_url;
      if (!downloadUrl) {
        continue;
      }

      const mdContentRes = await fetch(downloadUrl);
      if (!mdContentRes.ok) {
        continue;
      }
      const mdBuffer = Buffer.from(await mdContentRes.arrayBuffer());
      const md5 = this.calculateMD5FromBuffer(mdBuffer);
      const description = this.extractDescriptionFromSkillMd(mdBuffer.toString('utf8'));

      const skillName = path.posix.basename(dirPath);
      const dirApiUrl = this.withGitHubRef(
        `https://api.github.com/repos/${owner}/${repo}/contents/${dirPath}`,
        ref
      );

      const skill: DiscoveredSkill = {
        name: skillName,
        path: dirApiUrl,
        md5,
        description,
        sourceLocation: repoUrl,
        isRemote: true,
        remoteUrl: dirApiUrl,
      };

      if (!this.tempDiscovered.some((s) => s.md5 === skill.md5)) {
        this.tempDiscovered.push(skill);
        added += 1;
      }
    }

    return { added, total, truncated };
  }

  public async scanGitHub(repoUrl: string): Promise<{ added: number; total: number }> {
      await this.ensureReady();
      // repoUrl: https://github.com/owner/repo
      const { owner, repo, ref: maybeRef, subPath } = this.parseGitHubRepoUrl(repoUrl);
      let ref = maybeRef;

      if (!ref) {
        try {
          const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
            headers: this.getGitHubHeaders()
          });
          if (repoRes.ok) {
            const repoJson = await repoRes.json() as any;
            if (repoJson?.default_branch) {
              ref = repoJson.default_branch;
            }
          }
        } catch {
          // ignore
        }
      }
      if (!ref) {
        ref = 'main';
      }

      // If user provided a specific sub-path, scan recursively inside it (repo layouts can be arbitrary).
      if (subPath) {
        const prefix = this.normalizeGitHubSubPath(subPath);
        const deep = await this.scanGitHubTreeForSkills({
          repoUrl,
          owner,
          repo,
          ref,
          subPathPrefix: prefix,
        });
        return { added: deep.added, total: deep.total };
      }

      const candidates = subPath
        ? [subPath.replace(/^\//, '').replace(/\/$/, '') + '/']
        : [...WORKSPACE_SKILL_PATHS, ...GITHUB_EXTRA_SKILL_PATHS];

      let added = 0;
      let total = 0;

      for (const relativePath of candidates) {
           // relativePath e.g. .claude/skills/
           // trim trailing slash
           const cleanPath = relativePath.replace(/\/$/, '');
           const apiUrl = this.withGitHubRef(`https://api.github.com/repos/${owner}/${repo}/contents/${cleanPath}`, ref);
           
           try {
               const res = await fetch(apiUrl, {
                 headers: this.getGitHubHeaders()
               });
               if (res.status === 404) {
                 continue;
               }
               if (res.ok) {
                   const items = await res.json() as unknown as any[];
                   if (Array.isArray(items)) {
                       for (const item of items) {
                           if (item.type === 'dir') {
                               const dirApiUrl = this.withGitHubRef(item.url, ref);
                               const dirRes = await fetch(dirApiUrl, {
                                 headers: this.getGitHubHeaders()
                               });
                               if (dirRes.ok) {
                                   const dirItems = await dirRes.json() as unknown as any[];
                                   const skillMd = dirItems.find((f: any) => f.name === 'SKILL.md');
                                   if (skillMd && skillMd.download_url) {
                                       // Fetch content for MD5
                                       const mdContentRes = await fetch(skillMd.download_url);
                                       const mdBuffer = Buffer.from(await mdContentRes.arrayBuffer());
                                       const md5 = this.calculateMD5FromBuffer(mdBuffer);
                                       const description = this.extractDescriptionFromSkillMd(mdBuffer.toString('utf8'));
                                       
                                       const skill: DiscoveredSkill = {
                                           name: item.name,
                                           path: dirApiUrl, // Store API URL (with ref) for directory
                                           md5: md5,
                                           description,
                                           sourceLocation: repoUrl,
                                           isRemote: true,
                                           remoteUrl: dirApiUrl
                                       };
                                       
                                       total += 1;
                                       if (!this.tempDiscovered.some(s => s.md5 === skill.md5)) {
                                           this.tempDiscovered.push(skill);
                                           added += 1;
                                       }
                                   }
                               }
                           }
                       }
                   }
               }
           } catch (e) {
               console.error(`Failed to scan GitHub path ${relativePath}`, e);
           }
      }

      // Fallback: repo-wide recursive scan for any */SKILL.md (robust to arbitrary repo layouts)
      if (total === 0) {
        const deep = await this.scanGitHubTreeForSkills({ repoUrl, owner, repo, ref });
        return { added: deep.added, total: deep.total };
      }

      return { added, total };
  }

  public async importSkill(skill: DiscoveredSkill): Promise<string> {
    await this.ensureReady();
    const targetDir = path.join(this.storagePath, 'skills', skill.name);
    const existingSkillMd = path.join(targetDir, 'SKILL.md');
    const existingMd5 = (await fs.pathExists(existingSkillMd))
      ? await this.calculateMD5(existingSkillMd)
      : undefined;
    
    if (skill.isRemote && skill.remoteUrl) {
        await fs.ensureDir(targetDir);
        await this.downloadGitHubDirectory(skill.remoteUrl, targetDir);
    } else {
        await fs.copy(skill.path, targetDir, { overwrite: true });
    }

    // Re-compute ID from what we actually imported (line endings / remote fetch etc.)
    const importedSkillMd = path.join(targetDir, 'SKILL.md');
    const importedMd5 = await this.calculateMD5(importedSkillMd);

    // If we overwrote a same-name skill with a different ID, migrate metadata + presets.
    if (existingMd5 && existingMd5 !== importedMd5) {
      const oldMeta = this.config.skills[existingMd5];
      if (oldMeta && !this.config.skills[importedMd5]) {
        this.config.skills[importedMd5] = oldMeta;
      }
      delete this.config.skills[existingMd5];
      this.config.presets = (this.config.presets || []).map(p => ({
        ...p,
        skillIds: (p.skillIds || []).map(id => (id === existingMd5 ? importedMd5 : id))
      }));
    }

    if (!this.config.skills[importedMd5]) {
      this.config.skills[importedMd5] = { tags: [] };
    }

    await this.saveConfig();
    return importedMd5;
  }
  
  private async downloadGitHubDirectory(apiUrl: string, localDir: string) {
      const res = await fetch(apiUrl, {
        headers: this.getGitHubHeaders()
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch ${apiUrl}`);
      }
      const items = await res.json() as any[];
      
      for (const item of items) {
          if (item.type === 'file' && item.download_url) {
              const fileRes = await fetch(item.download_url);
              const buffer = Buffer.from(await fileRes.arrayBuffer());
              await fs.writeFile(path.join(localDir, item.name), buffer);
          } else if (item.type === 'dir') {
              const subDir = path.join(localDir, item.name);
              await fs.ensureDir(subDir);
              // Preserve the same ref parameter if present.
              const nextUrl = apiUrl.includes('ref=') ? this.withGitHubRef(item.url, new URL(apiUrl).searchParams.get('ref') || 'main') : item.url;
              await this.downloadGitHubDirectory(nextUrl, subDir);
          }
      }
  }

  public async deleteSkill(skillId: string): Promise<void> {
      await this.ensureReady();
      const { imported } = await this.scanForSkills();
      const skill = imported.find(s => s.id === skillId);
      if (skill) {
          await fs.remove(skill.path);
          delete this.config.skills[skillId];
          this.config.presets = (this.config.presets || []).map(p => ({
            ...p,
            skillIds: (p.skillIds || []).filter(id => id !== skillId)
          }));
          await this.saveConfig();
      }
  }

  public async updateSkillMetadata(skillId: string, metadata: Partial<SkillMetadata>) {
      await this.ensureReady();
      if (!this.config.skills[skillId]) {
          this.config.skills[skillId] = { tags: [] };
      }
      this.config.skills[skillId] = { ...this.config.skills[skillId], ...metadata };
      await this.saveConfig();
  }
  
  public getPresets(): Preset[] {
      return this.config.presets || [];
  }

  public async savePreset(preset: Preset) {
      await this.ensureReady();
      const { imported } = await this.scanForSkills();
      if (imported.length < 1) {
        throw new Error('Create preset requires at least 1 imported skill');
      }
      const index = this.config.presets.findIndex(p => p.id === preset.id);
      if (index >= 0) {
          this.config.presets[index] = preset;
      } else {
          this.config.presets.push(preset);
      }
      await this.saveConfig();
  }

  public async deletePreset(presetId: string) {
      await this.ensureReady();
      this.config.presets = this.config.presets.filter(p => p.id !== presetId);
      await this.saveConfig();
  }

  private getDefaultExportPath(): string {
      return vscode.workspace.getConfiguration('skillsWizard').get('defaultExportPath') || '.claude/skills/';
  }

  private async pickTargetRootFolder(): Promise<string | undefined> {
    // Prefer workspace folder (if any).
    const picked = await vscode.window.showWorkspaceFolderPick();
    if (picked) {
      return picked.uri.fsPath;
    }

    const activeUri = vscode.window.activeTextEditor?.document?.uri;
    if (activeUri && activeUri.scheme === 'file') {
      return path.dirname(activeUri.fsPath);
    }

    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Select target folder'
    });
    if (!uris || !uris[0]) {
      return undefined; // User cancelled - don't throw error
    }
    return uris[0].fsPath;
  }

  public async exportSkillToWorkspace(skillId: string, merge: boolean = true) {
      await this.ensureReady();
      const { imported } = await this.scanForSkills();
      const skill = imported.find(s => s.id === skillId);
      if (!skill) {
        return;
      }

      const rootPath = await this.pickTargetRootFolder();
      if (!rootPath) {
        return; // User cancelled
      }
      const relativeTarget = this.getDefaultExportPath();
      const targetDir = path.join(rootPath, relativeTarget, skill.name);
      
      await fs.ensureDir(path.dirname(targetDir));
      await fs.copy(skill.path, targetDir, { overwrite: true });
  }
  
  public async applyPreset(presetId: string, mode: 'merge' | 'replace') {
      await this.ensureReady();
      const preset = this.config.presets.find(p => p.id === presetId);
      if (!preset) {
        return;
      }
      
      const { imported } = await this.scanForSkills();
      const skillsToApply = imported.filter(s => preset.skillIds.includes(s.id));
      
      const rootPath = await this.pickTargetRootFolder();
      if (!rootPath) {
        return; // User cancelled
      }
      const relativeTarget = this.getDefaultExportPath();
      const targetBase = path.join(rootPath, relativeTarget);
      
      if (mode === 'replace') {
          if (await fs.pathExists(targetBase)) {
              await fs.emptyDir(targetBase);
          }
      }
      
      for (const skill of skillsToApply) {
          const targetDir = path.join(targetBase, skill.name);
          await fs.copy(skill.path, targetDir, { overwrite: true });
      }
  }

  public updateDefaultExportPath(newPath: string) {
      vscode.workspace.getConfiguration('skillsWizard').update('defaultExportPath', newPath, vscode.ConfigurationTarget.Global);
  }

  public updateStoragePath(newPath: string) {
      vscode.workspace.getConfiguration('skillsWizard').update('storagePath', newPath, vscode.ConfigurationTarget.Global);
  }

  public async getEffectiveStoragePath(): Promise<string> {
      await this.ensureReady();
      return this.storagePath;
  }
}
