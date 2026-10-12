/** Minimal in-memory stand-in for the ioredis commands the app uses (tests only). */
export class FakeRedis {
  constructor() {
    this.store = new Map(); // key -> { value, expiresAt }
    this.status = 'ready';
  }
  #live(key) {
    const e = this.store.get(key);
    if (!e) return null;
    if (e.expiresAt && e.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return e;
  }
  async get(key) {
    return this.#live(key)?.value ?? null;
  }
  async set(key, value, ...opts) {
    const nx = opts.includes('NX');
    if (nx && this.#live(key)) return null;
    const exIdx = opts.indexOf('EX');
    const expiresAt = exIdx >= 0 ? Date.now() + Number(opts[exIdx + 1]) * 1000 : undefined;
    this.store.set(key, { value: String(value), expiresAt });
    return 'OK';
  }
  async del(...keys) {
    return keys.reduce((n, k) => n + (this.store.delete(k) ? 1 : 0), 0);
  }
  async exists(key) {
    return this.#live(key) ? 1 : 0;
  }
  async incr(key) {
    const e = this.#live(key);
    const next = (e ? Number(e.value) : 0) + 1;
    this.store.set(key, { value: String(next), expiresAt: e?.expiresAt });
    return next;
  }
  async expire(key, seconds) {
    const e = this.#live(key);
    if (!e) return 0;
    e.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }
  async ttl(key) {
    const e = this.#live(key);
    if (!e) return -2;
    return e.expiresAt ? Math.ceil((e.expiresAt - Date.now()) / 1000) : -1;
  }
  async ping() {
    return 'PONG';
  }
  async quit() {}
  flushall() {
    this.store.clear();
  }
}
