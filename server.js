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

// Reset password page
app.get('/reset-password', (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.status(400).send(`
      <html>
        <head><title>Invalid Reset Link</title></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h1>Invalid Reset Link</h1>
          <p>The password reset link is invalid or missing.</p>
          <a href="/">Go back to login</a>
        </body>
      </html>
    `);
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reset Password - Eterné</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'DM Sans', sans-serif;
          background: linear-gradient(135deg, #0d0b09 0%, #1c1916 100%);
          color: #e8e0d0;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .reset-container {
          background: #201d1a;
          border: 1px solid rgba(201,169,110,0.15);
          border-radius: 24px;
          padding: 48px;
          max-width: 400px;
          width: 100%;
          box-shadow: 0 24px 80px rgba(0,0,0,0.6);
        }
        .logo {
          text-align: center;
          margin-bottom: 32px;
          font-family: 'Cormorant Garamond', serif;
          font-size: 32px;
          color: #c9a96e;
        }
        .form-group { margin-bottom: 20px; }
        .form-label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          color: #a09080;
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .form-input {
          width: 100%;
          padding: 14px 16px;
          background: #141210;
          border: 1px solid rgba(201,169,110,0.08);
          border-radius: 10px;
          color: #e8e0d0;
          font-size: 14px;
          transition: all 0.2s;
        }
        .form-input:focus {
          border-color: #c9a96e;
          outline: none;
        }
        .btn {
          width: 100%;
          padding: 14px;
          background: #c9a96e;
          color: #0d0b09;
          border: none;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn:hover { background: #e8c98a; }
        .btn:disabled {
          background: #6a5f52;
          cursor: not-allowed;
        }
        .message {
          margin-top: 16px;
          padding: 12px;
          border-radius: 8px;
          font-size: 14px;
        }
        .success { background: rgba(122,154,138,0.1); color: #7a9a8a; border: 1px solid rgba(122,154,138,0.2); }
        .error { background: rgba(201,122,138,0.1); color: #c97a8a; border: 1px solid rgba(201,122,138,0.2); }
        .back-link {
          display: block;
          text-align: center;
          margin-top: 20px;
          color: #c9a96e;
          text-decoration: none;
          font-size: 14px;
        }
        .back-link:hover { text-decoration: underline; }
      </style>
    </head>
    <body>
      <div class="reset-container">
        <div class="logo">Eterné</div>
        <h2 style="text-align: center; margin-bottom: 24px; color: #e8e0d0;">Reset Your Password</h2>

        <div id="reset-form">
          <div class="form-group">
            <label class="form-label">New Password</label>
            <input type="password" id="new-password" class="form-input" placeholder="Enter new password (min. 6 characters)">
          </div>
          <div class="form-group">
            <label class="form-label">Confirm Password</label>
            <input type="password" id="confirm-password" class="form-input" placeholder="Confirm new password">
          </div>
          <button class="btn" onclick="resetPassword('${token}')">Reset Password</button>
        </div>

        <div id="reset-success" style="display: none; text-align: center;">
          <div style="font-size: 48px; margin-bottom: 16px;">✅</div>
          <div style="font-size: 18px; font-weight: 600; color: #7a9a8a; margin-bottom: 8px;">Password Reset!</div>
          <p style="color: #a09080; font-size: 14px;">Your password has been successfully reset. You can now log in with your new password.</p>
        </div>

        <div id="message"></div>
        <a href="/" class="back-link">← Back to Login</a>
      </div>

      <script>
        async function resetPassword(token) {
          const password = document.getElementById('new-password').value;
          const confirmPassword = document.getElementById('confirm-password').value;
          const messageDiv = document.getElementById('message');

          if (!password || !confirmPassword) {
            showMessage('Please fill in both password fields', 'error');
            return;
          }

          if (password.length < 6) {
            showMessage('Password must be at least 6 characters', 'error');
            return;
          }

          if (password !== confirmPassword) {
            showMessage('Passwords do not match', 'error');
            return;
          }

          const btn = document.querySelector('.btn');
          const originalText = btn.textContent;
          btn.textContent = 'Resetting...';
          btn.disabled = true;

          try {
            const response = await fetch('/api/auth/reset-password', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token, password })
            });

            const data = await response.json();

            if (response.ok) {
              document.getElementById('reset-form').style.display = 'none';
              document.getElementById('reset-success').style.display = 'block';
              showMessage(data.message, 'success');
            } else {
              showMessage(data.error || 'Failed to reset password', 'error');
            }
          } catch (error) {
            showMessage('Network error. Please try again.', 'error');
          } finally {
            btn.textContent = originalText;
            btn.disabled = false;
          }
        }

        function showMessage(text, type) {
          const messageDiv = document.getElementById('message');
          messageDiv.innerHTML = \`<div class="message \${type}">\${text}</div>\`;
          setTimeout(() => messageDiv.innerHTML = '', 5000);
        }
      </script>
    </body>
    </html>
  `);
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
