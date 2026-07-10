const cron = require('node-cron');
const { Pool } = require('pg');
const amqp = require('amqplib');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Supabase requires this for cloud connections!
    }
});

async function queueJobs() {
    try {
        // 1. Connect to RabbitMQ
        const connection = await amqp.connect(process.env.RABBITMQ_URL);
        const channel = await connection.createChannel();
        const queue = 'scrape_jobs';
        
        // Ensure the queue exists
        await channel.assertQueue(queue, { durable: true });

        // 2. Fetch all products from PostgreSQL
        console.log("🔍 Fetching products from database...");
        const result = await pool.query('SELECT id, url FROM products');

        if (result.rows.length === 0) {
            console.log("💤 No products to queue.");
            return;
        }

        // 3. Push each product into the RabbitMQ queue
        result.rows.forEach(product => {
            const jobData = JSON.stringify({ product_id: product.id, url: product.url });
            channel.sendToQueue(queue, Buffer.from(jobData), { persistent: true });
            console.log(`📥 Queued Job for Product ID: ${product.id}`);
        });

        // Close connection safely after 2 seconds
        setTimeout(() => {
            connection.close();
            console.log("✅ All jobs queued successfully. Connection closed.");
        }, 2000);

    } catch (error) {
        console.error("❌ Error queuing jobs:", error);
    }
}

// Schedule the cron job to run every 2 minutes (for testing purposes)
// In production, change '*/2 * * * *' to '0 * * * *' (every hour)
cron.schedule('* * * * *', () => {
    console.log('⏰ Cron Triggered: Starting Job Queuing Process...');
    queueJobs();
});

console.log("🕒 Scheduler is running. Waiting for the next interval...");