const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
const PORT = 8081;

app.use(cors());
app.use(bodyParser.json());

// Database configuration
const DB_NAME = 'user-db';
const dbConfig = {
    host: '192.168.137.72',
    port: 3307,
    user: 'root',
    password: 'root123',
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// We'll create the pool after ensuring the database exists
let pool;

// Initialize Database and Tables
async function initDb() {
    try {
        // 1. Connect without database first to create it if it doesn't exist
        const connection = await mysql.createConnection({
            host: dbConfig.host,
            port: dbConfig.port,
            user: dbConfig.user,
            password: dbConfig.password
        });

        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``);
        console.log(`[User Service] Database '${DB_NAME}' ensured.`);
        await connection.end();

        // 2. Now create the pool with the database
        pool = mysql.createPool(dbConfig);
        console.log(`[User Service] Connected to MariaDB at ${dbConfig.host}:${dbConfig.port}`);

        // 3. Create tables and seed data
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL
            )
        `);

        const [userCount] = await pool.query('SELECT COUNT(*) as count FROM users');
        if (userCount[0].count === 0) {
            await pool.query(`
                INSERT INTO users (username, password) VALUES
                ('admin', 'password123'),
                ('hien', '123'),
                ('user1', 'user1')
            `);
            console.log('[User Service] Database seeded with initial users');
        }
    } catch (err) {
        console.error('[User Service] Database Initialization Error:', err.message);
        // If it fails, we wait and retry or just log
    }
}

initDb();

// Logging middleware
app.use((req, res, next) => {
    console.log(`[User Service] ${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

/**
 * @api {get} /users/:id Get User Details
 */
app.get('/users/:id', async (req, res) => {
    try {
        if (!pool) return res.status(503).json({ message: 'Database not ready' });
        const [rows] = await pool.query('SELECT id, username FROM users WHERE id = ?', [req.params.id]);

        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            res.status(404).json({ success: false, message: 'User not found' });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: 'Database error', error: err.message });
    }
});

/**
 * @api {post} /login User Login
 */
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    try {
        if (!pool) return res.status(503).json({ message: 'Database not ready' });
        const [rows] = await pool.query(
            'SELECT id, username FROM users WHERE username = ? AND password = ?',
            [username, password]
        );

        if (rows.length > 0) {
            res.json({ success: true, message: 'Login successful', user: rows[0] });
        } else {
            res.status(401).json({ success: false, message: 'Invalid username or password' });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: 'Database error', error: err.message });
    }
});

/**
 * @api {post} /register User Registration
 */
app.post('/register', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    try {
        if (!pool) return res.status(503).json({ message: 'Database not ready' });

        // 1. Check if user already exists
        const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
        if (existing.length > 0) {
            return res.status(409).json({ success: false, message: 'Username already exists' });
        }

        // 2. Insert new user
        const [result] = await pool.query(
            'INSERT INTO users (username, password) VALUES (?, ?)',
            [username, password]
        );

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            userId: result.insertId
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Database error', error: err.message });
    }
});

// Health check
app.get('/health', async (req, res) => {
    try {
        if (pool) {
            await pool.query('SELECT 1');
            res.json({ status: 'UP', service: 'User Service', database: 'CONNECTED' });
        } else {
            res.status(503).json({ status: 'STARTING', service: 'User Service', database: 'CONNECTING' });
        }
    } catch (err) {
        res.status(500).json({ status: 'DOWN', service: 'User Service', database: 'ERROR', error: err.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log('=========================================');
    console.log(`User Service is running on port ${PORT}`);
    console.log(`Watching for changes with nodemon...`);
    console.log(`API Endpoints:`);
    console.log(`- POST /login`);
    console.log(`- GET  /users/:id`);
    console.log('=========================================');
});
