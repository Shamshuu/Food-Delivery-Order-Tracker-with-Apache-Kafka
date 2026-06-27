# Food Delivery Order Tracker with Apache Kafka

A real-time, event-driven food delivery order tracking system built using Apache Kafka, Node.js, and a glassmorphic frontend status board. This application simulates the lifecycle of food orders and demonstrates decouple microservice interactions using Kafka producers, consumers, and consumer groups.

---

## System Architecture Overview

- **Producer (`producer.js`)**: Simulates concurrent food order lifecycles and publishes events (`PLACED` → `CONFIRMED` → `PREPARING` → `OUT_FOR_DELIVERY` → `DELIVERED`) to the `order-events` Kafka topic. It uses `order_id` as the message key to guarantee ordering.
- **Consumer A (`consumer_a.js`)**: Tracks active order states in-memory under the `status-tracker` consumer group, logs transitions, persists state to `state.json` every 10 seconds, and exposes a `GET /state` API on port `5000`.
- **Consumer B (`consumer_b.js`)**: Gathers real-time analytics under the `analytics` consumer group, counting events per restaurant and per status type, printing snapshots to the console every 15 seconds.
- **Frontend Board (`frontend/`)**: A modern, glassmorphic dark-mode web application that polls the Status Tracker API every 2 seconds, displaying progress bars and transitions for active orders. Served on port `3000`.

---

## Message Key Rationale

When publishing order status updates to Kafka, we use `order_id` (e.g. `ORD-001`) as the message key. 

### Why is this key critical?
1. **Partition Routing & Grouping**: Kafka hashes the message key to determine which partition of the topic a message is sent to. Because the hashing is deterministic, **all messages with the exact same key are routed to the same partition**.
2. **Ordering Guarantee**: Kafka guarantees strict message ordering *only within a single partition*. Within a partition, messages are stored and read in FIFO (First-In, First-Out) order. 
3. **Preventing Out-of-Order States**: An order has a strict lifecycle: `PLACED` → `CONFIRMED` → `PREPARING` → `OUT_FOR_DELIVERY` → `DELIVERED`. If we did not specify a message key (or used a random key), events for the same order would be distributed across different partitions. Since partitions are processed in parallel and at varying speeds, a consumer could process `DELIVERED` before `PREPARING` had arrived, resulting in corrupt tracking states. 

Using `order_id` as the key ensures that all state changes for any specific order are processed sequentially by the consumer.

---

## Setup & Running Instructions

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (running)
- [Node.js](https://nodejs.org/) (v18+ recommended)

### 1. Start Kafka Environment
Run Docker Compose from the root directory to spin up ZooKeeper, Kafka, and Kafdrop:
```bash
docker-compose up -d
```
Verify the services are running:
- **Kafdrop UI**: Access `http://localhost:9000` to visually inspect topics and partitions.
- **Kafka Broker**: Exposed on host port `9092`.

### 2. Create the Kafka Topic
Execute a command inside the Kafka container to create the `order-events` topic with **3 partitions** and **1-hour retention** (3600000 ms):
```bash
docker exec -it kafka kafka-topics --create --topic order-events --partitions 3 --replication-factor 1 --bootstrap-server localhost:9092 --config retention.ms=3600000
```
*(Verify that the topic appears in Kafdrop under `http://localhost:9000`)*.

### 3. Install Node.js Dependencies
Install the required packages (`kafkajs`, `express`, `cors`):
```bash
npm install
```

### 4. Run the Consumer Applications
Start each consumer in its own terminal window to observe independent event consumption:
- **Consumer A (Status Tracker & State API)**:
  ```bash
  npm run consumer-a
  ```
- **Consumer B (Analytics Engine)**:
  ```bash
  npm run consumer-b
  ```

### 5. Run the Frontend Live Status Board
Start the local frontend static server:
```bash
npm run frontend
```
Now, open your browser and navigate to `http://localhost:3000` to view the live dashboard.

### 6. Run the Order Simulation (Producer)
To generate simulated food delivery events, run the producer in another terminal. You can specify the number of simulated orders using the `--orders` flag (defaults to 10):
```bash
npm run producer -- --orders 5
```
Watch the console output of the producer, consumer terminals, and the frontend dashboard as the order states transition dynamically in real-time.