const bcrypt = require('bcrypt'); // Password hashing for secure storage
const jwt = require('jsonwebtoken'); // Token generation for authentication
const prisma = require('../config/db');

const generateAccessToken = (user) => {
  return jwt.sign(
    { userId: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  ); // Short-lived access token for security
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    { userId: user.id },
    process.env.REFRESH_SECRET,
    { expiresIn: '7d' }
  ); // Long-lived refresh token for session management
};

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
    return res.status(401).json({ message: 'Invalid credentials', data: null });
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken },
  });

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({
    message: 'Login successful.',
    data: {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
      accessToken,
    },
  });
};

exports.refreshToken = async (req, res) => {
  const token = req.body.token || req.cookies.refreshToken;
  if (!token) return res.status(401).json({ message: 'Token missing', data: null });

  try {
    const payload = jwt.verify(token, process.env.REFRESH_SECRET);
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });

    if (!user || user.refreshToken !== token) {
      return res.status(403).json({ message: 'Invalid refresh token', data: null });
    }

    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: newRefreshToken },
    });

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      message: 'Token refreshed successfully.',
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      },
    });
  } catch (err) {
    res.status(403).json({ message: 'Invalid refresh token', data: null });
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
  try {
    const token = req.cookies?.refreshToken;

    if (!token) {
      return res.status(400).json({ message: 'No token found', data: null });
    }

    const payload = jwt.verify(token, process.env.REFRESH_SECRET);
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });

    if (!user) {
      return res.status(404).json({ message: 'User not found', data: null });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: null },
    });

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
    });

    res.json({ message: 'Logout successful.', data: null });
  } catch (error) {
    res.status(403).json({ message: 'Invalid or expired token', data: null });
  }
};


// exports.getUserById = async (req, res) => {
//   const { id } = req.params;

//   try {
//     const user = await prisma.user.findUnique({
//       where: { id: parseInt(id) },
//       select: {
//         id: true,
//         username: true,
//         email: true,
//         role: true,
//         createdAt: true,
//       },
//     });

//     if (!user) {
//       return res.status(404).json({ error: 'User not found' });
//     }

//     res.json(user);
//   } catch (err) {
//     res.status(500).json({ error: 'Internal server error' });
//   }
// };