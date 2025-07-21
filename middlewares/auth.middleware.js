const jwt = require('jsonwebtoken');

// === General Authentication Middleware ===
exports.authenticate = (req, res, next) => {
  const token =
    req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.split(' ')[1]
      : req.cookies?.accessToken;

  if (!token) {
    console.error('Token not found');
    return res.status(401).json({ error: 'Token not found. Please log in.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { userId, role, ... }
    next();
  } catch (err) {
    console.error('Token verification failed:', err);
    const message = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
    return res.status(403).json({ error: message });
  }
};

// === Role-based Middleware ===
exports.authorizeRoles = (...allowedRoles) => (req, res, next) => {
  if (!req.user || !allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
  }
  next();
};

// === Admin Only Shortcut ===
exports.isAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only access' }); // Restricts access to admin users
  }
  next();
};

exports.authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to access this resource' }); // Role-based access control
    }
    next();
  };
};

// === Admin Only Shortcut ===
exports.isAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only access' }); // Restricts access to admin users
  }
  next();
};
