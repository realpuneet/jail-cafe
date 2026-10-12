import mongoose from 'mongoose';
import {
  DEPOSIT_STATUS,
  PARTY_STATUS,
  PARTY_STATUS_VALUES,
  PARTY_TYPES,
} from '../utils/constants.js';

const partyInquirySchema = new mongoose.Schema(
  {
    inquiryNumber: { type: String, required: true }, // PI-YYMMDD-0001
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    packageId: { type: mongoose.Schema.Types.ObjectId, ref: 'PartyPackage' },
    // snapshot. A sub-schema, because a plain nested `type` key would be read as the field's type.
    package: {
      type: new mongoose.Schema(
        { name: String, type: { type: String }, pricePerGuest: Number },
        { _id: false },
      ),
      default: undefined,
    },
    eventType: { type: String, enum: PARTY_TYPES, required: true },
    eventDate: { type: String, required: true }, // YYYY-MM-DD (IST)
    startTime: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    guests: { type: Number, required: true, min: 1 },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, required: true },
    email: { type: String, trim: true, lowercase: true, maxlength: 120 },
    requirements: { type: String, trim: true, maxlength: 1000 },
    status: { type: String, enum: PARTY_STATUS_VALUES, default: PARTY_STATUS.SUBMITTED },
    quote: {
      amount: { type: Number, min: 0 }, // total, paise
      tokenAmount: { type: Number, min: 0 }, // advance to confirm, paise
      validUntil: Date,
      notes: { type: String, maxlength: 1000 },
      quotedBy: String,
      quotedAt: Date,
      version: { type: Number, default: 0 },
    },
    token: {
      amount: { type: Number, default: 0 },
      status: { type: String, enum: Object.values(DEPOSIT_STATUS), default: DEPOSIT_STATUS.NONE },
      dueAt: Date,
    },
    dateReserved: { type: Boolean, default: false }, // holds one of the day's party slots
    idempotencyKey: { type: String, maxlength: 80 },
    closeReason: { type: String, maxlength: 300 },
    // Timeline shown to the customer. Bounded: <= ~12 transitions in a lifetime (re-quotes included).
    statusHistory: {
      type: [
        {
          _id: false,
          status: String,
          at: { type: Date, default: Date.now },
          by: String,
          note: String,
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

partyInquirySchema.index({ inquiryNumber: 1 }, { unique: true });
// "My party inquiries", newest first.
partyInquirySchema.index({ userId: 1, _id: -1 });
// Admin inbox by status, oldest waiting first.
partyInquirySchema.index({ status: 1, createdAt: 1 });
// Calendar of events by date.
partyInquirySchema.index({ eventDate: 1, status: 1 });
// Expiry job: unpaid tokens and lapsed quotes.
partyInquirySchema.index(
  { 'token.dueAt': 1 },
  { partialFilterExpression: { status: PARTY_STATUS.ACCEPTED } },
);
partyInquirySchema.index(
  { 'quote.validUntil': 1 },
  { partialFilterExpression: { status: PARTY_STATUS.QUOTED } },
);
partyInquirySchema.index(
  { userId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);

/** How many parties are reserved (accepted or confirmed) on a date. Atomic counter, like seat inventory. */
const partyDaySchema = new mongoose.Schema({
  date: { type: String, required: true },
  booked: { type: Number, default: 0, min: 0 },
  capacity: { type: Number, required: true },
  expiresAt: { type: Date, required: true },
});
partyDaySchema.index({ date: 1 }, { unique: true });
partyDaySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PartyInquiry =
  mongoose.models.PartyInquiry ?? mongoose.model('PartyInquiry', partyInquirySchema);
export const PartyDay = mongoose.models.PartyDay ?? mongoose.model('PartyDay', partyDaySchema);
