/**
 * GitHub repository links (github.com/<owner>/<repo>[/…]). On the home page
 * they all look like "GitHub", so they're shown by repository instead: the
 * repo as the name, the owner underneath and the owner's avatar as the logo.
 */

/** First path segments that are GitHub pages, not users or organisations. */
const RESERVED = new Set([
  'orgs', 'settings', 'marketplace', 'explore', 'topics', 'trending', 'collections', 'sponsors',
  'notifications', 'issues', 'pulls', 'search', 'login', 'join', 'features', 'enterprise', 'pricing',
  'about', 'apps', 'codespaces', 'new', 'organizations', 'site', 'security', 'customer-stories',
]);

export type GithubRepo = { owner: string; repo: string };

export function githubRepo(url: string | undefined | null): GithubRepo | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!/^(www\.)?github\.com$/i.test(u.hostname)) return null;
    const [owner, repo] = u.pathname.split('/').filter(Boolean);
    if (!owner || !repo || RESERVED.has(owner.toLowerCase())) return null;
    return { owner, repo: repo.replace(/\.git$/, '') };
  } catch {
    return null;
  }
}

export const githubAvatar = (owner: string) => `https://github.com/${encodeURIComponent(owner)}.png?size=96`;

/** True for an avatar saved by githubAvatar (it beats the name-based logo). */
export const isGithubAvatar = (src: string | undefined | null) =>
  !!src && /^https:\/\/(github\.com\/[^/]+\.png|avatars\.githubusercontent\.com\/)/.test(src);

/** Folder that GitHub repositories go to by default. */
export const GITHUB_FOLDER = 'GitHub';

/** Response time from which a tile says "lent"; faster ones show nothing. */
export const SLOW_MS = 1000;
