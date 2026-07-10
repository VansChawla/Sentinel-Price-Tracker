const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const authorize = require('../middleware/authorization');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME
});

// POST: Add a new product to track (Protected Route)
router.post('/', authorize, async (req, res) => {
    try {
        const { product_name, url, target_price } = req.body;

        // Insert product and link it to the user who sent the token (req.user)
        const newProduct = await pool.query(
            'INSERT INTO products (user_id, product_name, url, target_price) VALUES ($1, $2, $3, $4) RETURNING *',
            [req.user, product_name, url, target_price]
        );

        res.json(newProduct.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server Error" });
    }
});

// GET: Fetch all tracked products for the logged-in user (Protected Route)
router.get('/', authorize, async (req, res) => {
    try {
        // Only fetch products that belong to this specific user
        const products = await pool.query(
            'SELECT * FROM products WHERE user_id = $1 ORDER BY created_at DESC', 
            [req.user]
        );
        
        res.json(products.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: "Server Error" });
    }
});

module.exports = router;