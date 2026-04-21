/**
 * settings.js — Settings + Contact management routes
 * FIX: always passes activePhone to settings.ejs
 */

const express = require('express');
const router  = express.Router();
const db      = require('../config/db');
const { requireAuth } = require('../middleware/auth');

/* ─── shared helper ─────────────────────────────────────── */
async function getCounts(phoneId) {
  if (!phoneId) return { inbox: 0, spam: 0, trash: 0 };
  const [rows] = await db.query(
    'SELECT status, COUNT(*) AS cnt FROM conversations WHERE owner_phone_id = ? AND is_read = 0 GROUP BY status',
    [phoneId]
  );
  const c = { inbox: 0, spam: 0, trash: 0 };
  rows.forEach(r => { if (c[r.status] !== undefined) c[r.status] = r.cnt; });
  return c;
}

/* ─── GET /settings ─────────────────────────────────────── */
router.get('/settings', requireAuth, async (req, res) => {
  try {
    const [phones] = await db.query('SELECT * FROM phone_numbers WHERE user_id = ?', [req.session.userId]);
    const counts   = await getCounts(req.session.activePhoneId);

    // FIX: derive activePhone safely from phones array
    const activePhoneId  = req.session.activePhoneId || null;
    const activePhoneObj = phones.find(p => p.id == activePhoneId) || null;
    const activePhone    = activePhoneObj ? activePhoneObj.phone_number : null;

    // Load contacts for this user
    const [contacts] = await db.query(
      'SELECT * FROM contacts WHERE user_id = ? ORDER BY name ASC',
      [req.session.userId]
    );

    res.render('settings', {
      phones,
      contacts,
      counts,
      activePhoneId,
      activePhone,           // always defined (null if none)
      theme: req.session.theme || 'dark',
      user: {
        username:    req.session.username,
        displayName: req.session.displayName
      },
      success: req.query.success || null,
      error:   req.query.error   || null
    });
  } catch (err) {
    console.error('SETTINGS ERROR:', err);
    res.redirect('/inbox');
  }
});

/* ─── POST /settings/update-profile ────────────────────── */
router.post('/settings/update-profile', requireAuth, async (req, res) => {
  try {
    const { display_name } = req.body;
    await db.query('UPDATE users SET display_name = ? WHERE id = ?', [display_name, req.session.userId]);
    req.session.displayName = display_name;
    res.redirect('/settings?success=Profile+updated');
  } catch (err) {
    console.error(err);
    res.redirect('/settings?error=Server+error');
  }
});

/* ─── POST /settings/add-phone ──────────────────────────── */
router.post('/settings/add-phone', requireAuth, async (req, res) => {
  const cleaned = (req.body.phone_number || '').replace(/\s+/g, '');
  if (!cleaned) return res.redirect('/settings?error=Phone+number+required');
  try {
    const [ex] = await db.query('SELECT id FROM phone_numbers WHERE phone_number = ?', [cleaned]);
    if (ex.length) return res.redirect('/settings?error=Number+already+registered');
    await db.query(
      'INSERT INTO phone_numbers (user_id, phone_number, label) VALUES (?, ?, ?)',
      [req.session.userId, cleaned, req.body.label || 'Personal']
    );
    res.redirect('/settings?success=Phone+number+added');
  } catch (err) {
    console.error(err);
    res.redirect('/settings?error=Server+error');
  }
});

/* ─── POST /settings/switch-phone ───────────────────────── */
router.post('/settings/switch-phone', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM phone_numbers WHERE id = ? AND user_id = ?',
      [req.body.phone_id, req.session.userId]
    );
    if (rows.length) {
      req.session.activePhoneId = rows[0].id;
      req.session.activePhone   = rows[0].phone_number;
    }
    // Stay on settings if coming from there
    const ref = req.get('Referer') || '/inbox';
    res.redirect(ref.includes('settings') ? '/settings?success=Switched+number' : '/inbox');
  } catch (err) {
    console.error(err);
    res.redirect('/inbox');
  }
});

/* ─── POST /settings/delete-phone ───────────────────────── */
router.post('/settings/delete-phone', requireAuth, async (req, res) => {
  try {
    const [phones] = await db.query('SELECT id FROM phone_numbers WHERE user_id = ?', [req.session.userId]);
    if (phones.length <= 1) return res.redirect('/settings?error=Cannot+remove+last+number');
    await db.query('DELETE FROM phone_numbers WHERE id = ? AND user_id = ?', [req.body.phone_id, req.session.userId]);
    if (req.session.activePhoneId == req.body.phone_id) {
      const rem = phones.find(p => p.id != req.body.phone_id);
      if (rem) {
        const [rp] = await db.query('SELECT * FROM phone_numbers WHERE id = ?', [rem.id]);
        req.session.activePhoneId = rp[0].id;
        req.session.activePhone   = rp[0].phone_number;
      }
    }
    res.redirect('/settings?success=Number+removed');
  } catch (err) {
    console.error(err);
    res.redirect('/settings?error=Server+error');
  }
});

/* ─── POST /contacts/save ───────────────────────────────── */
router.post('/contacts/save', requireAuth, async (req, res) => {
  const { name, phone_number, redirect_to } = req.body;
  const cleaned = (phone_number || '').replace(/\s+/g, '');
  if (!name || !cleaned) return res.redirect('/settings?error=Name+and+number+required');
  try {
    // Upsert: if contact exists for this user, update name
    await db.query(
      `INSERT INTO contacts (user_id, name, phone_number)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name)`,
      [req.session.userId, name.trim(), cleaned]
    );
    // Also update contact_name in any existing conversations
    await db.query(
      `UPDATE conversations SET contact_name = ?
       WHERE owner_user_id = ? AND contact_number = ?`,
      [name.trim(), req.session.userId, cleaned]
    );
    const dest = redirect_to || '/settings';
    const sep  = dest.includes('?') ? '&' : '?';
    res.redirect(dest + sep + 'success=Contact+saved');
  } catch (err) {
    console.error('CONTACT SAVE ERROR:', err);
    res.redirect('/settings?error=Server+error');
  }
});

/* ─── POST /contacts/delete ─────────────────────────────── */
router.post('/contacts/delete', requireAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM contacts WHERE id = ? AND user_id = ?', [req.body.contact_id, req.session.userId]);
    res.redirect('/settings?success=Contact+removed');
  } catch (err) {
    console.error(err);
    res.redirect('/settings?error=Server+error');
  }
});

/* ─── GET /profile/:phone_number ────────────────────────── */
router.get('/profile/:phone', requireAuth, async (req, res) => {
  const { phone } = req.params;
  const phoneId   = req.session.activePhoneId;
  try {
    // Get contact info (saved name or lookup from conversations)
    const [contactRows] = await db.query(
      'SELECT * FROM contacts WHERE user_id = ? AND phone_number = ? LIMIT 1',
      [req.session.userId, phone]
    );
    const contact = contactRows.length ? contactRows[0] : null;

    // Get all conversations with this contact
    const [convRows] = await db.query(
      `SELECT c.*,
        (SELECT body FROM messages WHERE conversation_id = c.id AND is_deleted = 0 ORDER BY created_at DESC LIMIT 1) AS last_message
       FROM conversations c
       WHERE c.owner_phone_id = ? AND c.contact_number = ?
       ORDER BY c.last_message_at DESC`,
      [phoneId, phone]
    );

    // Is this a registered user?
    const [regUser] = await db.query(
      `SELECT u.display_name, u.username FROM users u
       JOIN phone_numbers p ON p.user_id = u.id
       WHERE p.phone_number = ? LIMIT 1`,
      [phone]
    );

    const [phones]  = await db.query('SELECT * FROM phone_numbers WHERE user_id = ?', [req.session.userId]);
    const counts    = await getCounts(phoneId);
    const activePhoneId  = req.session.activePhoneId || null;
    const activePhoneObj = phones.find(p => p.id == activePhoneId) || null;
    const activePhone    = activePhoneObj ? activePhoneObj.phone_number : null;

    res.render('profile', {
      phone,
      contact,
      conversations: convRows,
      registeredUser: regUser.length ? regUser[0] : null,
      phones,
      counts,
      activePhoneId,
      activePhone,
      theme: req.session.theme || 'dark',
      user: { username: req.session.username, displayName: req.session.displayName },
      success: req.query.success || null
    });
  } catch (err) {
    console.error('PROFILE ERROR:', err);
    res.redirect('/inbox');
  }
});

module.exports = router;

/* ─── GET /contacts ─────────────────────────────────────── */
router.get('/contacts', requireAuth, async (req, res) => {
  try {
    const [phones]   = await db.query('SELECT * FROM phone_numbers WHERE user_id = ?', [req.session.userId]);
    const [contacts] = await db.query('SELECT * FROM contacts WHERE user_id = ? ORDER BY name ASC', [req.session.userId]);
    const counts     = await getCounts(req.session.activePhoneId);
    const activePhoneId  = req.session.activePhoneId || null;
    const activePhoneObj = phones.find(p => p.id == activePhoneId) || null;
    const activePhone    = activePhoneObj ? activePhoneObj.phone_number : null;
    res.render('contacts', {
      contacts, phones, counts, activePhoneId, activePhone,
      theme: req.session.theme || 'dark',
      user: { username: req.session.username, displayName: req.session.displayName }
    });
  } catch (err) { console.error(err); res.redirect('/inbox'); }
});
