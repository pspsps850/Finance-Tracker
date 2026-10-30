import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT, 10) || 10,
  queueLimit: parseInt(process.env.DB_QUEUE_LIMIT, 10) || 0,
  connectTimeout:
    parseInt(process.env.DB_CONNECT_TIMEOUT ?? process.env.DB_CONNECTION_TIMEOUT, 10) || 10000,
});

export const db = pool;

db.on('connection', (connection) => {
  connection.on('error', (error) => {
    console.error('Database connection error:', error.code || error.message);
  });
});

export async function verifyConnection() {
  const connection = await db.getConnection();

  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}

export async function closePool() {
  await db.end();
}