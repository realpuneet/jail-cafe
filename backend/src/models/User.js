import mongoose from 'mongoose';
import { ROLE_VALUES, ROLES } from '../utils/constants.js';

const imageSchema = new mongoose.Schema(
  {
    fileId: { type: String, required: true },
    url: { type: String, required: true },
    filePath: { type: String, required: true },
    thumbnailUrl: { type: String },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, trim: true }, // E.164, e.g. +919876543210
    name: { type: String, trim: true, maxlength: 80, default: '' },
    email: { type: String, trim: true, lowercase: true, maxlength: 120 },
    passwordHash: { type: String, select: false }, // only for admin/staff/rider
    role: { type: String, enum: ROLE_VALUES, default: ROLES.CUSTOMER },
    isActive: { type: Boolean, default: true },
    avatar: { type: imageSchema, default: undefined },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
);

// Login by phone (OTP) and uniqueness.
userSchema.index({ phone: 1 }, { unique: true });
// Staff login by email; partial so customers without email don't collide on null.
userSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string' } } },
);
// Admin user lists filtered by role, newest first.
userSchema.index({ role: 1, _id: -1 });

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

export const User = mongoose.models.User ?? mongoose.model('User', userSchema);
