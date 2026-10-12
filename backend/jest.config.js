export default {
  testEnvironment: 'node',
  transform: {},
  roots: ['<rootDir>/tests'],
  setupFiles: ['<rootDir>/tests/setupEnv.js'],
  collectCoverageFrom: ['src/**/*.js', '!src/server.js'],
};
