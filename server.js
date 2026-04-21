require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const session    = require('express-session');
const path       = require('path');

const socketManager = require('./backend/socketManager');

const app    = express();
const server = http.createServer(app);

// ── Socket.IO ─────────────────────────────────────────────
const io = new Server(server, { cors: { origin: '*' } });
socketManager.init(io);
app.set('io', io); // make io available in routes

// ── View engine ───────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'frontend/views'));

// ── Static files ──────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'frontend/public')));

// ── Body parsing ──────────────────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ── Session ───────────────────────────────────────────────
app.use(session({
  secret: process.env.SESSION_SECRET || 'textbox_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7, sameSite: 'lax' }
}));

// ── Routes ────────────────────────────────────────────────
app.use('/', require('./backend/routes/auth'));
app.use('/', require('./backend/routes/messages'));
app.use('/', require('./backend/routes/settings'));

// ── API: online status ────────────────────────────────────
app.get('/api/online', (req, res) => {
  const { phone } = req.query;
  res.json({ online: phone ? socketManager.isOnline(phone) : false });
});

// ── Root ──────────────────────────────────────────────────
app.get('/', (req, res) => res.redirect(req.session.userId ? '/inbox' : '/login'));
app.use((req, res) => res.status(404).redirect('/inbox'));

// ── Listen on 0.0.0.0 for LAN access ─────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  TextBox v3  —  Real-time SMS Messenger');
  console.log('  Local  →  http://localhost:' + PORT);
  console.log('  LAN    →  http://<YOUR_LAN_IP>:' + PORT);
  console.log('  Run ipconfig (Win) / ifconfig (Mac/Linux)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});
