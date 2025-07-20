const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const app = express();
const fs = require("fs");
const path = require("path");
const cron = require('node-cron');
const pool = require('./db')
const authRoutes = require('./routes/auth');
require('dotenv').config();

// app.use(cors({
//     origin: process.env.CLIENT_URL,// Frontend URL
//     credentials: true               // allows sending cookies
// }));

const clientUrl = process.env.CLIENT_URL;
const clientUrlRegex = process.env.CLIENT_URL_REGEX
  ? new RegExp(process.env.CLIENT_URL_REGEX)
  : null;

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // Allow Postman, curl, etc.

    const isAllowed =
      origin === clientUrl ||
      (clientUrlRegex && clientUrlRegex.test(origin)) ||
      origin === 'http://localhost:5173';

    if (isAllowed) {
      callback(null, true);
    } else {
      console.warn(`Blocked CORS request from: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Run every minute
cron.schedule('* * * * *', async () => {
  const timestamp = new Date().toISOString();
  try {
    // Delete ride requests for expired rides
    await pool.query(`
      DELETE FROM ride_requests
      WHERE ride_id IN (
        SELECT id FROM rides
        WHERE departure_time < NOW() - INTERVAL '1 hour'
      )
    `);

    // Delete the expired rides
    const result = await pool.query(`
      DELETE FROM rides
      WHERE departure_time < NOW() - INTERVAL '1 hour'
    `);

    const message = `[${timestamp}] Cleaned up ${result.rowCount} expired ride(s)\n`;
    console.log(message.trim());
    fs.appendFileSync(path.join(__dirname, 'logs', 'cleanup.log'), message);

  } catch (err) {
    const errorLog = `[${timestamp}] Error: ${err.message}\n`;
    console.error(errorLog.trim());
    fs.appendFileSync(path.join(__dirname, 'logs', 'cleanup.log'), errorLog);
  }
});


app.use(cookieParser());
app.use(express.json());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/rides', require('./routes/rides'));
app.use('/api/ride-requests', require('./routes/rideRequests'));

app.use((req, res) => {
  res.status(404).json({ message: 'Not Found' });
});

const PORT = process.env.PORT || 5000;
// app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

app.listen(PORT, () => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
  }
});