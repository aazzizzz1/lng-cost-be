const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth.routes');

const app = express();
app.use(express.json());
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));

const limiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 100,
});
app.use(limiter);

// Routes
app.use('/api/auth', authRoutes);

module.exports = app;
