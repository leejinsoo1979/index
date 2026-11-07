import { build } from 'esbuild';
import { readdirSync } from 'node:fs';
const entryPoints = readdirSync('api').filter(f => f.endsWith('.ts') && !f.startsWith('_')).map(f => 'api/' + f);
await build({ entryPoints, outdir: '.index-runtime/api', outExtension: { '.js': '.mjs' }, platform: 'node', target: 'node24', format: 'esm', bundle: true, packages: 'external', logLevel: 'warning' });
console.log('INDEX server APIs built.');
