// Deterministic env for tests; no real Mongo/Redis is contacted by unit tests.
process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/?replicaSet=rs0';
process.env.REDIS_URL = 'redis://127.0.0.1:6379';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-test-access-secret-1234';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-test-refresh-secret-123';
process.env.CLIENT_URLS = 'http://localhost:5173';
process.env.LOG_LEVEL = 'silent';
process.env.MONGOMS_VERSION ??= '7.0.14';
process.env.IMAGEKIT_URL_ENDPOINT = 'https://ik.imagekit.io/test';
process.env.IMAGEKIT_PUBLIC_KEY = 'pk_test';
process.env.IMAGEKIT_PRIVATE_KEY = 'sk_test';
// Per-IP limiter would trip across many requests from one supertest client.
process.env.AUTH_RATE_LIMIT_MAX = '10000';
process.env.RATE_LIMIT_MAX = '100000';
process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
process.env.RAZORPAY_KEY_SECRET = 'rzp_test_secret_value';
process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test_value';
process.env.REDIS_URL = process.env.REDIS_TEST_URL ?? process.env.REDIS_URL;
// Isolate from any dev server / other test run sharing the same Redis (queues, caches, limits).
process.env.REDIS_KEY_PREFIX = `jkctest${process.pid}:`;
