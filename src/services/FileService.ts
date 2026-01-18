import * as fs from 'fs-extra';
import * as crypto from 'crypto';
import * as path from 'path';

/**
 * FileService
 * Responsible for file system operations and MD5 hash calculations.
 */
export class FileService {
  /**
   * Calculate MD5 hash of a file.
   */
  public async calculateMD5(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath);
    return this.calculateMD5FromBuffer(buffer);
  }

  /**
   * Calculate MD5 hash from a buffer.
   */
  public calculateMD5FromBuffer(buffer: Buffer): string {
    const hash = crypto.createHash('md5');
    hash.update(buffer);
    return hash.digest('hex');
  }

  /**
   * Extract description from SKILL.md content.
   * Tries to parse YAML frontmatter first, then falls back to first non-empty line.
   */
  public extractDescriptionFromSkillMd(content: string): string | undefined {
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

  /**
   * Read and extract description from a SKILL.md file.
   */
  public async readSkillDescriptionFromFile(skillMdPath: string): Promise<string | undefined> {
    try {
      const content = await fs.readFile(skillMdPath, 'utf8');
      return this.extractDescriptionFromSkillMd(content);
    } catch {
      return undefined;
    }
  }

  /**
   * Check if a directory contains a SKILL.md file.
   */
  public async isSkillDirectory(dirPath: string): Promise<boolean> {
    const skillMdPath = path.join(dirPath, 'SKILL.md');
    return fs.pathExists(skillMdPath);
  }

  /**
   * Recursively scan a directory for skill folders (those containing SKILL.md).
   * 
   * @param dir - Directory to scan
   * @param depth - Current depth
   * @param maxDepth - Maximum depth to scan
   * @returns Array of skill directory paths
   */
  public async scanRecursively(
    dir: string, 
    depth: number = 0, 
    maxDepth: number = 5
  ): Promise<string[]> {
    if (depth > maxDepth) {
      return [];
    }
    const results: string[] = [];
    
    try {
      // Check if this is a skill directory
      const skillMdPath = path.join(dir, 'SKILL.md');
      if (await fs.pathExists(skillMdPath)) {
        return [dir];
      }
      
      // Otherwise, scan subdirectories
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          results.push(...await this.scanRecursively(path.join(dir, entry.name), depth + 1, maxDepth));
        }
      }
    } catch (e) {
      // Ignore access errors
    }
    return results;
  }

  /**
   * Normalize a name for case-insensitive comparison.
   */
  public normalizeName(value: string): string {
    return value.trim().toLowerCase();
  }
}
