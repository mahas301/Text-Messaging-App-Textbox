/**
 * otpStore.js
 * In-memory OTP storage for phone-number-based login.
 * OTPs expire after 5 minutes.
 * No external SMS API needed — OTP is logged to console for testing.
 */

const store = new Map(); // phone → { otp, expiresAt }
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Generate and store a 6-digit OTP for a phone number.
 * Returns the OTP (caller logs it to console).
 */
function generateOTP(phone) {
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  store.set(phone, {
    otp,
    expiresAt: Date.now() + OTP_TTL_MS
  });
  return otp;
}

/**
 * Verify an OTP. Returns true if valid and not expired.
 * Deletes the OTP after successful verification.
 */
function verifyOTP(phone, inputOtp) {
  const entry = store.get(phone);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    store.delete(phone);
    return false;
  }
  if (entry.otp !== String(inputOtp).trim()) return false;
  store.delete(phone); // one-time use
  return true;
}

/**
 * Check if an OTP is pending for this phone
 */
function hasPending(phone) {
  const entry = store.get(phone);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) { store.delete(phone); return false; }
  return true;
}

module.exports = { generateOTP, verifyOTP, hasPending };
