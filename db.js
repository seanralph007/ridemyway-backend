// const { Pool } = require('pg');
// require('dotenv').config();

// const db = new Pool({
//     user: process.env.PG_USER,
//     host: process.env.PG_HOST,
//     database: process.env.PG_DATABASE,
//     password: process.env.PG_PASSWORD,
//     port: process.env.PG_PORT,
// });

// db.connect();

// module.exports = db;

const { Pool } = require("pg");
require("dotenv").config();

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

module.exports = db;
