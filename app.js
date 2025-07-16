const express = require('express');
const helmet = require('helmet'); // Protection against various web vulnerabilities
const morgan = require('morgan');
const rateLimit = require('express-rate-limit'); // Protection against DDoS attacks
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const authRoutes = require('./routes/auth.routes');
const projectRoutes = require('./routes/project.routes');
const unitPriceRoutes = require('./routes/unitPrice.routes');
const constructionCostRoutes = require('./routes/constructionCost.routes');
const uploadRoutes = require('./routes/upload.routes');
const cciRoutes = require('./routes/cci.routes'); // Import CCI routes

const app = express();
app.use(express.json({ limit: '10kb' })); // Limit payload size to prevent abuse
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));

const limiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 100,
}); 
app.use(limiter); // DDoS protection: rate limiting

app.use(
  helmet.hsts({
    maxAge: 60 * 60 * 24 * 365, // 1 tahun
    includeSubDomains: true,
    preload: true, // opsional: untuk preload list browser
  })
); // Security headers: HSTS for HTTPS enforcement

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

app.use(cors(corsOptions)); // CORS configuration: prevents unauthorized cross-origin requests

app.use(cookieParser()); // Middleware for parsing cookies (can be used for secure session management)
app.disable('x-powered-by'); // Disable X-Powered-By header to prevent information leakage

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/unit-prices', unitPriceRoutes);
app.use('/api/construction-costs', constructionCostRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/cci', cciRoutes); // Add CCI routes

module.exports = app;
