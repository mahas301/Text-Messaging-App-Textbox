/**
 * auth.js — Authentication routes
 * Supports TWO login methods:
 *  1. Username + Password (original)
 *  2. Phone Number + OTP  (new — console-logged for testing)
 */

const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const db       = require('../config/db');
const otpStore = require('../otpStore');

// ── Helper: populate session after login ──────────────────
async function loadSession(req, userId) {
  const [users]  = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
  if (!users.length) return false;
  const user = users[0];
  const [phones] = await db.query(
    'SELECT * FROM phone_numbers WHERE user_id = ? AND is_active = 1 ORDER BY id ASC LIMIT 1',
    [userId]
  );
  req.session.userId      = user.id;
  req.session.username    = user.username;
  req.session.displayName = user.display_name || user.username;
  req.session.theme       = user.theme || 'dark';
  req.session.activePhoneId = phones.length ? phones[0].id : null;
  req.session.activePhone   = phones.length ? phones[0].phone_number : null;
  return true;
}

// ── GET /login ────────────────────────────────────────────
router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/inbox');
  res.render('login', { error: null, info: null, otpSent: false, otpPhone: null });
});

// ── POST /login — username + password ────────────────────
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    if (!rows.length) return res.render('login', { error: 'Invalid username or password.', info: null, otpSent: false, otpPhone: null });
    const match = await bcrypt.compare(password, rows[0].password_hash);
    if (!match) return res.render('login', { error: 'Invalid username or password.', info: null, otpSent: false, otpPhone: null });
    await loadSession(req, rows[0].id);
    res.redirect('/inbox');
  } catch (err) {
    console.error('LOGIN ERROR:', err);
    res.render('login', { error: 'Server error: ' + err.message, info: null, otpSent: false, otpPhone: null });
  }
});

// ── POST /login/otp/request — phone number → send OTP ────
router.post('/login/otp/request', async (req, res) => {
  let phone = (req.body.phone || '').replace(/\s+/g, '');
  if (!phone || !/^\+?[0-9]{7,15}$/.test(phone))
    return res.render('login', { error: 'Enter a valid phone number.', info: null, otpSent: false, otpPhone: null });

  const [rows] = await db.query('SELECT id FROM phone_numbers WHERE phone_number = ?', [phone]);
  if (!rows.length)
    return res.render('login', {
      error: 'No account found for that number. Register first.',
      info: null, otpSent: false, otpPhone: null
    });

  const otp = otpStore.generateOTP(phone);
  console.log(`\n🔑 OTP for ${phone} → ${otp}  (expires 5 min)\n`);

  res.render('login', {
    error: null,
    info: `OTP generated for ${phone}. Check the server console (terminal) for the code.`,
    otpSent: true,
    otpPhone: phone
  });
});

// ── POST /login/otp/verify — verify OTP ──────────────────
router.post('/login/otp/verify', async (req, res) => {
  let phone = (req.body.phone || '').replace(/\s+/g, '');
  const otp = req.body.otp;

  if (!otpStore.verifyOTP(phone, otp))
    return res.render('login', { error: 'Invalid or expired OTP.', info: null, otpSent: true, otpPhone: phone });

  try {
    const [rows] = await db.query(
      'SELECT p.user_id FROM phone_numbers p WHERE p.phone_number = ? LIMIT 1', [phone]
    );
    if (!rows.length) return res.render('login', { error: 'Account not found.', info: null, otpSent: false, otpPhone: null });
    await loadSession(req, rows[0].user_id);
    res.redirect('/inbox');
  } catch (err) {
    console.error('OTP VERIFY ERROR:', err);
    res.render('login', { error: 'Server error: ' + err.message, info: null, otpSent: false, otpPhone: null });
  }
});

// ── GET /register ─────────────────────────────────────────
router.get('/register', (req, res) => {
  if (req.session.userId) return res.redirect('/inbox');
  res.render('register', { error: null });
});

// ── POST /register ────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { username, display_name, password, phone_number, phone_label } = req.body;
  if (!username || !password || !phone_number)
    return res.render('register', { error: 'Username, password and phone number are required.' });
  const cleaned = phone_number.replace(/\s+/g, '');
  if (!/^\+?[0-9]{7,15}$/.test(cleaned))
    return res.render('register', { error: 'Enter a valid phone number (7–15 digits).' });
  try {
    const [eu] = await db.query('SELECT id FROM users WHERE username = ?', [username]);
    if (eu.length) return res.render('register', { error: 'Username already taken.' });
    const [ep] = await db.query('SELECT id FROM phone_numbers WHERE phone_number = ?', [cleaned]);
    if (ep.length) return res.render('register', { error: 'Phone number already registered.' });
    const hash = await bcrypt.hash(password, 10);
    const [r]  = await db.query(
      'INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)',
      [username, hash, display_name || username]
    );
    await db.query('INSERT INTO phone_numbers (user_id, phone_number, label) VALUES (?, ?, ?)',
      [r.insertId, cleaned, phone_label || 'Personal']);
    res.redirect('/login');
  } catch (err) {
    console.error('REGISTER ERROR:', err);
    res.render('register', { error: 'Server error: ' + err.message });
  }
});

// ── POST /logout ──────────────────────────────────────────
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// ── POST /theme-toggle ────────────────────────────────────
router.post('/theme-toggle', async (req, res) => {
  if (!req.session.userId) return res.json({ ok: false });
  const t = req.session.theme === 'dark' ? 'light' : 'dark';
  req.session.theme = t;
  try { await db.query('UPDATE users SET theme = ? WHERE id = ?', [t, req.session.userId]); } catch (_) {}
  res.json({ ok: true, theme: t });
});

module.exports = router;
