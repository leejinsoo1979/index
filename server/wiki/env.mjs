import { readFileSync, existsSync } from 'node:fs';
import { parseEnv } from 'node:util';
export function loadEnvironment() {
  const values = {};
  for (const name of ['.env', '.env.local', '.env.development', '.env.development.local']) {
    if (existsSync(name)) Object.assign(values, parseEnv(readFileSync(name, 'utf8')));
  }
  for (const [key, value] of Object.entries(values)) if (process.env[key] === undefined) process.env[key] = value;
}
