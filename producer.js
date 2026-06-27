const { Kafka } = require('kafkajs');
const fs = require('fs');
const path = require('path');

// Load fixtures
const fixturesPath = path.join(__dirname, 'fixtures.json');
if (!fs.existsSync(fixturesPath)) {
  console.error('[ERROR] fixtures.json not found in the root directory.');
  process.exit(1);
}
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));

// Parse command-line arguments
const args = process.argv.slice(2);
let ordersCount = 10;
const ordersIndex = args.indexOf('--orders');
if (ordersIndex !== -1 && args[ordersIndex + 1]) {
  ordersCount = parseInt(args[ordersIndex + 1], 10);
  if (isNaN(ordersCount)) {
    console.error('[ERROR] --orders must be a number.');
    process.exit(1);
  }
}

// Kafka configuration
const kafka = new Kafka({
  clientId: 'food-delivery-producer',
  brokers: ['localhost:9092'],
  // Default retry configuration in kafkajs is robust, but we will also implement manual retries
  retry: {
    retries: 5
  }
});

const producer = kafka.producer();

// Helpers
const getRandomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];
const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Retry wrapper for publishing
async function sendWithRetry(messagePayload, retriesLeft = 3) {
  try {
    await producer.send(messagePayload);
  } catch (err) {
    if (retriesLeft > 0) {
      console.warn(`[RETRY] Failed to publish message to topic "${messagePayload.topic}". Retrying in 2 seconds... (${retriesLeft} retries left). Error: ${err.message}`);
      await sleep(2000);
      return sendWithRetry(messagePayload, retriesLeft - 1);
    } else {
      console.error(`[ERROR] Failed to publish message after retries. Error: ${err.message}`);
      throw err;
    }
  }
}

const statuses = ['PLACED', 'CONFIRMED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED'];

async function simulateOrder(index) {
  const orderId = `ORD-${String(index).padStart(3, '0')}`;
  const customerName = getRandomElement(fixtures.customers);
  const restaurant = getRandomElement(fixtures.restaurants);
  
  // Select 1 to 3 random menu items
  const itemsCount = getRandomInt(1, 3);
  const items = [];
  for (let i = 0; i < itemsCount; i++) {
    items.push(getRandomElement(fixtures.menu_items));
  }
  
  const estimatedDeliveryMinutes = getRandomInt(15, 50);

  // Stagger the start time of the order to simulate a continuous flow of incoming orders
  const startStaggerMs = getRandomInt(0, 5000);
  await sleep(startStaggerMs);

  for (let i = 0; i < statuses.length; i++) {
    const status = statuses[i];
    
    const message = {
      order_id: orderId,
      customer_name: customerName,
      restaurant: restaurant,
      items: items,
      status: status,
      timestamp: new Date().toISOString(),
      estimated_delivery_minutes: estimatedDeliveryMinutes
    };

    const payload = {
      topic: 'order-events',
      messages: [
        {
          key: orderId,
          value: JSON.stringify(message)
        }
      ]
    };

    await sendWithRetry(payload);
    console.log(`[SENT] ${orderId} -> ${status}`);

    // If it's not the last status, sleep for a random interval between 2 and 8 seconds
    if (i < statuses.length - 1) {
      const delayMs = getRandomInt(2000, 8000);
      await sleep(delayMs);
    }
  }
}

async function run() {
  console.log(`[INFO] Starting Simulation for ${ordersCount} orders...`);
  try {
    await producer.connect();
    console.log('[INFO] Kafka Producer connected successfully.');

    // Launch simulations concurrently
    const orderSimulations = [];
    for (let i = 1; i <= ordersCount; i++) {
      orderSimulations.push(simulateOrder(i));
    }

    await Promise.all(orderSimulations);
    console.log('[INFO] All order simulations completed successfully.');
  } catch (err) {
    console.error('[FATAL] Simulation failed:', err);
  } finally {
    await producer.disconnect();
    console.log('[INFO] Kafka Producer disconnected.');
  }
}

run();
