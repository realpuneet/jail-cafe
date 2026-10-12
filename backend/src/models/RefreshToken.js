import mongoose from 'mongoose';

/**
 * One document per issued refresh token (rotation => new doc each refresh).
 * `family` groups a login session; reuse of a revoked token revokes the whole family.
 */
const refreshTokenSchema = new mongoose.Schema(
  {
    jti: { type: String, required: true },
    family: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    replacedBy: { type: String }, // jti of the successor
    userAgent: { type: String, maxlength: 300 },
    ip: { type: String, maxlength: 64 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Lookup on every refresh.
refreshTokenSchema.index({ jti: 1 }, { unique: true });
// Revoke a whole family on reuse detection.
refreshTokenSchema.index({ family: 1 });
// Logout-all / admin deactivation.
refreshTokenSchema.index({ userId: 1 });
// TTL: Mongo removes the doc when expiresAt passes.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken =
  mongoose.models.RefreshToken ?? mongoose.model('RefreshToken', refreshTokenSchema);
