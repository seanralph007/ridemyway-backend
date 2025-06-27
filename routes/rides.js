const express = require('express');
const router = express.Router();
const pool = require('../db');
const auth = require('../middleware/auth');

// Create ride (Driver only)
router.post('/', auth, async (req, res) => {
  if (req.user.role !== 'driver') return res.status(403).json({ message: 'Forbidden' });

  const { origin, destination, departure_time, available_seats, car_type } = req.body;
  await pool.query(
    'INSERT INTO rides (driver_id, origin, destination, departure_time, available_seats, car_type) VALUES ($1, $2, $3, $4, $5, $6)',
    [req.user.id, origin, destination, departure_time, available_seats, car_type]
  );
  res.status(201).json({ message: 'Ride created' });
});

// View all rides
router.get('/', async (req, res) => {
  const result = await pool.query('SELECT * FROM rides ORDER BY departure_time ASC');
  res.json(result.rows);
});

// Passenger views their ride requests
router.get('/my-requests', auth, async (req, res) => {
  if (req.user.role !== 'passenger') {
    return res.status(403).json({ message: 'Only passengers can view requests' });
  }

  try {
    const result = await pool.query(
      `SELECT rr.id, r.destination, r.departure_time, rr.status
       FROM ride_requests rr
       JOIN rides r ON rr.ride_id = r.id
       WHERE rr.passenger_id = $1
       ORDER BY r.departure_time ASC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Failed to fetch passenger requests:", err.message);
    res.status(500).json({ message: "Server error while loading your requests" });
  }
});

// Driver views their offered rides
router.get('/my-offers', auth, async (req, res) => {
  console.log("🧪 Authenticated user in /my-offers:", req.user);

  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized: No user found in request" });
  }

  if (req.user.role !== 'driver') {
    return res.status(403).json({ message: 'Forbidden: Not a driver' });
  }

  try {
    const ridesResult = await pool.query(
      'SELECT * FROM rides WHERE driver_id = $1 ORDER BY departure_time DESC',
      [req.user.id]
    );

    const rides = ridesResult.rows;

    for (let ride of rides) {
      const requestsResult = await pool.query(
        `SELECT rr.*, u.name AS passenger_name
         FROM ride_requests rr
         JOIN users u ON rr.passenger_id = u.id
         WHERE rr.ride_id = $1`,
        [ride.id]
      );
      ride.requests = requestsResult.rows;
    }

    res.json(rides);
  } catch (err) {
    console.error("❌ Error in /my-offers:", err.message);
    res.status(500).json({ message: 'Server error while fetching your rides' });
  }
});

// Passenger requests to join a ride
router.post('/:rideId/request', auth, async (req, res) => {
  if (req.user.role !== 'passenger') return res.status(403).json({ message: 'Forbidden' });

  const { rideId } = req.params;

  try {
    await pool.query(
      'INSERT INTO ride_requests (ride_id, passenger_id) VALUES ($1, $2)',
      [parseInt(rideId), req.user.id]
    );
    res.status(201).json({ message: 'Request submitted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong' });
  }
});

// Get ride by ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  if (isNaN(id)) {
    return res.status(400).json({ error: 'Ride ID must be a number' });
  }

  const result = await pool.query('SELECT * FROM rides WHERE id = $1', [parseInt(id)]);
  res.json(result.rows[0]);
});

router.delete('/:id', auth, async (req, res) => {
  const { id } = req.params;

  try {
    // Check if the ride belongs to the driver
    const ride = await pool.query('SELECT * FROM rides WHERE id = $1', [id]);
    const rideData = ride.rows[0];

    if (!rideData) {
      return res.status(404).json({ message: 'Ride not found' });
    }

    if (rideData.driver_id !== req.user.id) {
      return res.status(403).json({ message: 'You are not allowed to delete this ride' });
    }

    // Delete any related ride requests first (to avoid FK constraint issues)
    await pool.query('DELETE FROM ride_requests WHERE ride_id = $1', [id]);

    // Then delete the ride
    await pool.query('DELETE FROM rides WHERE id = $1', [id]);

    res.json({ message: 'Ride deleted successfully' });
  } catch (err) {
    console.error("❌ Error deleting ride:", err.message);
    res.status(500).json({ message: 'Server error while deleting ride' });
  }
});

// router.stack.forEach((r) => {
//   if (r.route && r.route.path) {
//     console.log(`[ROUTE] ${Object.keys(r.route.methods)[0].toUpperCase()} ${r.route.path}`);
//   }
// });

module.exports = router;