const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const zlib = require('zlib');
const { EventEmitter } = require('events');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/weddingDB';

// Event system for real-time notifications
const dashboardEvents = new EventEmitter();
dashboardEvents.on('newEvent', (data) => console.log('📅 New event created:', data.title));
dashboardEvents.on('newGuest', (data) => console.log('👤 Guest added:', data.name));
dashboardEvents.on('newVendor', (data) => console.log('🏢 Vendor added:', data.name));

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'wedding_session_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// Security headers middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Request logger middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} [${req.method}] ${req.path}`);
  next();
});

// Compression middleware using zlib for JSON responses
app.use((req, res, next) => {
  const acceptEncoding = req.headers['accept-encoding'] || '';
  if (acceptEncoding.includes('gzip') && req.path.startsWith('/api')) {
    const originalJson = res.json.bind(res);
    res.json = function(data) {
      const jsonStr = JSON.stringify(data);
      if (jsonStr.length > 1024) {
        zlib.gzip(jsonStr, (err, compressed) => {
          if (err) return originalJson(data);
          res.setHeader('Content-Encoding', 'gzip');
          res.setHeader('Content-Type', 'application/json');
          res.send(compressed);
        });
      } else {
        originalJson(data);
      }
    };
  }
  next();
});

// ─── Static Files ─────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/events', require('./routes/events'));
app.use('/api/guests', require('./routes/guests'));
app.use('/api/vendors', require('./routes/vendors'));
app.use('/api/budget', require('./routes/budget'));
app.use('/api/checklists', require('./routes/checklists'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// ─── SPA Fallback ─────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ─── MongoDB Connection ───────────────────────────────────────────────────────
mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    app.listen(PORT, () => {
      console.log(`🌸 Wedding Dashboard running at http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err.message);
    console.log('🔄 Starting server without DB (limited functionality)...');
    app.listen(PORT, () => {
      console.log(`🌸 Wedding Dashboard running at http://localhost:${PORT} (no DB)`);
    });
  });

module.exports = app;
