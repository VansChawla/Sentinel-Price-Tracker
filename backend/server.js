const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const http = require('http');
const amqp = require('amqplib');
const {Server} = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: ['http://localhost:5173', 'https://sentinel-price-tracker.vercel.app'],
    credentials: true
    }
});

// Middleware
app.use(cors({
  origin: [
    'http://localhost:5173', 
    'https://sentinel-price-tracker.vercel.app'
  ],
  credentials: true
}));
app.use(express.json()); // Allows us to parse JSON bodies


// Database Connection Pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Supabase requires this for cloud connections!
    }
});

// Test the Database Connection
pool.connect()
    .then(() => console.log('✅ Connected to PostgreSQL successfully!'))
    .catch(err => console.error('❌ Database connection error', err.stack));

app.set('socketio', io);

// Listen for completed jobs from Python
async function listenForCompletedJobs() {
    try {
        const connection = await amqp.connect(process.env.RABBITMQ_URL);
        const channel = await connection.createChannel();
        const queue = 'completed_jobs';

        await channel.assertQueue(queue, { durable: true });
        console.log("🎧 Node.js is listening for completed jobs from Python...");

        channel.consume(queue, (msg) => {
            if (msg !== null) {
                const data = JSON.parse(msg.content.toString());
                console.log(`🔔 Alerting frontend! Product ${data.product_id} updated to ₹${data.price}`);

                // Broadcast the updated price to the React frontend!
                io.emit('price_updated', data);

                // Tell RabbitMQ we processed the message
                channel.ack(msg);
            }
        });
    } catch (error) {
        console.error("❌ RabbitMQ Return Queue error:", error);
    }
}

listenForCompletedJobs();

// 6. Listen for incoming WebSocket connections
io.on('connection', (socket) => {
    console.log(`🟢 New Client Connected! Socket ID: ${socket.id}`);

    socket.on('disconnect', () => {
        console.log(`🔴 Client Disconnected: ${socket.id}`);
    });
});


//Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));

// Basic Route to test the server
app.get('/api/health', (req, res) => {
    res.json({ status: 'Engine is running smooth!' });
});

// Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});