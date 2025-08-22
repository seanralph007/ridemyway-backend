// const { Pool } = require("pg");
// require("dotenv").config();

// const db = new Pool({
//   connectionString: process.env.DATABASE_URL,
//   ssl:
//     process.env.NODE_ENV === "production"
//       ? { rejectUnauthorized: false }
//       : false,
// });

// module.exports = db;

const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Supabase requires SSL (always true, dev + prod)
  },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Test connection
pool
  .query("SELECT NOW()")
  .then((res) => console.log("✅ Database connected at:", res.rows[0].now))
  .catch((err) => console.error("❌ Database connection error:", err.message));

module.exports = pool;
