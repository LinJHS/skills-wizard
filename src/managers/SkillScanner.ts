/**
 * Skill Scanner - Handles scanning for skills in various locations
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { DiscoveredSkill } from '../models/types';
import { resolvePath, GLOBAL_SKILL_PATHS, WORKSPACE_SKILL_PATHS, GITHUB_EXTRA_SKILL_PATHS } from '../utils/paths';

export interface ScanResult {
  total: number;
  added: number;
}

export class SkillScanner {
  private tempDiscovered: DiscoveredSkill[] = [];

  /**
   * Scan global and workspace paths for skills
   */
  async scanDefaultPaths(): Promise<DiscoveredSkill[]> {
    this.tempDiscovered = [];
    
    // Scan global paths
    for (const p of GLOBAL_SKILL_PATHS) {
      const resolved = resolvePath(p);
      if (await fs.pathExists(resolved)) {
        await this.scanDirectory(resolved);
      }
    }

    // Scan workspace paths
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
      for (const folder of workspaceFolders) {
        for (const relativePath of WORKSPACE_SKILL_PATHS) {
          const fullPath = path.join(folder.uri.fsPath, relativePath);
          if (await fs.pathExists(fullPath)) {
            await this.scanDirectory(fullPath);
          }
        }
      }
    }

    return this.tempDiscovered;
  }

  /**
   * Scan a custom path for skills
   */
  async scanCustomPath(customPath: string): Promise<ScanResult> {
    const before = this.tempDiscovered.length;
    
    if (!(await fs.pathExists(customPath))) {
      return { total: 0, added: 0 };
    }

    const stat = await fs.stat(customPath);
    if (stat.isDirectory()) {
      // Check if this directory itself is a skill
      const skillMdPath = path.join(customPath, 'SKILL.md');
      if (await fs.pathExists(skillMdPath)) {
        await this.addSkillFromPath(customPath);
      } else {
        // Recursively scan subdirectories
        await this.scanDirectory(customPath);
      }
    }

    const after = this.tempDiscovered.length;
    return { total: after, added: after - before };
  }

  /**
   * Scan GitHub repository for skills
   */
  async scanGitHub(url: string): Promise<ScanResult> {
    const before = this.tempDiscovered.length;

    let owner = '';
    let repo = '';
    let branch = 'main';
    let scanPath = '';

    // Parse URL
    const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)(?:\/tree\/([^\/]+)(?:\/(.+))?)?/);
    if (match) {
      owner = match[1];
      repo = match[2].replace(/\.git$/, '');
      if (match[3]) branch = match[3];
      if (match[4]) scanPath = match[4];
    } else {
      throw new Error('Invalid GitHub URL');
    }

    const baseApiUrl = `https://api.github.com/repos/${owner}/${repo}/contents`;
    
    // First try scanning common paths
    const pathsToScan = scanPath ? [scanPath] : [...WORKSPACE_SKILL_PATHS, ...GITHUB_EXTRA_SKILL_PATHS];
    
    let foundAny = false;
    for (const p of pathsToScan) {
      try {
        const apiUrl = `${baseApiUrl}/${p}?ref=${branch}`;
        await this.scanGitHubDirectory(apiUrl, branch);
        foundAny = true;
      } catch (e) {
        // Path doesn't exist, continue
      }
    }

    // If nothing found and no specific path given, do a full recursive scan
    if (!foundAny && !scanPath) {
      try {
        await this.scanGitHubDirectoryRecursive(`${baseApiUrl}?ref=${branch}`, branch);
      } catch (e) {
        console.error('Failed to scan GitHub repo:', e);
      }
    }

    const after = this.tempDiscovered.length;
    return { total: after, added: after - before };
  }

  /**
   * Get all discovered skills
   */
  getDiscovered(): DiscoveredSkill[] {
    return this.tempDiscovered;
  }

  /**
   * Clear discovered skills
   */
  clearDiscovered(): void {
    this.tempDiscovered = [];
  }

  // Private helper methods

  private async scanDirectory(dir: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir);
      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stat = await fs.stat(fullPath);
        if (stat.isDirectory()) {
          const skillMdPath = path.join(fullPath, 'SKILL.md');
          if (await fs.pathExists(skillMdPath)) {
            await this.addSkillFromPath(fullPath);
          }
        }
      }
    } catch (e) {
      // Ignore permission errors etc.
    }
  }

  private async addSkillFromPath(skillPath: string): Promise<void> {
    const skillMdPath = path.join(skillPath, 'SKILL.md');
    const content = await fs.readFile(skillMdPath, 'utf-8');
    const md5 = crypto.createHash('md5').update(content).digest('hex');
    const name = path.basename(skillPath);
    
    // Parse description from SKILL.md
    const lines = content.split('\n');
    let description = '';
    for (const line of lines) {
      if (line.trim() && !line.startsWith('#')) {
        description = line.trim();
        break;
      }
    }

    // Avoid duplicates
    if (!this.tempDiscovered.find(s => s.md5 === md5)) {
      this.tempDiscovered.push({
        id: md5,
        name,
        description,
        md5,
        path: skillPath,
        isRemote: false
      });
    }
  }

  private async scanGitHubDirectory(apiUrl: string, branch: string): Promise<void> {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const data = await response.json();
    if (!Array.isArray(data)) return;

    for (const item of data) {
      if (item.type === 'dir') {
        const skillMdUrl = `https://api.github.com/repos/${item.url.split('/repos/')[1]}/SKILL.md?ref=${branch}`;
        try {
          const skillResponse = await fetch(skillMdUrl);
          if (skillResponse.ok) {
            const skillData: any = await skillResponse.json();
            const content = Buffer.from(skillData.content, 'base64').toString('utf-8');
            await this.addGitHubSkill(item.name, content, item.html_url);
          }
        } catch (e) {
          // No SKILL.md in this directory
        }
      }
    }
  }

  private async scanGitHubDirectoryRecursive(apiUrl: string, branch: string, depth: number = 0): Promise<void> {
    if (depth > 5) return; // Limit recursion depth

    const response = await fetch(apiUrl);
    if (!response.ok) return;

    const data = await response.json();
    if (!Array.isArray(data)) return;

    for (const item of data) {
      if (item.type === 'file' && item.name === 'SKILL.md') {
        try {
          const skillResponse = await fetch(item.url);
          if (skillResponse.ok) {
            const skillData: any = await skillResponse.json();
            const content = Buffer.from(skillData.content, 'base64').toString('utf-8');
            const dirName = item.path.split('/').slice(0, -1).pop() || 'skill';
            await this.addGitHubSkill(dirName, content, item.html_url);
          }
        } catch (e) {
          console.error('Failed to fetch SKILL.md:', e);
        }
      } else if (item.type === 'dir') {
        await this.scanGitHubDirectoryRecursive(item.url, branch, depth + 1);
      }
    }
  }

  private async addGitHubSkill(name: string, content: string, url: string): Promise<void> {
    const md5 = crypto.createHash('md5').update(content).digest('hex');
    
    // Parse description
    const lines = content.split('\n');
    let description = '';
    for (const line of lines) {
      if (line.trim() && !line.startsWith('#')) {
        description = line.trim();
        break;
      }
    }

    // Avoid duplicates
    if (!this.tempDiscovered.find(s => s.md5 === md5)) {
      this.tempDiscovered.push({
        id: md5,
        name,
        description,
        md5,
        path: url,
        isRemote: true,
        remoteContent: content
      });
    }
  }
}
