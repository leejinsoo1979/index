import http from 'node:http';
import type { Plugin } from 'vite';
/** 회의록 AI runs as its own local process (WhisperX jobs outlive Vite reloads); dev proxies to it. */
export function meetingsRuntime(): Plugin {
  return { name: 'index-meetings-runtime', apply: 'serve', configureServer(server) {
    server.middlewares.use('/api/meetings', (req, res) => {
      const upstream = http.request({ hostname: '127.0.0.1', port: Number(process.env.MEETINGS_PORT || 5320), path: '/api/meetings' + (req.url === '/' ? '' : req.url), method: req.method, headers: req.headers }, response => {
        res.writeHead(response.statusCode || 502, response.headers); response.pipe(res);
      });
      upstream.on('error', () => { if (!res.headersSent) { res.statusCode = 503; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: '회의록 서버가 꺼져 있습니다. npm run meetings:server로 시작해 주세요.' })); } });
      req.pipe(upstream);
    });
  } };
}
