/**
 * messages.js — Conversation & message routes
 * UPDATED: resolves contact names from contacts table
 */

const express = require('express');
const router  = express.Router();
const db      = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const socketManager   = require('../socketManager');

/* ─── Helpers ─────────────────────────────────────────────── */
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

async function getPhones(userId) {
  const [rows] = await db.query('SELECT * FROM phone_numbers WHERE user_id = ?', [userId]);
  return rows;
}

function sessionLocals(req) {
  return {
    user: { username: req.session.username, displayName: req.session.displayName },
    activePhoneId: req.session.activePhoneId || null,
    activePhone:   req.session.activePhone   || null,
    theme:         req.session.theme || 'dark'
  };
}

async function ensureConversationPair(fromPhoneId, fromNumber, toNumber, userId) {
  let [rows] = await db.query(
    'SELECT id FROM conversations WHERE owner_phone_id = ? AND contact_number = ?',
    [fromPhoneId, toNumber]
  );
  let senderConvId;
  if (rows.length) {
    senderConvId = rows[0].id;
  } else {
    // Prefer saved contact name
    const [cn] = await db.query('SELECT name FROM contacts WHERE user_id = ? AND phone_number = ? LIMIT 1', [userId, toNumber]);
    const [cu] = await db.query('SELECT u.display_name FROM users u JOIN phone_numbers p ON p.user_id = u.id WHERE p.phone_number = ? LIMIT 1', [toNumber]);
    const contactName = cn.length ? cn[0].name : (cu.length ? cu[0].display_name : toNumber);
    const [ou] = await db.query('SELECT u.id FROM users u JOIN phone_numbers p ON p.user_id = u.id WHERE p.id = ? LIMIT 1', [fromPhoneId]);
    const [res] = await db.query(
      'INSERT INTO conversations (owner_user_id, owner_phone_id, contact_number, contact_name) VALUES (?, ?, ?, ?)',
      [ou[0].id, fromPhoneId, toNumber, contactName]
    );
    senderConvId = res.insertId;
  }

  const [rp] = await db.query('SELECT * FROM phone_numbers WHERE phone_number = ? LIMIT 1', [toNumber]);
  let recipientConvId = null;
  if (rp.length) {
    const [rr] = await db.query(
      'SELECT id FROM conversations WHERE owner_phone_id = ? AND contact_number = ?', [rp[0].id, fromNumber]
    );
    if (rr.length) {
      recipientConvId = rr[0].id;
    } else {
      const [scn] = await db.query('SELECT name FROM contacts WHERE user_id = ? AND phone_number = ? LIMIT 1', [rp[0].user_id, fromNumber]);
      const [su] = await db.query('SELECT u.display_name FROM users u JOIN phone_numbers p ON p.user_id = u.id WHERE p.id = ? LIMIT 1', [fromPhoneId]);
      const senderName = scn.length ? scn[0].name : (su.length ? su[0].display_name : fromNumber);
      const [res2] = await db.query(
        'INSERT INTO conversations (owner_user_id, owner_phone_id, contact_number, contact_name, is_read) VALUES (?, ?, ?, ?, 0)',
        [rp[0].user_id, rp[0].id, fromNumber, senderName]
      );
      recipientConvId = res2.insertId;
    }
  }
  return { senderConvId, recipientConvId };
}

function emitMessage(io, toPhone, event, payload) {
  const sockets = socketManager.getSocketsForPhone(toPhone);
  sockets.forEach(sid => io.to(sid).emit(event, payload));
}

/* ─── GET /inbox | /spam | /trash ────────────────────────── */
router.get('/:folder(inbox|spam|trash)', requireAuth, async (req, res) => {
  const { folder } = req.params;
  const phoneId    = req.session.activePhoneId;
  const search     = req.query.q || '';
  try {
    const phones = await getPhones(req.session.userId);
    const counts = await getCounts(phoneId);
    let conversations = [];
    if (phoneId) {
      let sql = `
        SELECT c.*,
          COALESCE(ct.name, c.contact_name, c.contact_number) AS display_name,
          (SELECT body FROM messages WHERE conversation_id = c.id AND is_deleted = 0 ORDER BY created_at DESC LIMIT 1) AS last_message
        FROM conversations c
        LEFT JOIN contacts ct ON ct.user_id = c.owner_user_id AND ct.phone_number = c.contact_number
        WHERE c.owner_phone_id = ? AND c.status = ?`;
      const params = [phoneId, folder];
      if (search) {
        sql += ' AND (c.contact_name LIKE ? OR c.contact_number LIKE ? OR ct.name LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }
      sql += ' ORDER BY c.last_message_at DESC';
      [conversations] = await db.query(sql, params);
    }
    res.render('inbox', { folder, conversations, phones, counts, search, ...sessionLocals(req) });
  } catch (err) {
    console.error('INBOX ERROR:', err);
    res.status(500).send('Server error: ' + err.message);
  }
});

/* ─── GET /conversation/:id ──────────────────────────────── */
router.get('/conversation/:id', requireAuth, async (req, res) => {
  const phoneId = req.session.activePhoneId;
  try {
    const [cr] = await db.query(
      `SELECT c.*, COALESCE(ct.name, c.contact_name, c.contact_number) AS display_name
       FROM conversations c
       LEFT JOIN contacts ct ON ct.user_id = c.owner_user_id AND ct.phone_number = c.contact_number
       WHERE c.id = ? AND c.owner_phone_id = ?`,
      [req.params.id, phoneId]
    );
    if (!cr.length) return res.redirect('/inbox');
    const conversation = cr[0];
    await db.query('UPDATE conversations SET is_read = 1 WHERE id = ?', [conversation.id]);

    const [messages] = await db.query(
      'SELECT * FROM messages WHERE conversation_id = ? AND is_deleted = 0 ORDER BY created_at ASC',
      [conversation.id]
    );
    const [savedContact] = await db.query(
      'SELECT * FROM contacts WHERE user_id = ? AND phone_number = ? LIMIT 1',
      [req.session.userId, conversation.contact_number]
    );
    const phones = await getPhones(req.session.userId);
    const counts = await getCounts(phoneId);
    res.render('conversation', {
      conversation, messages,
      savedContact: savedContact.length ? savedContact[0] : null,
      phones, counts,
      ...sessionLocals(req)
    });
  } catch (err) {
    console.error('CONVERSATION ERROR:', err);
    res.status(500).send('Server error: ' + err.message);
  }
});

/* ─── POST /conversation/new ─────────────────────────────── */
router.post('/conversation/new', requireAuth, async (req, res) => {
  let { contact_number, contact_name, subject, body } = req.body;
  const phoneId    = req.session.activePhoneId;
  const fromNumber = req.session.activePhone;
  body = (body || '').trim();
  if (!body || !contact_number) return res.redirect('/inbox');
  if (body.length > 500) return res.redirect('/inbox');
  contact_number = contact_number.replace(/\s+/g, '');
  try {
    const io = req.app.get('io');
    const { senderConvId, recipientConvId } = await ensureConversationPair(phoneId, fromNumber, contact_number, req.session.userId);
    if (subject) await db.query('UPDATE conversations SET subject = ? WHERE id = ?', [subject, senderConvId]);
    if (contact_name) await db.query('UPDATE conversations SET contact_name = ? WHERE id = ?', [contact_name, senderConvId]);

    const [sRes] = await db.query(
      'INSERT INTO messages (conversation_id, sender_number, body, direction) VALUES (?, ?, ?, "outbound")',
      [senderConvId, fromNumber, body]
    );
    await db.query('UPDATE conversations SET last_message_at = NOW(), status = "inbox" WHERE id = ?', [senderConvId]);

    if (recipientConvId) {
      const [rRes] = await db.query(
        'INSERT INTO messages (conversation_id, sender_number, body, direction) VALUES (?, ?, ?, "inbound")',
        [recipientConvId, fromNumber, body]
      );
      await db.query('UPDATE conversations SET last_message_at = NOW(), is_read = 0, status = "inbox" WHERE id = ?', [recipientConvId]);
      emitMessage(io, contact_number, 'new_message', { conversationId: recipientConvId, messageId: rRes.insertId, fromPhone: fromNumber, body, direction: 'inbound', createdAt: new Date().toISOString() });
      emitMessage(io, contact_number, 'unread_update', { increment: 1 });
    }
    emitMessage(io, fromNumber, 'message_sent', { conversationId: senderConvId, messageId: sRes.insertId, body, direction: 'outbound', createdAt: new Date().toISOString() });
    res.redirect('/conversation/' + senderConvId);
  } catch (err) {
    console.error('NEW CONV ERROR:', err);
    res.redirect('/inbox');
  }
});

/* ─── POST /conversation/:id/reply ───────────────────────── */
router.post('/conversation/:id/reply', requireAuth, async (req, res) => {
  let { body } = req.body;
  const phoneId    = req.session.activePhoneId;
  const fromNumber = req.session.activePhone;
  body = (body || '').trim();
  if (!body) return res.redirect('/conversation/' + req.params.id);
  if (body.length > 500) return res.redirect('/conversation/' + req.params.id);
  try {
    const io = req.app.get('io');
    const [cr] = await db.query('SELECT * FROM conversations WHERE id = ? AND owner_phone_id = ?', [req.params.id, phoneId]);
    if (!cr.length) return res.redirect('/inbox');
    const conv = cr[0];

    const [sRes] = await db.query(
      'INSERT INTO messages (conversation_id, sender_number, body, direction) VALUES (?, ?, ?, "outbound")',
      [conv.id, fromNumber, body]
    );
    await db.query('UPDATE conversations SET last_message_at = NOW(), status = "inbox" WHERE id = ?', [conv.id]);

    const [rp] = await db.query('SELECT * FROM phone_numbers WHERE phone_number = ? LIMIT 1', [conv.contact_number]);
    if (rp.length) {
      const [rc] = await db.query('SELECT id FROM conversations WHERE owner_phone_id = ? AND contact_number = ?', [rp[0].id, fromNumber]);
      if (rc.length) {
        const [rRes] = await db.query(
          'INSERT INTO messages (conversation_id, sender_number, body, direction) VALUES (?, ?, ?, "inbound")',
          [rc[0].id, fromNumber, body]
        );
        await db.query('UPDATE conversations SET last_message_at = NOW(), is_read = 0, status = "inbox" WHERE id = ?', [rc[0].id]);
        emitMessage(io, conv.contact_number, 'new_message', { conversationId: rc[0].id, messageId: rRes.insertId, fromPhone: fromNumber, body, direction: 'inbound', createdAt: new Date().toISOString() });
        emitMessage(io, conv.contact_number, 'unread_update', { increment: 1 });
      }
    }
    emitMessage(io, fromNumber, 'message_sent', { conversationId: conv.id, messageId: sRes.insertId, body, direction: 'outbound', createdAt: new Date().toISOString() });
    res.redirect('/conversation/' + conv.id);
  } catch (err) {
    console.error('REPLY ERROR:', err);
    res.redirect('/conversation/' + req.params.id);
  }
});

/* ─── POST /conversation/:id/move ────────────────────────── */
router.post('/conversation/:id/move', requireAuth, async (req, res) => {
  const { destination } = req.body;
  if (!['inbox','spam','trash'].includes(destination)) return res.redirect('/inbox');
  try {
    await db.query('UPDATE conversations SET status = ? WHERE id = ? AND owner_phone_id = ?', [destination, req.params.id, req.session.activePhoneId]);
    res.redirect(req.get('Referer') || '/inbox');
  } catch (err) { console.error(err); res.redirect('/inbox'); }
});

/* ─── POST /conversation/:id/delete-permanent ────────────── */
router.post('/conversation/:id/delete-permanent', requireAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM conversations WHERE id = ? AND owner_phone_id = ?', [req.params.id, req.session.activePhoneId]);
    res.redirect('/trash');
  } catch (err) { console.error(err); res.redirect('/trash'); }
});

/* ─── POST /message/:id/delete ───────────────────────────── */
router.post('/message/:id/delete', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT m.*, c.owner_phone_id, c.id AS cid FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE m.id = ?',
      [req.params.id]
    );
    if (!rows.length || rows[0].owner_phone_id !== req.session.activePhoneId) return res.redirect('/inbox');
    await db.query('UPDATE messages SET is_deleted = 1, deleted_at = NOW() WHERE id = ?', [req.params.id]);
    res.redirect('/conversation/' + rows[0].cid);
  } catch (err) { console.error(err); res.redirect('/inbox'); }
});

/* ─── POST /message/:id/restore ──────────────────────────── */
router.post('/message/:id/restore', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT m.*, c.owner_phone_id, c.id AS cid FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE m.id = ?',
      [req.params.id]
    );
    if (!rows.length || rows[0].owner_phone_id !== req.session.activePhoneId) return res.redirect('/inbox');
    await db.query('UPDATE messages SET is_deleted = 0, deleted_at = NULL WHERE id = ?', [req.params.id]);
    res.redirect('/conversation/' + rows[0].cid + '/deleted');
  } catch (err) { console.error(err); res.redirect('/inbox'); }
});

/* ─── GET /conversation/:id/deleted ──────────────────────── */
router.get('/conversation/:id/deleted', requireAuth, async (req, res) => {
  const phoneId = req.session.activePhoneId;
  try {
    const [cr] = await db.query('SELECT * FROM conversations WHERE id = ? AND owner_phone_id = ?', [req.params.id, phoneId]);
    if (!cr.length) return res.redirect('/inbox');
    const conversation = cr[0];
    const [deletedMessages] = await db.query('SELECT * FROM messages WHERE conversation_id = ? AND is_deleted = 1 ORDER BY deleted_at DESC', [conversation.id]);
    const phones = await getPhones(req.session.userId);
    const counts = await getCounts(phoneId);
    res.render('deleted_messages', { conversation, deletedMessages, phones, counts, ...sessionLocals(req) });
  } catch (err) { console.error(err); res.redirect('/inbox'); }
});

module.exports = router;
