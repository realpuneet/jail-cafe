import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { env } from './env.js';

const spec = JSON.parse(
  readFileSync(fileURLToPath(new URL('../docs/openapi.json', import.meta.url)), 'utf8'),
);
spec.info.title = `${env.CAFE_NAME} API`;
spec.servers = [{ url: env.API_PREFIX }];

/** OpenAPI document served at /api/docs (and /api/docs.json). Modules append their paths. */
export const swaggerSpec = spec;
