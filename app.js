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
const calculatorRoutes = require('./routes/calculator.routes'); // Import Calculator routes

const app = express();
// NEW: trust proxy so secure cookies (SameSite=None; Secure) work behind reverse proxies
// app.set('trust proxy', 1);
app.enable('trust proxy');

// NEW: optional proxy/header debug
if (process.env.DEBUG_PROXY === 'true') {
  app.use((req, res, next) => {
    console.log('[PROXY]', {
      secure: req.secure,
      protocol: req.protocol,
      xfp: req.headers['x-forwarded-proto'],
      host: req.headers.host,
      url: req.originalUrl,
    });
    next();
  });
}

// NEW: capture raw body for debugging parse failures
app.use((req, res, next) => {
  if (req.method === 'POST' || req.method === 'PATCH' || req.method === 'PUT') {
    req._startTs = Date.now();
  }
  next();
});

// Parse JSON even if proxy sets text/plain or application/*+json
app.use(express.json({
  limit: '50mb',
  type: ['application/json', 'application/*+json', 'text/plain'],
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  },
}));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(helmet());
app.use(morgan('dev'));

// NEW: CORS should run before any rate-limiters and must allow credentials
const allowedOrigins = ['http://103.196.154.31', 'http://localhost:3000', 'http://localhost:5000', 'https://lng-cost-fe.netlify.app', 'https://engimate.pgnlng.co.id']; // cleaned: no trailing slash
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // allow cookies
  // Helpful for preflight under some proxies
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
};
app.use(cors(corsOptions));

app.use(cookieParser()); // Middleware for parsing cookies (can be used for secure session management)

// NEW: global rate limiter that skips preflight and auth routes (auth has its own limiter)
const globalLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 500, // relax global cap
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS' || req.path.startsWith('/api/auth'),
});
app.use(globalLimiter); // DDoS protection: rate limiting

app.use(
  helmet.hsts({
    maxAge: 60 * 60 * 24 * 365, // 1 tahun
    includeSubDomains: true,
    preload: true, // opsional: untuk preload list browser
  })
); // Security headers: HSTS for HTTPS enforcement

app.disable('x-powered-by'); // Disable X-Powered-By header to prevent information leakage

// Middleware to handle caching globally
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/unit-prices', unitPriceRoutes);
app.use('/api/construction-costs', constructionCostRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/cci', cciRoutes); // Add CCI routes
app.use('/api/calculator', calculatorRoutes); // Add Calculator routes

// NEW: friendly JSON parse / generic error handler (forces JSON response)
app.use((err, req, res, next) => {
  if (err) {
    const isParse = err.type === 'entity.parse.failed';
    if (process.env.DEBUG_REQUEST === 'true') {
      console.error('[ERROR]', {
        path: req.path,
        method: req.method,
        message: err.message,
        type: err.type,
        rawBody: req.rawBody,
        headers: req.headers,
      });
    }
    return res
      .status(isParse ? 400 : (err.status || 500))
      .json({ error: isParse ? 'Invalid JSON payload' : 'Request error', detail: err.message });
  }
  next(err);
});

module.exports = app;
