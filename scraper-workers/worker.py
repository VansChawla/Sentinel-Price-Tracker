import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
import os
import requests
from bs4 import BeautifulSoup
import psycopg2
from dotenv import load_dotenv
import pika
import json

load_dotenv()

class DummyHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"Python Worker is alive!")

def run_dummy_server():
    port = int(os.environ.get("PORT", 10000))
    server = HTTPServer(("0.0.0.0", port), DummyHandler)
    server.serve_forever()

# Start the dummy web server in the background
threading.Thread(target=run_dummy_server, daemon=True).start()

# Connect to the exact same PostgreSQL database

DATABASE_URL = os.environ.get("DATABASE_URL")

conn = psycopg2.connect(DATABASE_URL)
cursor = conn.cursor()

def fetch_price(url):
    # Upgraded headers to perfectly mimic a real Google Chrome browser
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1"
    }
    
    print(f"🌐 Fetching HTML from: {url}")
    response = requests.get(url, headers=headers, timeout=10)
    soup = BeautifulSoup(response.text, "html.parser")
    
    # DEBUG: Let's see what page Amazon actually sent us
    title = soup.find('title')
    print(f"📄 Page Title Received: {title.text if title else 'No title found'}")
    
    # Try multiple Amazon price classes (they change frequently)
    price_element = soup.find("span", {"class": "a-price-whole"})
    if not price_element:
        price_element = soup.find("span", {"class": "a-offscreen"})
        
    if price_element:
        # Clean up the string (remove commas, $, and ₹)
        price_str = price_element.text.replace(',', '').replace('$', '').replace('₹', '').strip()
        try:
            return float(price_str)
        except ValueError:
            return None
            
    return None

def process_jobs():
    print("🔍 Looking for products to update...")
    # Grab one product from the DB that needs a price check
    cursor.execute("SELECT id, url FROM products WHERE current_price IS NULL LIMIT 1;")
    product = cursor.fetchone()

    if product:
        product_id, url = product
        price = fetch_price(url)
        
        if price:
            print(f"✅ Extracted Live Price: ₹{price}")
            
            # 1. Update the main product row
            cursor.execute("UPDATE products SET current_price = %s WHERE id = %s", (price, product_id))
            
            # 2. Insert a record into the time-series history table
            cursor.execute("INSERT INTO price_history (product_id, price) VALUES (%s, %s)", (product_id, price))
            
            # Save changes to the database
            conn.commit()
            print("💾 Database successfully updated with new pricing data!")
        else:
            print("❌ Could not find the price tag on the page. The HTML structure might have changed.")
    else:
        print("💤 No pending products in the database.")

def callback(ch, method, properties, body):
    # This function runs every time a new message arrives in the queue!
    job = json.loads(body)
    product_id = job['product_id']
    url = job['url']
    
    print(f"\n🚀 Received Job for Product ID: {product_id}")
    
    price = fetch_price(url)
    
    if price:
        print(f"✅ Extracted Live Price: ₹{price}")
        cursor.execute("UPDATE products SET current_price = %s WHERE id = %s", (price, product_id))
        cursor.execute("INSERT INTO price_history (product_id, price) VALUES (%s, %s)", (product_id, price))
        conn.commit()
        print("💾 Database successfully updated!")
        completed_job = {'product_id': product_id, 'price': price}
        ch.basic_publish(
            exchange='', 
            routing_key='completed_jobs', 
            body=json.dumps(completed_job)
        )
        print("📤 Sent 'Job Done' message to Node.js!")
    else:
        print("❌ Could not extract price.")
        
    # Tell RabbitMQ the job is done so it removes it from the queue
    ch.basic_ack(delivery_tag=method.delivery_tag)

def start_listening():
    print("🎧 Connecting to RabbitMQ...")
    params = pika.URLParameters(os.getenv("RABBITMQ_URL"))
    connection = pika.BlockingConnection(params)
    channel = connection.channel()
    
    # Make sure the queue exists
    channel.queue_declare(queue='scrape_jobs', durable=True)
    channel.queue_declare(queue='completed_jobs', durable=True)
    
    # Only give the worker 1 job at a time
    channel.basic_qos(prefetch_count=1)
    channel.basic_consume(queue='scrape_jobs', on_message_callback=callback)
    
    print("⏳ Worker is running and waiting for jobs. To exit press CTRL+C")
    channel.start_consuming()

if __name__ == "__main__":
    try:
        start_listening()
    except KeyboardInterrupt:
        print("\n🛑 Worker stopped by user. Cleaning up...")
    finally:
        # This ensures the database connections close safely when you stop the script
        if cursor:
            cursor.close()
        if conn:
            conn.close()
        print("🔌 Database connections closed.")