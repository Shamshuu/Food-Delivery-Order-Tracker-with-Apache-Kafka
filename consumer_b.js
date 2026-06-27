const { Kafka } = require('kafkajs');

// In-memory counters
const messagesPerRestaurant = {};
const statusCounts = {};

// Kafka Config
const kafka = new Kafka({
  clientId: 'analytics-consumer',
  brokers: ['localhost:9092']
});

const consumer = kafka.consumer({ groupId: 'analytics' });

// Periodic reporting (every 15 seconds)
setInterval(() => {
  console.log('\n=========================================');
  console.log(`[ANALYTICS] Snapshot - ${new Date().toISOString()}`);
  console.log('=========================================');
  console.log('Events per Restaurant:');
  console.log(JSON.stringify(messagesPerRestaurant, null, 2));
  console.log('-----------------------------------------');
  console.log('Status Event Frequencies:');
  console.log(JSON.stringify(statusCounts, null, 2));
  console.log('=========================================\n');
}, 15000);

async function run() {
  try {
    console.log('[INFO] Connecting Kafka Consumer (Analytics Engine)...');
    await consumer.connect();
    await consumer.subscribe({ topic: 'order-events', fromBeginning: true });
    console.log('[INFO] Subscribed to topic "order-events" in consumer group "analytics".');

    // Run the Kafka consumer loop
    await consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;

        try {
          const event = JSON.parse(message.value.toString());
          const restaurant = event.restaurant;
          const status = event.status;

          // Increment restaurant count
          if (restaurant) {
            messagesPerRestaurant[restaurant] = (messagesPerRestaurant[restaurant] || 0) + 1;
          }

          // Increment status count
          if (status) {
            statusCounts[status] = (statusCounts[status] || 0) + 1;
          }
        } catch (err) {
          console.error('[ERROR] Failed to process message for analytics:', err.message);
        }
      }
    });

  } catch (err) {
    console.error('[FATAL] Consumer B runtime error:', err);
  }
}

run().catch(err => {
  console.error('[FATAL] Failed to run consumer:', err);
});
