#!/usr/bin/env node
/* serve.mjs — tiny zero-dependency static server for local development.
   Usage: node tools/serve.mjs [port]   (serves the repo-cinema folder) */
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2]) || 8123;
const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.gif': 'image/gif', '.ico': 'image/x-icon'
};

http.createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  // dev helper: POST a PNG data-URL here to save it as og.png
  if (req.method === 'POST' && path === '/__og_upload') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const b64 = body.replace(/^data:image\/png;base64,/, '');
    await writeFile(join(root, 'og.png'), Buffer.from(b64, 'base64'));
    res.writeHead(200);
    res.end('saved');
    return;
  }
  if (path === '/') path = '/index.html';
  try {
    const data = await readFile(join(root, path));
    res.writeHead(200, {
      'Content-Type': MIME[extname(path)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(port, () => console.log('repo-cinema on http://localhost:' + port));
