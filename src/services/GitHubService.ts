import * as path from 'path';
import * as fs from 'fs-extra';
import { DiscoveredSkill } from '../models/types';
import { WORKSPACE_SKILL_PATHS, GITHUB_EXTRA_SKILL_PATHS } from '../utils/paths';
import { FileService } from './FileService';

/**
 * GitHubService
 * Responsible for GitHub API interactions and remote skill scanning.
 */
export class GitHubService {
  private fileService: FileService;

  constructor(fileService: FileService) {
    this.fileService = fileService;
  }

  /**
   * Parse a GitHub repository URL.
   */
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

  /**
   * Add ref parameter to a GitHub API URL.
   */
  private withGitHubRef(urlStr: string, ref: string): string {
    try {
      const u = new URL(urlStr);
      if (!u.searchParams.has('ref')) {
        u.searchParams.set('ref', ref);
      }
      return u.toString();
    } catch {
      // Fallback for non-absolute URLs
      return urlStr.includes('?') ? `${urlStr}&ref=${encodeURIComponent(ref)}` : `${urlStr}?ref=${encodeURIComponent(ref)}`;
    }
  }

  /**
   * Get headers for GitHub API requests.
   */
  private getGitHubHeaders(): Record<string, string> {
    return {
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'skills-wizard',
    };
  }

  /**
   * Normalize GitHub subpath to have trailing slash (or empty).
   */
  private normalizeGitHubSubPath(subPath: string): string {
    const trimmed = subPath.replace(/^\//, '').replace(/\/$/, '');
    return trimmed.length === 0 ? '' : trimmed + '/';
  }

  /**
   * Scan GitHub repository tree recursively for skills.
   * Uses the Git Tree API for efficient scanning.
   */
  private async scanGitHubTreeForSkills(params: {
    repoUrl: string;
    owner: string;
    repo: string;
    ref: string;
    subPathPrefix?: string;
    maxSkills?: number;
  }): Promise<DiscoveredSkill[]> {
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

    const truncated = skillMdPathsAll.length > maxSkills;
    const skillMdPaths = truncated ? skillMdPathsAll.slice(0, maxSkills) : skillMdPathsAll;

    const skills: DiscoveredSkill[] = [];

    for (const skillMdPath of skillMdPaths) {
      const dirPath = path.posix.dirname(skillMdPath);
      if (dirPath === '.' || dirPath === '/') {
        continue;
      }

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
      const md5 = this.fileService.calculateMD5FromBuffer(mdBuffer);
      const description = this.fileService.extractDescriptionFromSkillMd(mdBuffer.toString('utf8'));

      const skillName = path.posix.basename(dirPath);
      const dirApiUrl = this.withGitHubRef(
        `https://api.github.com/repos/${owner}/${repo}/contents/${dirPath}`,
        ref
      );

      skills.push({
        name: skillName,
        path: dirApiUrl,
        md5,
        description,
        sourceLocation: repoUrl,
        isRemote: true,
        remoteUrl: dirApiUrl,
      });
    }

    return skills;
  }

  /**
   * Scan standard GitHub paths for skills (non-recursive).
   */
  private async scanGitHubStandardPaths(params: {
    repoUrl: string;
    owner: string;
    repo: string;
    ref: string;
    paths: string[];
  }): Promise<DiscoveredSkill[]> {
    const { repoUrl, owner, repo, ref, paths } = params;
    const skills: DiscoveredSkill[] = [];

    for (const relativePath of paths) {
      const cleanPath = relativePath.replace(/\/$/, '');
      const apiUrl = this.withGitHubRef(`https://api.github.com/repos/${owner}/${repo}/contents/${cleanPath}`, ref);
      
      try {
        const res = await fetch(apiUrl, { headers: this.getGitHubHeaders() });
        if (res.status === 404) {
          continue;
        }
        if (res.ok) {
          const items = await res.json() as unknown as any[];
          if (Array.isArray(items)) {
            for (const item of items) {
              if (item.type === 'dir') {
                const dirApiUrl = this.withGitHubRef(item.url, ref);
                const dirRes = await fetch(dirApiUrl, { headers: this.getGitHubHeaders() });
                if (dirRes.ok) {
                  const dirItems = await dirRes.json() as unknown as any[];
                  const skillMd = dirItems.find((f: any) => f.name === 'SKILL.md');
                  if (skillMd && skillMd.download_url) {
                    // Fetch content for MD5
                    const mdContentRes = await fetch(skillMd.download_url);
                    const mdBuffer = Buffer.from(await mdContentRes.arrayBuffer());
                    const md5 = this.fileService.calculateMD5FromBuffer(mdBuffer);
                    const description = this.fileService.extractDescriptionFromSkillMd(mdBuffer.toString('utf8'));
                    
                    skills.push({
                      name: item.name,
                      path: dirApiUrl,
                      md5: md5,
                      description,
                      sourceLocation: repoUrl,
                      isRemote: true,
                      remoteUrl: dirApiUrl
                    });
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

    return skills;
  }

  /**
   * Get the default branch of a GitHub repository.
   */
  private async getDefaultBranch(owner: string, repo: string): Promise<string> {
    try {
      const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: this.getGitHubHeaders()
      });
      if (repoRes.ok) {
        const repoJson = await repoRes.json() as any;
        if (repoJson?.default_branch) {
          return repoJson.default_branch;
        }
      }
    } catch {
      // ignore
    }
    return 'main';
  }

  /**
   * Scan a GitHub repository for skills.
   * 
   * Strategy:
   * - If a specific subPath is provided, do recursive scan within that path
   * - Otherwise, try standard paths first
   * - If no skills found in standard paths, fallback to full repo recursive scan
   */
  public async scanGitHub(repoUrl: string): Promise<DiscoveredSkill[]> {
    const { owner, repo, ref: maybeRef, subPath } = this.parseGitHubRepoUrl(repoUrl);
    const ref = maybeRef || await this.getDefaultBranch(owner, repo);

    // If user provided a specific sub-path, scan recursively inside it
    if (subPath) {
      const prefix = this.normalizeGitHubSubPath(subPath);
      return this.scanGitHubTreeForSkills({
        repoUrl,
        owner,
        repo,
        ref,
        subPathPrefix: prefix,
      });
    }

    // Try standard paths first
    const candidates = [...WORKSPACE_SKILL_PATHS, ...GITHUB_EXTRA_SKILL_PATHS];
    const standardSkills = await this.scanGitHubStandardPaths({
      repoUrl,
      owner,
      repo,
      ref,
      paths: candidates
    });

    // Fallback: repo-wide recursive scan if no skills found
    if (standardSkills.length === 0) {
      return this.scanGitHubTreeForSkills({ repoUrl, owner, repo, ref });
    }

    return standardSkills;
  }

  /**
   * Download a GitHub directory (recursively) to a local directory.
   */
  public async downloadGitHubDirectory(apiUrl: string, localDir: string): Promise<void> {
    const res = await fetch(apiUrl, { headers: this.getGitHubHeaders() });
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
        // Preserve the same ref parameter if present
        const nextUrl = apiUrl.includes('ref=') 
          ? this.withGitHubRef(item.url, new URL(apiUrl).searchParams.get('ref') || 'main') 
          : item.url;
        await this.downloadGitHubDirectory(nextUrl, subDir);
      }
    }
  }
}
