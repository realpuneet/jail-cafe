import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

mongoose.set('strictQuery', true);
// Index builds are explicit in production (see docs/db.md); auto-build only in dev/test.
mongoose.set('autoIndex', !env.isProd);

/** Connect to MongoDB using pooled, replica-set-ready options. */
export async function connectDb() {
  mongoose.connection.on('error', (err) => logger.error({ err }, 'mongo connection error'));
  mongoose.connection.on('disconnected', () => logger.warn('mongo disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('mongo reconnected'));

  await mongoose.connect(env.MONGO_URI, {
    dbName: env.MONGO_DB_NAME,
    maxPoolSize: env.MONGO_MAX_POOL_SIZE,
    serverSelectionTimeoutMS: 10_000,
    readPreference: env.MONGO_READ_PREFERENCE,
    retryWrites: true,
    w: 'majority',
  });
  logger.info({ db: env.MONGO_DB_NAME }, 'mongo connected');
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
}

/** @returns {boolean} true when the driver reports a ready connection */
export const isDbReady = () => mongoose.connection.readyState === 1;
