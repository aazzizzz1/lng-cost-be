module.exports = (req, res, next) => {
  const { username, email, password } = req.body;
  // Validates required fields
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  next();
};