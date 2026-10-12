import mongoose from 'mongoose';

/** Small key/value store for runtime switches an admin can flip without a deploy. */
const settingSchema = new mongoose.Schema(
  { key: { type: String, required: true }, value: { type: mongoose.Schema.Types.Mixed } },
  { timestamps: true },
);
settingSchema.index({ key: 1 }, { unique: true });

export const Setting = mongoose.models.Setting ?? mongoose.model('Setting', settingSchema);
