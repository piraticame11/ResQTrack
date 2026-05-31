const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:            process.env.DB_HOST     || 'localhost',
  port:            process.env.DB_PORT     || 3306,
  user:            process.env.DB_USER     || 'root',
  password:        process.env.DB_PASSWORD || '',
  database:        process.env.DB_NAME     || 'resqtrack',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit:      0,
});

pool.getConnection()
  .then(conn => { conn.release(); console.log('✅ MySQL connected'); })
  .catch(err => console.error('❌ MySQL connection error:', err.message));

module.exports = pool;
