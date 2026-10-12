import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

let replSet;

/** Start an in-memory single-node replica set (transactions work) and connect mongoose. */
export async function startDb() {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    binary: { version: process.env.MONGOMS_VERSION ?? '7.0.14' },
  });
  await mongoose.connect(replSet.getUri(), { dbName: 'jkc_test' });
  await Promise.all(Object.values(mongoose.models).map((m) => m.init())); // build indexes
}

export async function stopDb() {
  await mongoose.disconnect();
  await replSet?.stop();
}

export async function clearDb() {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
}
