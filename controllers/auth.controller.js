const bcrypt = require('bcrypt'); // Password hashing for secure storage
const jwt = require('jsonwebtoken'); // Token generation for authentication
const prisma = require('../config/db');

const generateToken = (user, secret, expiresIn) =>
  jwt.sign({ userId: user.id, role: user.role }, secret, { expiresIn });

// cookie option helper to support cross-site usage in production
const isProd = process.env.NODE_ENV === 'production';
const cookieOpts = (maxAge) => ({
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'None' : 'Lax',
  maxAge,
});

const setTokenCookies = (res, accessToken, refreshToken) => {
  res.cookie('accessToken', accessToken, cookieOpts(15 * 60 * 1000)); // 15 minutes
  res.cookie('refreshToken', refreshToken, cookieOpts(7 * 24 * 60 * 60 * 1000)); // 7 days
};

const ALLOWED_ROLES = ['user', 'engineer', 'admin']; // NEW: role whitelist

exports.register = async (req, res) => {
  const { username, email, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    const user = await prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
      },
    });
    res.status(201).json({
      message: 'User registered successfully.',
      data: user,
    });
  } catch (err) {
    res.status(400).json({ message: 'Email or username already exists', data: null });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const accessToken = generateToken(user, process.env.JWT_SECRET, '15m');
  const refreshToken = generateToken(user, process.env.REFRESH_SECRET, '7d');

  await prisma.user.update({ where: { id: user.id }, data: { refreshToken } });
  setTokenCookies(res, accessToken, refreshToken);

  res.json({
    message: 'Login successful',
    data: {
      user: { id: user.id, username: user.username, email: user.email, role: user.role },
      // accessToken removed from response (HttpOnly cookie only)
    },
  });
};

exports.refreshToken = async (req, res) => {
  const token = req.cookies.refreshToken;
  if (!token) return res.status(401).json({ message: 'Token missing' });

  try {
    const payload = jwt.verify(token, process.env.REFRESH_SECRET);
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });

    if (!user || user.refreshToken !== token) {
      return res.status(403).json({ message: 'Invalid refresh token' });
    }

    const newAccessToken = generateToken(user, process.env.JWT_SECRET, '15m');
    const newRefreshToken = generateToken(user, process.env.REFRESH_SECRET, '7d');

    await prisma.user.update({ where: { id: user.id }, data: { refreshToken: newRefreshToken } });
    setTokenCookies(res, newAccessToken, newRefreshToken);

    res.json({ message: 'Token refreshed successfully' });
  } catch (err) {
    res.status(403).json({ message: 'Invalid refresh token' });
  }
};

exports.getUserById = async (req, res) => {
  const { id } = req.params;
  const requester = req.user;

  // Cek apakah requester adalah admin atau user yang diminta
  if (requester.role !== 'admin' && requester.userId !== parseInt(id)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.logout = async (req, res) => {
  const token = req.cookies.refreshToken;
  if (!token) return res.status(400).json({ message: 'No token found' });

  try {
    const payload = jwt.verify(token, process.env.REFRESH_SECRET);
    await prisma.user.update({ where: { id: payload.userId }, data: { refreshToken: null } });

    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    res.json({ message: 'Logout successful' });
  } catch (err) {
    res.status(403).json({ message: 'Invalid or expired token' });
  }
};

exports.validateToken = async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header missing or invalid' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) {
      return res.status(403).json({ error: 'Access denied. User not found.' });
    }

    res.json({ message: 'Token is valid', data: { userId: decoded.userId, role: decoded.role } });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      // Handle token expiration by checking refreshToken
      const refreshToken = req.cookies.refreshToken;
      if (!refreshToken) {
        return res.status(401).json({ error: 'Refresh token missing. Please log in again.' });
      }

      try {
        const refreshPayload = jwt.verify(refreshToken, process.env.REFRESH_SECRET);
        const user = await prisma.user.findUnique({ where: { id: refreshPayload.userId } });

        if (!user || user.refreshToken !== refreshToken) {
          return res.status(403).json({ error: 'Invalid refresh token. Please log in again.' });
        }

        // Generate new accessToken and set cookie only (no token in body)
        const newAccessToken = jwt.sign(
          { userId: user.id, role: user.role },
          process.env.JWT_SECRET,
          { expiresIn: '15m' }
        );

        res.cookie('accessToken', newAccessToken, cookieOpts(15 * 60 * 1000)); // 15 minutes

        return res.json({
          message: 'Token refreshed successfully.',
        });
      } catch (refreshErr) {
        return res.status(403).json({ error: 'Invalid or expired refresh token. Please log in again.' });
      }
    }

    return res.status(403).json({ error: 'Invalid token' });
  }
};

// NEW: Authenticated user info (for frontend fetch)
exports.me = async (req, res) => {
  try {
    const id = req.user.userId;
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true, email: true, role: true, createdAt: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ data: user });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

// NEW: Admin-only - get all users (no passwords/refresh tokens)
exports.getAllUsers = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const users = await prisma.user.findMany({
      select: { id: true, username: true, email: true, role: true, createdAt: true },
      orderBy: { id: 'asc' },
    });

    res.json({ data: users });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

// NEW: Admin-only - update a user (username, email, role, password)
exports.updateUser = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { id } = req.params;
    const { username, email, role, password } = req.body;

    const data = {};
    if (username !== undefined) data.username = username;
    if (email !== undefined) data.email = email;
    if (role !== undefined) {
      if (!ALLOWED_ROLES.includes(role)) {
        return res.status(400).json({ error: `Invalid role. Allowed: ${ALLOWED_ROLES.join(', ')}` });
      }
      data.role = role;
    }
    if (password !== undefined) {
      data.password = await bcrypt.hash(password, 10);
    }

    const updated = await prisma.user.update({
      where: { id: Number(id) },
      data,
      select: { id: true, username: true, email: true, role: true, createdAt: true },
    });

    res.json({ message: 'User updated', data: updated });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'User not found' });
    }
    if (err.code === 'P2002') {
      return res.status(400).json({ error: 'Email or username already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

// NEW: Admin-only - delete a user
exports.deleteUser = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { id } = req.params;

    await prisma.user.delete({ where: { id: Number(id) } });

    res.json({ message: 'User deleted' });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'User not found' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};