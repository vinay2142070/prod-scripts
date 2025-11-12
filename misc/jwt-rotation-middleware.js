// jwt-auth-rotation.js
// Dependencies: express, jsonwebtoken, ioredis, uuid
// Install: npm install express jsonwebtoken ioredis uuid

const express = require('express');
const jwt = require('jsonwebtoken');
const Redis = require('ioredis');
const { v4: uuidv4 } = require('uuid');

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

const ACCESS_TTL = '15m'; // access token lifetime
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'access-secret';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'refresh-secret';

// Generate tokens. Refresh token contains a jti (unique id) which we persist in Redis.
function signAccessToken(payload) {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_TTL });
}

async function signRefreshToken(payload) {
  const jti = uuidv4();
  const token = jwt.sign({ ...payload, jti }, REFRESH_SECRET, { expiresIn: `${REFRESH_TTL_SECONDS}s` });
  // Store jti -> userId mapping (or full token fingerprint). Use a TTL in Redis.
  await redis.set(`refresh:${payload.userId}`, jti, 'EX', REFRESH_TTL_SECONDS);
  return token;
}

// Middleware to protect routes using Access Token
function authenticateJWT(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' });

  const token = auth.slice(7);
  try {
    const decoded = jwt.verify(token, ACCESS_SECRET);
    req.user = decoded;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired access token' });
  }
}

// Express router for auth endpoints: /auth/refresh and /auth/logout
const router = express.Router();

// Accept refresh token in body (or cookie/header — adapt as needed)
router.post('/refresh', express.json(), async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Missing refreshToken' });

  try {
    const decoded = jwt.verify(refreshToken, REFRESH_SECRET);
    const { userId, jti } = decoded;

    // Validate jti against Redis (simple rotation)
    const storedJti = await redis.get(`refresh:${userId}`);
    if (!storedJti || storedJti !== jti) {
      // Either no stored token or jti mismatch -> possible reuse/replay
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    // Rotate: issue new refresh token and delete/replace stored jti
    const newAccess = signAccessToken({ userId });
    const newRefresh = await signRefreshToken({ userId });

    // Note: signRefreshToken already replaces stored value in Redis.

    return res.json({ accessToken: newAccess, refreshToken: newRefresh });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

router.post('/logout', express.json(), async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });
  await redis.del(`refresh:${userId}`);
  return res.json({ ok: true });
});

module.exports = { authenticateJWT, signAccessToken, signRefreshToken, authRouter: router };

/*
Usage (example):
const express = require('express');
const { authenticateJWT, signAccessToken, signRefreshToken, authRouter } = require('./jwt-auth-rotation');

const app = express();
app.use('/auth', authRouter);

// Example protected route:
app.get('/me', authenticateJWT, (req, res) => {
  res.json({ userId: req.user.userId });
});

// Login example:
app.post('/login', express.json(), async (req, res) => {
  const userId = /* validate credentials and get userId * / '123';
  const accessToken = signAccessToken({ userId });
  const refreshToken = await signRefreshToken({ userId });
  res.json({ accessToken, refreshToken });
});

app.listen(3000);
*/
