const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const { loadDataset } = require('./dataLoader');
const { getRecommendations } = require('./recommender');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets from public folder (if it exists)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Simple in-memory sliding window IP rate limiter (10 requests/min)
const rateLimitCache = new Map();
const LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS = 10; // 10 requests per minute

function rateLimiter(req, res, next) {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const now = Date.now();

  if (!rateLimitCache.has(ip)) {
    rateLimitCache.set(ip, []);
  }

  // Filter out requests older than the 1-minute window
  const requests = rateLimitCache.get(ip).filter(timestamp => now - timestamp < LIMIT_WINDOW);
  requests.push(now);
  rateLimitCache.set(ip, requests);

  if (requests.length > MAX_REQUESTS) {
    console.warn(`[Rate Limit] IP Blocked: ${ip} (Requests in window: ${requests.length})`);
    return res.status(429).json({
      success: false,
      error: 'Too many requests. Please wait a minute and try again.'
    });
  }

  next();
}

// Recommendation endpoint
app.get('/api/recommendations', rateLimiter, async (req, res) => {
  try {
    const {
      location,
      budget,
      cuisine,
      minRating,
      maxDeliveryTime,
      hasOffers,
      additionalPreferences
    } = req.query;

    // Build preferences object with correct types
    const preferences = {
      location: location || null,
      budget: budget || null,
      cuisine: cuisine || null,
      minRating: minRating ? parseFloat(minRating) : null,
      maxDeliveryTime: maxDeliveryTime ? parseInt(maxDeliveryTime, 10) : null,
      hasOffers: hasOffers === 'true',
      additionalPreferences: additionalPreferences 
        ? (Array.isArray(additionalPreferences) ? additionalPreferences : [additionalPreferences])
        : []
    };

    console.log(`[API] Received query:`, preferences);

    const recommendations = await getRecommendations(preferences);
    res.json({
      success: true,
      ...recommendations
    });
  } catch (error) {
    console.error(`[API ERROR]`, error);
    res.status(500).json({
      success: false,
      error: error.message || 'An internal server error occurred'
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', uptime: process.uptime() });
});

// Warm up dataset cache on startup
console.log('[Server] Pre-warming dataset cache from zomato.db (SQLite)...');
loadDataset()
  .then((data) => {
    console.log(`[Server] Dataset cached successfully: ${data.length} records.`);
    
    // Start listening
    app.listen(PORT, () => {
      console.log(`[Server] Zomato AI server is running on port ${PORT}`);
      console.log(`[Server] Test GET endpoint: http://localhost:${PORT}/api/recommendations?location=Bangalore&budget=Medium&cuisine=North+Indian&minRating=4.0`);
    });
  })
  .catch((err) => {
    console.error('[Server ERROR] Failed to load dataset on startup:', err);
    process.exit(1);
  });
