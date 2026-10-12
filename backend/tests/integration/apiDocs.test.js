import { createApp } from '../../src/app.js';
import { swaggerSpec } from '../../src/config/swagger.js';
import { env } from '../../src/config/env.js';

/**
 * Walk Express's router stack and list every registered route, so a new endpoint cannot ship
 * undocumented (and therefore outside the generated access-control tests in security.test.js).
 */
function collectRoutes(stack, prefix = '', out = []) {
  for (const layer of stack) {
    if (layer.route) {
      for (const method of Object.keys(layer.route.methods))
        out.push({ method, path: prefix + layer.route.path });
    } else if (layer.name === 'router' && layer.handle.stack) {
      const mount = layer.regexp.source
        .replace('\\/?(?=\\/|$)', '')
        .replace(/^\^/, '')
        .replace(/\\\//g, '/')
        .replace(/\$$/, '');
      collectRoutes(layer.handle.stack, prefix + mount, out);
    }
  }
  return out;
}

const norm = (p) => p.replace(/:([A-Za-z]+)/g, '{$1}').replace(/\/+$/, '') || '/';

describe('API documentation is complete and accurate', () => {
  const app = createApp({ readinessChecks: {} });
  const registered = collectRoutes(app._router.stack)
    .filter((r) => r.path.startsWith(env.API_PREFIX))
    .map((r) => ({ method: r.method, path: norm(r.path.slice(env.API_PREFIX.length)) }));
  const documented = new Set(
    Object.entries(swaggerSpec.paths).flatMap(([p, item]) =>
      Object.keys(item).map((m) => `${m} ${norm(p)}`),
    ),
  );

  it('finds a realistic number of routes', () => {
    expect(registered.length).toBeGreaterThan(100);
  });

  it('every registered route is documented', () => {
    const missing = registered
      .map((r) => `${r.method} ${r.path}`)
      .filter((k) => !documented.has(k));
    expect(missing).toEqual([]);
  });

  it('every documented operation exists (no stale docs)', () => {
    const live = new Set(registered.map((r) => `${r.method} ${r.path}`));
    const stale = [...documented].filter((k) => !live.has(k));
    expect(stale).toEqual([]);
  });
});
