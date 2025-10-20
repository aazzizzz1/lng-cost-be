const jwt = require('jsonwebtoken');
const prisma = require('../config/db'); // NEW: needed to validate refresh token/user

// NEW: cookie option helper consistent with auth.controller
const isProd = process.env.NODE_ENV === 'production';
const isHttps = process.env.USE_HTTPS === 'true';
const accessCookieOpts = {
  httpOnly: true,
  secure: isProd && isHttps,
  sameSite: isProd && isHttps ? 'None' : 'Lax',
  maxAge: 15 * 60 * 1000, // 15 minutes
};

// Helper: try refreshing access token using refreshToken cookie
const tryRefresh = async (req, res) => {
  const rt = req.cookies?.refreshToken;
  if (!rt) return null;
  try {
    const payload = jwt.verify(rt, process.env.REFRESH_SECRET);
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || user.refreshToken !== rt) return null;

    // Issue new access token (do not rotate refresh here)
    const accessToken = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
    res.cookie('accessToken', accessToken, accessCookieOpts);
    return { userId: user.id, role: user.role };
  } catch {
    return null;
  }
};

// === General Authentication Middleware ===
exports.authenticate = async (req, res, next) => {
  // NEW: accept cookie or Bearer
  const bearer = req.headers?.authorization;
  const headerToken = bearer && bearer.startsWith('Bearer ') ? bearer.split(' ')[1] : null;
  const token = req.cookies?.accessToken || headerToken;

  if (!token) {
    // Try silent refresh when no access token cookie (expired/cleared)
    const refreshed = await tryRefresh(req, res);
    if (refreshed) {
      req.user = refreshed;
      return next();
    }
    console.error('Token not found');
    return res.status(401).json({ error: 'Token not found. Please log in.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { userId, role, ... }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      // NEW: auto-refresh on expired access token
      const refreshed = await tryRefresh(req, res);
      if (refreshed) {
        req.user = refreshed;
        return next();
      }
    }
    console.error('Token verification failed:', err);
    const message = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
    return res.status(403).json({ error: message });
  }
};

// === Role-based Middleware ===
exports.authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to access this resource' });
    }
    next();
  };
};

// === Admin Only Shortcut ===
exports.isAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only access' });
  }
  next();
};
