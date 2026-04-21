/**
 * TextBox v4 — app.js
 * Theme | Emoji | Char counter | Compose modal |
 * Socket.IO client | Sidebar resize | Toast | Notifications
 */

/* ══ THEME ══════════════════════════════════════════════════ */
(function applyTheme() {
  const t = localStorage.getItem('tb-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', t);
})();

document.addEventListener('DOMContentLoaded', () => {

  /* Theme toggle button */
  const themeBtn = document.getElementById('themeToggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', async () => {
      const cur  = document.documentElement.getAttribute('data-theme');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('tb-theme', next);
      try { await fetch('/theme-toggle', { method: 'POST' }); } catch (_) {}
    });
  }

  /* Emoji strips */
  const composeStrip = document.getElementById('composeEmojis');
  if (composeStrip) buildEmojiStrip(composeStrip, 'composeBody');
  const replyStrip = document.getElementById('replyEmojis');
  if (replyStrip) buildEmojiStrip(replyStrip, 'replyBody');

  /* Reply textarea: auto-resize + Ctrl+Enter */
  const replyBody = document.getElementById('replyBody');
  if (replyBody) {
    replyBody.addEventListener('input', () => {
      replyBody.style.height = 'auto';
      replyBody.style.height = Math.min(replyBody.scrollHeight, 180) + 'px';
      updateCounter('replyBody', 'replyCounter');
    });
    replyBody.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        document.getElementById('replyForm')?.submit();
      }
    });
  }

  /* Browser notifications */
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  /* Sidebar resize */
  initSidebarResize();
});

/* ══ SIDEBAR RESIZE ═════════════════════════════════════════
   Drag the right edge of the sidebar to resize.
   Width is saved to localStorage and applied on page load.
═══════════════════════════════════════════════════════════ */
function initSidebarResize() {
  const sidebar  = document.getElementById('appSidebar');
  const resizer  = document.getElementById('sidebarResizer');
  if (!sidebar || !resizer) return;

  const MIN = 180;
  const MAX = 420;

  // Apply saved width immediately
  const saved = parseInt(localStorage.getItem('tb-sidebar-w'));
  if (saved && saved >= MIN && saved <= MAX) {
    sidebar.style.width = saved + 'px';
  }

  let startX = 0;
  let startW = 0;
  let dragging = false;

  resizer.addEventListener('mousedown', e => {
    dragging = true;
    startX = e.clientX;
    startW = sidebar.offsetWidth;
    resizer.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const delta = e.clientX - startX;
    const newW  = Math.min(MAX, Math.max(MIN, startW + delta));
    sidebar.style.width = newW + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    resizer.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    localStorage.setItem('tb-sidebar-w', sidebar.offsetWidth);
  });

  // Touch support
  resizer.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startW = sidebar.offsetWidth;
    dragging = true;
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('touchmove', e => {
    if (!dragging) return;
    const delta = e.touches[0].clientX - startX;
    const newW  = Math.min(MAX, Math.max(MIN, startW + delta));
    sidebar.style.width = newW + 'px';
  });

  document.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging = false;
    localStorage.setItem('tb-sidebar-w', sidebar.offsetWidth);
  });
}

/* ══ EMOJI ══════════════════════════════════════════════════ */
const EMOJIS = [
  '😊','😂','😍','🥰','😎','🥲','😭','😤','😅','😇',
  '🤔','😏','😬','😴','🤗','🫡','😘','🤣','😆','🙃',
  '👍','👎','👏','🙌','🤝','💪','🫶','🙏','👀','✌️',
  '❤️','💔','🔥','⭐','✅','❌','🎉','💯','🚀','💬'
];

function buildEmojiStrip(container, targetId) {
  EMOJIS.forEach(emoji => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'e-btn';
    btn.textContent = emoji;
    btn.addEventListener('click', () => insertAtCursor(targetId, emoji));
    container.appendChild(btn);
  });
}

function insertAtCursor(targetId, text) {
  const el = document.getElementById(targetId);
  if (!el) return;
  const s = el.selectionStart, e = el.selectionEnd;
  el.value = el.value.substring(0, s) + text + el.value.substring(e);
  el.selectionStart = el.selectionEnd = s + text.length;
  el.focus();
  updateCounter(targetId, targetId === 'replyBody' ? 'replyCounter' : 'composeCounter');
}

function toggleEmoji() {
  document.getElementById('replyEmojis')?.classList.toggle('hidden');
}

/* ══ CHAR COUNTER ═══════════════════════════════════════════ */
function updateCounter(inputId, counterId) {
  const el = document.getElementById(inputId);
  const ct = document.getElementById(counterId);
  if (!el || !ct) return;
  const len = el.value.length;
  ct.textContent = len + ' / 500';
  ct.classList.toggle('over', len >= 490);
}

/* ══ COMPOSE MODAL ══════════════════════════════════════════ */
function openCompose() {
  const mask = document.getElementById('composeMask');
  if (!mask) return;
  mask.classList.add('open');

  // Pre-fill if URL has ?to= and ?name= params
  const params = new URLSearchParams(window.location.search);
  if (params.get('to')) {
    const inp = mask.querySelector('input[name="contact_number"]');
    if (inp) inp.value = params.get('to');
  }
  if (params.get('name')) {
    const inp = mask.querySelector('input[name="contact_name"]');
    if (inp) inp.value = params.get('name');
  }

  setTimeout(() => mask.querySelector('input[name="contact_number"]')?.focus(), 60);
}

function closeCompose() {
  document.getElementById('composeMask')?.classList.remove('open');
}

document.addEventListener('click',   e => { if (e.target === document.getElementById('composeMask')) closeCompose(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCompose(); });

/* ══ TOAST ══════════════════════════════════════════════════ */
function showToast(msg, icon = '✉', duration = 4000) {
  const wrap = document.getElementById('toastWrap');
  if (!wrap) return;
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<span>${icon}</span><span>${escapeHtml(msg)}</span>`;
  wrap.appendChild(t);
  setTimeout(() => {
    t.classList.add('fade-out');
    setTimeout(() => t.remove(), 320);
  }, duration);
}

/* ══ BROWSER NOTIFICATION ═══════════════════════════════════ */
function sendBrowserNotif(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (document.hasFocus()) return;
  try { new Notification(title, { body, icon: '/favicon.ico' }); } catch (_) {}
}

/* ══ SOCKET.IO CLIENT ═══════════════════════════════════════ */
function initSocket() {
  const TB = window.TB || {};
  if (!TB.myPhone) return;

  const socket = io();
  socket.emit('register', TB.myPhone);

  /* Online / offline */
  socket.on('user_online',  ({ phone }) => markOnline(phone, true));
  socket.on('user_offline', ({ phone }) => markOnline(phone, false));

  /* Check initial contact status (conversation page) */
  if (TB.contactPhone) {
    fetch('/api/online?phone=' + encodeURIComponent(TB.contactPhone))
      .then(r => r.json())
      .then(d => markOnline(TB.contactPhone, d.online))
      .catch(() => {});
  }

  /* Typing */
  const replyBody = document.getElementById('replyBody');
  let typingTimeout = null, isTyping = false;

  if (replyBody && TB.contactPhone) {
    replyBody.addEventListener('input', () => {
      if (!isTyping) {
        isTyping = true;
        socket.emit('typing_start', { toPhone: TB.contactPhone });
      }
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        isTyping = false;
        socket.emit('typing_stop', { toPhone: TB.contactPhone });
      }, 1500);
    });
  }

  socket.on('typing_start', ({ fromPhone }) => {
    if (TB.contactPhone && fromPhone === TB.contactPhone) showTyping(true);
  });
  socket.on('typing_stop', ({ fromPhone }) => {
    if (TB.contactPhone && fromPhone === TB.contactPhone) showTyping(false);
  });

  /* New message (inbound real-time) */
  socket.on('new_message', data => {
    const { conversationId, body, direction, createdAt, fromPhone } = data;
    if (TB.conversationId && TB.conversationId === conversationId) {
      appendBubble({ body, direction: 'inbound', createdAt });
      showTyping(false);
    } else {
      updateConvPreview(conversationId, body);
      incrementInboxBadge();
      showToast('New message from ' + fromPhone, '✉');
      sendBrowserNotif('New TextBox message', body.substring(0, 60));
    }
  });

  /* Message sent confirmation (multi-tab) */
  socket.on('message_sent', data => {
    const { conversationId, body, direction, createdAt } = data;
    if (TB.conversationId && TB.conversationId === conversationId) {
      if (getLastBubbleText() !== body) {
        appendBubble({ body, direction: 'outbound', createdAt });
      }
    }
  });

  /* Unread badge */
  socket.on('unread_update', ({ increment }) => incrementInboxBadge(increment));
}

/* ══ DOM HELPERS ════════════════════════════════════════════ */

function markOnline(phone, isOnline) {
  /* Conversation header pill */
  document.getElementById('contactOnlinePill')?.classList.toggle('hidden', !isOnline);
  /* Inbox list dot */
  const safe = phone.replace(/\+/g, 'p');
  document.getElementById('dot-' + safe)?.classList.toggle('hidden', !isOnline);
}

function showTyping(show) {
  document.getElementById('typingIndicator')?.classList.toggle('hidden', !show);
}

function appendBubble({ body, direction, createdAt }) {
  const scroll = document.getElementById('msgScroll');
  const end    = document.getElementById('msgEnd');
  if (!scroll || !end) return;
  const time = new Date(createdAt).toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
  const row  = document.createElement('div');
  row.className = `msg-row ${direction}`;
  row.innerHTML = `
    <div class="bubble">
      <p class="bubble-text">${escapeHtml(body)}</p>
      <div class="bubble-meta">
        <span class="bubble-time">${time}</span>
        ${direction === 'outbound' ? '<span class="bubble-status">✓✓</span>' : ''}
      </div>
    </div>`;
  scroll.insertBefore(row, end);
  scroll.scrollTop = scroll.scrollHeight;
}

function getLastBubbleText() {
  const bubbles = document.querySelectorAll('.bubble-text');
  return bubbles.length ? bubbles[bubbles.length - 1].textContent : null;
}

function updateConvPreview(conversationId, body) {
  const el = document.getElementById('preview-' + conversationId);
  if (el) {
    el.textContent = body.substring(0, 90) + (body.length > 90 ? '…' : '');
    el.closest('.conv-item')?.classList.add('unread');
  }
}

function incrementInboxBadge(by = 1) {
  const badge = document.getElementById('inboxBadge');
  if (!badge) return;
  const next = (parseInt(badge.textContent) || 0) + by;
  badge.textContent = next;
  badge.classList.remove('hidden');
  badge.style.transform = 'scale(1.4)';
  setTimeout(() => { badge.style.transform = ''; }, 200);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
