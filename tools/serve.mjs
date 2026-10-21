// tools/serve.mjs -- a static file server with correct MIME types and no dependencies.
//
// `npm run serve`. ES modules will not load over file://, so some server is required, and
// adding a dependency to serve five file types would be the only dependency in the
// project. Correct Content-Type on .js is the part that actually matters: a wrong one and
// the browser refuses the module with a message that sounds like a syntax error.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT || 8123);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
  '.wasm': 'application/wasm',
};

const server = createServer(async (req, res) => {
  try {
    // Strip the query and fragment by hand rather than via `new URL`. A request path of
    // "//" is a protocol-relative URL with an empty authority, so `new URL("//", base)`
    // THROWS rather than resolving to the root -- which quietly turned into a 404 from
    // the catch below. Repeated slashes are collapsed first, so "//" means the root.
    const raw = (req.url || '/').split('?')[0].split('#')[0];
    let rel = decodeURIComponent(raw).replace(/\/{2,}/g, '/');
    if (!rel.startsWith('/')) rel = `/${rel}`;
    if (rel.endsWith('/')) rel += 'index.html';
    // Containment check: normalize, then verify the result is still under ROOT.
    const target = join(ROOT, normalize(rel));
    if (!target.startsWith(ROOT)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    const info = await stat(target);
    const file = info.isDirectory() ? join(target, 'index.html') : target;
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
  }
});

server.listen(PORT, () => {
  console.log(`NOISE dev server:  http://localhost:${PORT}/`);
  console.log(`serving ${ROOT}`);
});
