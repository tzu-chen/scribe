// gitignore-flavoured exclude patterns for linked folders, matched against
// paths relative to the folder root (always '/'-separated):
//
//   figures/      any directory named "figures", at any depth, and all it holds
//   *_plot.pdf    any file with a matching name, at any depth
//   /draft.pdf    a leading '/' anchors the pattern to the folder root
//   plots/paper/  a '/' in the middle anchors it too
//   **/baseline/  '**' spans any number of directories
//
// Blank lines and lines starting with '#' are ignored; '\' escapes the next
// character. Negation ('!') is not supported.

export interface CompiledPattern {
  re: RegExp;
  /** Pattern ended in '/', so it only matches directories. */
  dirOnly: boolean;
}

const escapeRe = (c: string) => c.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

function globToRegexSource(glob: string): string {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '\\' && i + 1 < glob.length) {
      out += escapeRe(glob[++i]);
    } else if (c === '*' && glob[i + 1] === '*') {
      i++;
      if (glob[i + 1] === '/') {
        i++;
        out += '(?:.*/)?';
      } else {
        out += '.*';
      }
    } else if (c === '*') {
      out += '[^/]*';
    } else if (c === '?') {
      out += '[^/]';
    } else {
      out += escapeRe(c);
    }
  }
  return out;
}

export function compilePatterns(lines: string[]): CompiledPattern[] {
  const out: CompiledPattern[] = [];
  for (const raw of lines) {
    let p = raw.trim();
    if (!p || p.startsWith('#')) continue;
    const dirOnly = p.endsWith('/');
    if (dirOnly) p = p.replace(/\/+$/, '');
    const anchored = p.includes('/');
    p = p.replace(/^\/+/, '');
    if (!p) continue;
    const body = globToRegexSource(p);
    out.push({ re: new RegExp(anchored ? `^${body}$` : `^(?:.*/)?${body}$`), dirOnly });
  }
  return out;
}

/** Whether `rel` itself matches (ancestors are not consulted — the walk prunes those). */
export function matchesPattern(patterns: CompiledPattern[], rel: string, isDir: boolean): boolean {
  return patterns.some(p => (isDir || !p.dirOnly) && p.re.test(rel));
}

/** Whether a file at `rel` is excluded, either directly or through one of its directories. */
export function isExcludedPath(patterns: CompiledPattern[], rel: string): boolean {
  const parts = rel.split('/');
  for (let i = 1; i < parts.length; i++) {
    if (matchesPattern(patterns, parts.slice(0, i).join('/'), true)) return true;
  }
  return matchesPattern(patterns, rel, false);
}

/** An anchored pattern matching exactly this one file, for "Remove from library". */
export function exactPattern(rel: string): string {
  return '/' + rel.replace(/[\\*?]/g, '\\$&');
}
