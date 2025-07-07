const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const cookieParser = require('cookie-parser');
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

app.use(
  helmet.hsts({
    maxAge: 60 * 60 * 24 * 365, // 1 tahun
    includeSubDomains: true,
    preload: true, // opsional: untuk preload list browser
  })
);

const allowedOrigins = ['http://localhost:3000','http://localhost:5000', 'https://lng-cost-fe.netlify.app/', 'https://yourdomain.com']; // ganti sesuai kebutuhan

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // jika ingin pakai cookie
};

app.use(cors(corsOptions));

app.use(cookieParser());

// Routes
app.use('/api/auth', authRoutes);

module.exports = app;
