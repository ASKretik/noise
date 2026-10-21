// bench/cli.js -- "was this file run directly?"
//
// The usual `import.meta.url === \`file://${process.argv[1]}\`` idiom silently fails
// whenever the script is invoked by a relative path, which is how npm scripts invoke it,
// and a benchmark that exits zero having done nothing is worse than one that crashes.
import { pathToFileURL } from 'node:url';

export function isMain(metaUrl) {
  if (!process.argv[1]) return false;
  try {
    return metaUrl === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
}

/** Minimal flag parsing: --key=value, --key value, --flag. */
export function args(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const eq = a.indexOf('=');
    if (eq > 0) { out[a.slice(2, eq)] = a.slice(eq + 1); continue; }
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) { out[a.slice(2)] = next; i++; }
    else out[a.slice(2)] = true;
  }
  return out;
}

export const num = (v, d) => (v === undefined ? d : Number(v));
