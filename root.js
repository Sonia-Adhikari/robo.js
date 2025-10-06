// index.js (root JS file)

// Import necessary modules
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Example middleware
app.use(express.json());

// Example route
app.get('/', (req, res) => {
    res.send('Welcome to your Node.js app!');
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
