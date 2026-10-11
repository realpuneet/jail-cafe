// Deterministic env for tests; no real Mongo/Redis is contacted by unit tests.
process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/?replicaSet=rs0';
process.env.REDIS_URL = 'redis://127.0.0.1:6379';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-test-access-secret-1234';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-test-refresh-secret-123';
process.env.CLIENT_URLS = 'http://localhost:5173';
process.env.LOG_LEVEL = 'silent';
