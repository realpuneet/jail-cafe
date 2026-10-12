import mongoose from 'mongoose';

/** The only image fields we persist (ImageKit). */
export const imageSchema = new mongoose.Schema(
  {
    fileId: { type: String, required: true },
    url: { type: String, required: true },
    filePath: { type: String, required: true },
    thumbnailUrl: { type: String },
  },
  { _id: false },
);
