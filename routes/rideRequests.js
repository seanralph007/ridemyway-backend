const express = require('express');
const router = express.Router();
const pool = require('../db');
const auth = require('../middleware/auth');

// Driver views ride requests to his/her rides
router.get('/driver', auth, async (req, res) => {
  if (req.user.role !== 'driver') return res.status(403).json({ message: 'Forbidden' });

  const result = await pool.query(
    `SELECT rr.*, u.name AS passenger_name
     FROM ride_requests rr
     JOIN rides r ON rr.ride_id = r.id
     JOIN users u ON rr.passenger_id = u.id
     WHERE r.driver_id = $1`,
    [req.user.id]
  );

  res.json(result.rows);
});

router.put('/:id', auth, async (req, res) => {
    const { id } = req.params;             // request id
    const { status } = req.body;           // 'accepted' or 'rejected' or 'pending'
  
    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
  
    // Find the ride and driver that owns this request
    const request = await pool.query(
      `SELECT rr.ride_id, r.driver_id, r.available_seats, rr.passenger_id
       FROM ride_requests rr
       JOIN rides r ON rr.ride_id = r.id
       WHERE rr.id = $1`,
      [id]
    );
  
    const requestData = request.rows[0];
  
    if (!requestData) {
      return res.status(404).json({ message: 'Request not found' });
    }
  
    if (requestData.driver_id !== req.user.id) {
      return res.status(403).json({ message: 'Not your ride' });
    }
  
    // If accepted, check available seats and decrease
    if (status === 'accepted') {
      if (requestData.available_seats <= 0) {
        return res.status(400).json({ message: 'No available seats left' });
      }
  
      try {
        await pool.query('BEGIN');
  
        // Update request status
        await pool.query(
          'UPDATE ride_requests SET status = $1 WHERE id = $2',
          [status, id]
        );
  
        // Decrease seat count
        await pool.query(
          'UPDATE rides SET available_seats = available_seats - 1 WHERE id = $1',
          [requestData.ride_id]
        );
  
        await pool.query('COMMIT');
        return res.json({ message: 'Request accepted' });
  
      } catch (err) {
        await pool.query('ROLLBACK');
        console.error(err);
        return res.status(500).json({ message: 'Something went wrong' });
      }
    } else {
      // Rejected
      await pool.query(
        'UPDATE ride_requests SET status = $1 WHERE id = $2',
        [status, id]
      );
  
      return res.json({ message: 'Request rejected' });
    }
});

// Passenger deletes their own ride request
router.delete('/:id', auth, async (req, res) => {
  const { id } = req.params;

  try {
    // Get the request and verify which passenger wants to delete it
    const result = await pool.query(
      'SELECT * FROM ride_requests WHERE id = $1',
      [id]
    );
    const request = result.rows[0];

    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    if (req.user.role !== 'passenger' || request.passenger_id !== req.user.id) {
      return res.status(403).json({ message: 'You are not allowed to delete this request' });
    }

    // Delete the request
    await pool.query('DELETE FROM ride_requests WHERE id = $1', [id]);

    res.json({ message: 'Ride request deleted' });
  } catch (err) {
    console.error('❌ Error deleting ride request:', err.message);
    res.status(500).json({ message: 'Server error while deleting request' });
  }
});

module.exports = router;