/**
 * socketManager.js
 * Central hub for all Socket.IO real-time logic.
 * Tracks online users, typing indicators, and message delivery.
 */

// Map: phoneNumber → Set of socket IDs  (one user = multiple tabs/devices)
const onlineUsers = new Map();

/**
 * Register socket with a phone number
 */
function addSocket(phone, socketId) {
  if (!onlineUsers.has(phone)) onlineUsers.set(phone, new Set());
  onlineUsers.get(phone).add(socketId);
}

/**
 * Remove a socket (on disconnect)
 */
function removeSocket(phone, socketId) {
  const sockets = onlineUsers.get(phone);
  if (!sockets) return;
  sockets.delete(socketId);
  if (sockets.size === 0) onlineUsers.delete(phone);
}

/**
 * Get all socket IDs for a phone number
 */
function getSocketsForPhone(phone) {
  return onlineUsers.has(phone) ? [...onlineUsers.get(phone)] : [];
}

/**
 * Check if a phone number is online
 */
function isOnline(phone) {
  return onlineUsers.has(phone) && onlineUsers.get(phone).size > 0;
}

/**
 * Get list of all online phone numbers
 */
function getOnlinePhones() {
  return [...onlineUsers.keys()];
}

/**
 * Attach Socket.IO event handlers
 * @param {import('socket.io').Server} io
 */
function init(io) {
  io.on('connection', (socket) => {
    let myPhone = null; // phone number this socket belongs to

    // ── REGISTER: client sends their phone number after connect ──
    socket.on('register', (phone) => {
      if (!phone) return;
      myPhone = phone;
      addSocket(phone, socket.id);

      // Join a personal room named after phone number
      socket.join(`phone:${phone}`);

      console.log(`[Socket] ${phone} connected (${socket.id})`);

      // Broadcast online status to everyone
      io.emit('user_online', { phone });
    });

    // ── TYPING ───────────────────────────────────────────────────
    socket.on('typing_start', ({ toPhone }) => {
      if (!myPhone || !toPhone) return;
      // Send only to recipient
      io.to(`phone:${toPhone}`).emit('typing_start', { fromPhone: myPhone });
    });

    socket.on('typing_stop', ({ toPhone }) => {
      if (!myPhone || !toPhone) return;
      io.to(`phone:${toPhone}`).emit('typing_stop', { fromPhone: myPhone });
    });

    // ── DISCONNECT ───────────────────────────────────────────────
    socket.on('disconnect', () => {
      if (!myPhone) return;
      removeSocket(myPhone, socket.id);
      console.log(`[Socket] ${myPhone} disconnected (${socket.id})`);

      // Only broadcast offline if no more sockets for this phone
      if (!isOnline(myPhone)) {
        io.emit('user_offline', { phone: myPhone });
      }
    });
  });
}

module.exports = { init, getSocketsForPhone, isOnline, getOnlinePhones, addSocket, removeSocket };
