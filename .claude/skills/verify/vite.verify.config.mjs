// Verification-only Vite config: the app's own config on a side port, proxying
// to a side backend, plus scaffolding routes the app never sees:
//   GET  /__verify/page-helpers.js  in-page drive/capture helpers (page-helpers.js)
//   GET  /__verify/fixtures/<name>  fixture bytes, so the in-app browser can put
//                                   them into the real upload inputs
//   POST /__verify/evidence/<name>  writes the body into the current evidence dir
//                                   (named by .run/evidence, set by `verify.sh evidence`)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import base from '../../../frontend/vite.config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(here, 'fixtures');
const runDir = path.join(here, '.run');
const api = process.env.PT_API || 'http://127.0.0.1:8010';
const port = Number(process.env.PT_WEB_PORT || 5183);

const verifyRoutes = {
  name: 'verify-routes',
  configureServer(server) {
    server.middlewares.use('/__verify/page-helpers.js', (req, res) => {
      res.setHeader('Content-Type', 'text/javascript');
      res.setHeader('Cache-Control', 'no-store');
      fs.createReadStream(path.join(here, 'page-helpers.js')).pipe(res);
    });
    server.middlewares.use('/__verify/fixtures/', (req, res) => {
      const name = path.basename(decodeURIComponent(req.url.split('?')[0]));
      const file = path.join(fixturesDir, name);
      if (!name || !fs.existsSync(file)) {
        res.statusCode = 404;
        res.end('no such fixture');
        return;
      }
      res.setHeader('Content-Type', 'application/octet-stream');
      fs.createReadStream(file).pipe(res);
    });
    server.middlewares.use('/__verify/evidence/', (req, res) => {
      const name = path.basename(decodeURIComponent(req.url.split('?')[0]));
      let dir = '';
      try {
        dir = fs.readFileSync(path.join(runDir, 'evidence'), 'utf8').trim();
      } catch {}
      if (req.method !== 'POST' || !name || !dir || !fs.existsSync(dir)) {
        res.statusCode = 400;
        res.end('POST only, and run `verify.sh evidence <label>` first');
        return;
      }
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        let body = Buffer.concat(chunks);
        const m = /^data:[^;,]+;base64,/.exec(body.subarray(0, 64).toString());
        if (m) body = Buffer.from(body.toString().slice(m[0].length), 'base64');
        fs.writeFileSync(path.join(dir, name), body);
        res.end(path.join(dir, name));
      });
    });
  },
};

export default {
  ...base,
  plugins: [...base.plugins, verifyRoutes],
  cacheDir: path.join(runDir, 'vite-cache'), // leave the user's dev-server cache alone
  server: { ...base.server, port, strictPort: true, host: '127.0.0.1', proxy: { '/api': api } },
};
