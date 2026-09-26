/** A path as a row shows it: relative to the project root, or whole and flagged when outside it. */
export type ShownPath = { text: string; isOutside: boolean }

/**
 * Shows `path` relative to `root`: `plugins\a.ts` for `C:\proj\plugins\a.ts`,
 * `.` for the root itself. The match ignores case and treats `\` and `/`
 * alike; what follows the root keeps the model's own separators. A relative
 * path counts as inside; an absolute one elsewhere stays whole, flagged.
 */
export function shownPath(path: string, root: string | undefined): ShownPath {
  if (!isAbsolute(path)) return { text: path, isOutside: false }
  if (!root) return { text: path, isOutside: false }

  const base = comparable(root).replace(/\/+$/, '')
  const target = comparable(path)
  if (target === base || target === `${base}/`) return { text: '.', isOutside: false }
  if (target.startsWith(`${base}/`)) return { text: path.slice(base.length + 1), isOutside: false }
  return { text: path, isOutside: true }
}

/** Whether a path is absolute on Windows (`C:\`, `\\server`) or POSIX (`/`). */
export function isAbsolute(path: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(path) || /^[\\/]/.test(path)
}

/** A path in one form for comparing: forward slashes, lower case. */
function comparable(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase()
}
