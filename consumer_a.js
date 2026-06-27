const { Kafka } = require('kafkajs');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const stateFilePath = path.join(__dirname, 'state.json');

// In-memory state tracking for active orders
let activeOrders = {};

// Initialize state from existing file if it exists, to support restarts gracefully
if (fs.existsSync(stateFilePath)) {
  try {
    activeOrders = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
    console.log('[INFO] Loaded existing state from state.json');
  } catch (err) {
    console.warn('[WARN] Could not parse existing state.json, starting fresh:', err.message);
  }
}

// Kafka Config
const kafka = new Kafka({
  clientId: 'status-tracker-consumer',
  brokers: ['localhost:9092']
});

const consumer = kafka.consumer({ groupId: 'status-tracker' });

// Express Server Config
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// API Endpoint to serve current active state
app.get('/state', (req, res) => {
  res.json(activeOrders);
});

// Periodic State Persistence (every 10 seconds)
setInterval(() => {
  try {
    fs.writeFileSync(stateFilePath, JSON.stringify(activeOrders, null, 2), 'utf8');
    // We can also print a quiet log for confirmation or timestamp update
  } catch (err) {
    console.error('[ERROR] Failed to save state to state.json:', err.message);
  }
}, 10000);

async function run() {
  try {
    console.log('[INFO] Connecting Kafka Consumer (Status Tracker)...');
    await consumer.connect();
    await consumer.subscribe({ topic: 'order-events', fromBeginning: true });
    console.log('[INFO] Subscribed to topic "order-events" in consumer group "status-tracker".');

    // Run the Kafka consumer loop
    await consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;
        
        try {
          const event = JSON.parse(message.value.toString());
          const orderId = event.order_id;
          const newStatus = event.status;
          
          const oldState = activeOrders[orderId];
          const oldStatus = oldState ? oldState.status : 'NONE';

          // Update active order details
          activeOrders[orderId] = {
            order_id: event.order_id,
            customer_name: event.customer_name,
            restaurant: event.restaurant,
            items: event.items,
            status: newStatus,
            timestamp: event.timestamp,
            estimated_delivery_minutes: event.estimated_delivery_minutes
          };

          // Log the transition
          console.log(`[UPDATE] ${orderId}: ${oldStatus} -> ${newStatus}`);

          // If the order has been delivered, log summary and remove it from active state
          if (newStatus === 'DELIVERED') {
            console.log(`[COMPLETE] ${orderId} | ${event.restaurant} | ~${event.estimated_delivery_minutes} min.`);
            delete activeOrders[orderId];
          }
        } catch (err) {
          console.error('[ERROR] Failed to process message:', err.message);
        }
      }
    });

  } catch (err) {
    console.error('[FATAL] Consumer A runtime error:', err);
  }
}

// Start Express Server
const server = app.listen(PORT, () => {
  console.log(`[INFO] HTTP Status Server running on http://localhost:${PORT}`);
});

// Run Consumer
run().catch(err => {
  console.error('[FATAL] Failed to run consumer:', err);
});
