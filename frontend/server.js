const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

// Serve all static files in the frontend directory
app.use(express.static(__dirname));

// Fallback for SPA routing if needed, serves index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[INFO] Live Status Board server is listening on http://localhost:${PORT}`);
});
