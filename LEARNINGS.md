# Learning Checkpoints & Offset Experiment Findings

This document contains the findings of the offset experiment and detailed answers to the guided checkpoints for understanding Apache Kafka.

---

### Offset Experiment Findings

To understand how Apache Kafka tracks consumer progress, we conducted the following experiment:
1. **Initial Run**: We started both Consumer A (Status Tracker, group `status-tracker`) and Consumer B (Analytics Engine, group `analytics`) and ran the producer to publish initial order events.
2. **Stop Consumer A**: We stopped Consumer A using `Ctrl+C` while keeping Consumer B running.
3. **Generate More Data**: We ran the producer again to publish 20–30 more order events. Consumer B processed these events immediately.
4. **Restart Consumer A**: We restarted Consumer A and observed its behavior.

#### Observations & Answers:
- **What happens when Consumer A restarts? Does it process the messages that were sent while it was offline? Why or why not?**
  - **Behavior**: When Consumer A restarted, it immediately processed all the messages that were published while it was offline, updating its in-memory state and console logs.
  - **Reason**: This happens because Kafka tracks progress using **committed offsets** for each consumer group. When Consumer A went offline, its committed offset in the `status-tracker` group stayed at the last processed message ID. Since the topic's retention is 1 hour, Kafka kept the messages in the log. Upon reconnection, Consumer A resumed polling starting from the last recorded offset, successfully catching up on the missed events.

---

### Guided Checkpoints

#### 1. What is a consumer offset? Where does Kafka store it?
- **Consumer Offset**: An offset is a sequential, monotonically increasing integer assigned to each message as it is written to a partition. A *consumer offset* represents the bookmark of the next message that a consumer group expects to read from a given partition.
- **Storage**: Kafka stores consumer offsets in a special, highly replicated internal topic named `__consumer_offsets`. When a consumer commits its offset, it writes a message to this topic. If a consumer crashes or restarts, it reads its last committed offset from this topic to resume processing.

#### 2. Auto Offset Reset Policy (`auto.offset.reset`)
This policy controls consumer behavior when there is no committed offset for a consumer group (e.g., when a brand-new group starts) or if the offset is out-of-range (e.g., the message has been deleted due to retention).
- **`earliest`**: The consumer automatically resets the offset to the earliest message available in the partition. It will read the entire topic's history from the beginning.
- **`latest`**: The consumer resets the offset to the latest message (the end of the partition log). It will only receive messages that are published *after* it starts, ignoring all historical data.

#### 3. Sharing the Same Consumer Group ID
- **What would happen if both Consumer A and Consumer B shared the same consumer group ID?**
  - **Work Sharing**: In Kafka, each partition in a topic is consumed by exactly one consumer instance within a consumer group at any given time. If Consumer A and Consumer B shared a group ID (e.g., `app-group`), Kafka would perform partition rebalancing:
    - Partition 0: Assigned to Consumer A
    - Partition 1: Assigned to Consumer B
    - Partition 2: Assigned to Consumer A (or B)
  - **Message Division**: As a result, each message would be sent to either Consumer A or Consumer B, but **never both**.
  - **Consequence**: Since Consumer A (Status Tracker) and Consumer B (Analytics) perform completely different tasks, sharing a group ID would break the system. Consumer A would only track states for a subset of orders, and Consumer B would only count analytics for the other subset. They must remain in independent consumer groups (`status-tracker` and `analytics`) to each receive their own full stream of topic events.
