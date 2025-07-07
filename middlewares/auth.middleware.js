const jwt = require('jsonwebtoken');

exports.authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.sendStatus(401);

  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

exports.isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  next();
};