import http from 'node:http';
import type { Plugin } from 'vite';
/** The durable worker is a separate process, so browser/Vite reloads cannot interrupt it. */
export function wikiRuntime(): Plugin {
  return { name: 'index-wiki-runtime', apply: 'serve', configureServer(server) {
    server.middlewares.use('/api/wiki', (req, res) => {
      const upstream = http.request({ hostname: '127.0.0.1', port: Number(process.env.WIKI_PORT || 5318), path: '/api/wiki' + req.url, method: req.method, headers: req.headers }, response => {
        res.writeHead(response.statusCode || 502, response.headers); response.pipe(res);
      });
      upstream.on('error', () => { if (!res.headersSent) { res.statusCode = 503; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: '지식 서버가 꺼져 있습니다. npm run wiki:server로 시작해 주세요.' })); } });
      req.pipe(upstream);
    });
  } };
}
