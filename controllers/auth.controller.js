const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../config/db');

const generateAccessToken = (user) => {
  return jwt.sign(
    { userId: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    { userId: user.id },
    process.env.REFRESH_SECRET,
    { expiresIn: '7d' }
  );
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
    res.status(201).json({ message: 'User registered', user });
  } catch (err) {
    res.status(400).json({ error: 'Email or username already exists' });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  // Save refreshToken to DB
  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken },
  });

  res.json({
    accessToken,
    refreshToken,
  });
};

exports.refreshToken = async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(401).json({ error: 'Token missing' });

  try {
    const payload = jwt.verify(token, process.env.REFRESH_SECRET);
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });

    if (!user || user.refreshToken !== token) {
      return res.status(403).json({ error: 'Invalid refresh token' });
    }

    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: newRefreshToken },
    });

    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (err) {
    res.status(403).json({ error: 'Invalid refresh token' });
  }
};