// PM2 cluster config. Use `pm2-runtime ecosystem.config.cjs` in containers.
// Socket.io note: with multiple instances use sticky sessions at the LB (or websocket-only transport).
module.exports = {
  apps: [
    {
      name: 'jkc-api',
      script: 'src/server.js',
      exec_mode: 'cluster',
      instances: 'max',
      max_memory_restart: '500M',
      kill_timeout: 20000, // > SHUTDOWN_TIMEOUT_MS in server.js
      listen_timeout: 10000,
      env_production: { NODE_ENV: 'production' },
    },
  ],
};
