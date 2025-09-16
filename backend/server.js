require('dotenv').config({ path: './config/secrets.env' });
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

console.log("Loaded ENV:", process.env.MONGO_URI);

// Database connection
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.error(err));

// Middleware to parse JSON
app.use(express.json());

// Sample route
app.get('/', (req, res) => {
    res.send('Hello, Node.js backend is running!');
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
