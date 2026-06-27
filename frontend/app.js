const API_URL = 'http://localhost:5000/state';
const STATUSES = ['PLACED', 'CONFIRMED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED'];

// Track currently rendered orders in the UI
// { orderId: { status, element, isFading } }
const localOrders = {};

// DOM Elements
const ordersGrid = document.getElementById('orders-grid');
const noOrdersMessage = document.getElementById('no-orders');
const statActiveCount = document.getElementById('stat-active-count');
const statTopRestaurant = document.getElementById('stat-top-restaurant');
const statConnection = document.getElementById('stat-connection');

// Polling interval ID
let pollInterval = null;

// Helper to determine status node active color
function getStatusColor(status) {
  switch (status) {
    case 'PLACED': return 'var(--color-placed)';
    case 'CONFIRMED': return 'var(--color-confirmed)';
    case 'PREPARING': return 'var(--color-preparing)';
    case 'OUT_FOR_DELIVERY': return 'var(--color-out-delivery)';
    case 'DELIVERED': return 'var(--color-delivered)';
    default: return 'var(--text-secondary)';
  }
}

// Format items array into readable string
function formatItems(items) {
  if (!items || items.length === 0) return 'No items';
  return items.join(', ');
}

// Calculate top restaurant from active orders list
function updateStats(activeOrdersList) {
  const count = activeOrdersList.length;
  statActiveCount.textContent = count;

  if (count === 0) {
    statTopRestaurant.textContent = '--';
    return;
  }

  const freq = {};
  activeOrdersList.forEach(order => {
    freq[order.restaurant] = (freq[order.restaurant] || 0) + 1;
  });

  let topRest = '--';
  let maxCount = 0;
  for (const [rest, val] of Object.entries(freq)) {
    if (val > maxCount) {
      maxCount = val;
      topRest = rest;
    }
  }

  statTopRestaurant.textContent = topRest;
}

// Render or update a single order card
function updateOrderCard(order) {
  const orderId = order.order_id;
  const status = order.status;
  const statusIndex = STATUSES.indexOf(status);
  const fillWidth = (statusIndex / (STATUSES.length - 1)) * 100;

  if (localOrders[orderId]) {
    // Card exists, update it if status changed
    const record = localOrders[orderId];
    if (record.status !== status && !record.isFading) {
      record.status = status;
      
      // Update status text
      const statusSpan = record.element.querySelector('.estimated-time');
      statusSpan.textContent = status;
      statusSpan.style.borderColor = getStatusColor(status);
      statusSpan.style.color = getStatusColor(status);

      // Update progress line width
      const fillLine = record.element.querySelector('.progress-line-fill');
      fillLine.style.width = `${fillWidth}%`;

      // Update step nodes
      const steps = record.element.querySelectorAll('.step-node');
      steps.forEach((node, idx) => {
        node.className = 'step-node';
        if (idx < statusIndex) {
          node.classList.add('completed');
        } else if (idx === statusIndex) {
          node.classList.add('active');
          node.style.setProperty('--active-color', getStatusColor(status));
        }
      });

      // Update step labels
      const labels = record.element.querySelectorAll('.step-label');
      labels.forEach((label, idx) => {
        label.className = 'step-label';
        if (idx < statusIndex) {
          label.classList.add('completed');
        } else if (idx === statusIndex) {
          label.classList.add('active');
          label.style.setProperty('--active-color', getStatusColor(status));
        }
      });
    }
    return;
  }

  // Create new order card element
  const card = document.createElement('div');
  card.className = 'order-card glass-card';
  card.id = `card-${orderId}`;

  // Build the progress steps HTML
  let stepsHtml = '';
  STATUSES.forEach((st, idx) => {
    let nodeClass = '';
    let labelClass = '';
    let inlineStyle = '';
    
    if (idx < statusIndex) {
      nodeClass = 'completed';
      labelClass = 'completed';
    } else if (idx === statusIndex) {
      nodeClass = 'active';
      labelClass = 'active';
      inlineStyle = `--active-color: ${getStatusColor(status)}`;
    }

    stepsHtml += `
      <div class="step-wrapper">
        <div class="step-node ${nodeClass}" style="${inlineStyle}"></div>
      </div>
    `;
  });

  // Build step labels HTML
  let labelsHtml = '';
  STATUSES.forEach((st, idx) => {
    let labelClass = '';
    let inlineStyle = '';
    if (idx < statusIndex) {
      labelClass = 'completed';
    } else if (idx === statusIndex) {
      labelClass = 'active';
      inlineStyle = `--active-color: ${getStatusColor(status)}`;
    }
    const displayName = st.replace(/_/g, ' ');
    labelsHtml += `<div class="step-label ${labelClass}" style="${inlineStyle}">${displayName}</div>`;
  });

  card.innerHTML = `
    <div class="order-header">
      <div class="order-id-group">
        <span class="order-id">${orderId}</span>
        <span class="restaurant-name">${order.restaurant}</span>
      </div>
      <div class="order-meta">
        <span class="estimated-time" style="border-color: ${getStatusColor(status)}; color: ${getStatusColor(status)}">${status}</span>
        <span class="time-ago">Est: ~${order.estimated_delivery_minutes} min</span>
      </div>
    </div>
    
    <div class="order-body">
      <div class="items-list">
        <span class="items-label">Items Ordered</span>
        <span class="items-content">${formatItems(order.items)}</span>
      </div>
      <div class="customer-detail">
        <span class="customer-label">Customer</span>
        <span class="customer-name">${order.customer_name}</span>
      </div>
    </div>

    <div class="progress-container">
      <div class="progress-steps">
        <div class="progress-line-bg"></div>
        <div class="progress-line-fill" style="width: ${fillWidth}%"></div>
        ${stepsHtml}
      </div>
      <div class="step-labels">
        ${labelsHtml}
      </div>
    </div>
  `;

  // Prepend card to grid (most recent orders on top)
  if (ordersGrid.firstChild) {
    ordersGrid.insertBefore(card, ordersGrid.firstChild);
  } else {
    ordersGrid.appendChild(card);
  }

  // Save to local mapping
  localOrders[orderId] = {
    status: status,
    element: card,
    isFading: false
  };

  // Hide the placeholder message
  noOrdersMessage.style.display = 'none';
}

// Transition an order to DELIVERED state and fade it out
function handleCompletedOrder(orderId) {
  const record = localOrders[orderId];
  if (!record || record.isFading) return;

  record.isFading = true;
  record.status = 'DELIVERED';

  // 1. Visually transition to DELIVERED
  const statusSpan = record.element.querySelector('.estimated-time');
  statusSpan.textContent = 'DELIVERED';
  statusSpan.style.borderColor = 'var(--color-delivered)';
  statusSpan.style.color = 'var(--color-delivered)';

  const fillLine = record.element.querySelector('.progress-line-fill');
  fillLine.style.width = '100%';

  const steps = record.element.querySelectorAll('.step-node');
  steps.forEach((node, idx) => {
    node.className = 'step-node completed';
    node.style.removeProperty('--active-color');
  });

  const labels = record.element.querySelectorAll('.step-label');
  labels.forEach((label, idx) => {
    label.className = 'step-label completed';
    label.style.removeProperty('--active-color');
  });

  // 2. Wait 4 seconds, then start fade-out
  setTimeout(() => {
    record.element.classList.add('fade-out');
    
    // 3. Wait 1 more second (duration of CSS fade transition), then delete from DOM
    setTimeout(() => {
      if (record.element.parentNode) {
        record.element.parentNode.removeChild(record.element);
      }
      delete localOrders[orderId];
      
      // If no cards are left, show placeholder
      checkEmptyState();
    }, 1000);
  }, 4000);
}

// Check if we should display the "No active orders" message
function checkEmptyState() {
  const activeCount = Object.keys(localOrders).filter(id => !localOrders[id].isFading).length;
  if (activeCount === 0) {
    noOrdersMessage.style.display = 'flex';
  }
}

// Core Fetch and Render Loop
async function pollState() {
  try {
    const response = await fetch(API_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const activeOrders = await response.json();
    
    // Update connection status UI
    statConnection.textContent = 'Connected';
    statConnection.className = 'status-connected';

    const activeOrdersList = Object.values(activeOrders);
    
    // 1. Add or update active orders
    activeOrdersList.forEach(order => {
      updateOrderCard(order);
    });

    // 2. Identify and handle completed orders (present locally but missing in response)
    const activeOrderIds = new Set(Object.keys(activeOrders));
    Object.keys(localOrders).forEach(orderId => {
      if (!activeOrderIds.has(orderId) && !localOrders[orderId].isFading) {
        handleCompletedOrder(orderId);
      }
    });

    // 3. Update stats panel
    updateStats(activeOrdersList);

  } catch (err) {
    console.error('Polling failed:', err);
    statConnection.textContent = 'Offline';
    statConnection.className = 'status-disconnected';
  }
}

// Initialize Polling
function init() {
  pollState(); // initial execution
  pollInterval = setInterval(pollState, 2000); // poll every 2s
}

window.addEventListener('DOMContentLoaded', init);
