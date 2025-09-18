import dotenv from 'dotenv';
dotenv.config({ path: './config/secrets.env' });

import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import userRouter from './routes/users.js';
import projectRouter from './routes/projects.js';
import tasksRouter from './routes/tasks.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/users', userRouter);
app.use('/api/projects', projectRouter);
app.use('/api/tasks', tasksRouter);

// Debug: confirm env loaded
console.log('Loaded ENV:', process.env.MONGO_URI);

// DB connection (top-level await works in ESM)
try {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 10,
  });
  console.log('MongoDB Connected');
} catch (err) {
  console.error('MongoDB connection error:', err);
}

// Sample route
app.get('/', (req, res) => {
  res.send('Hello, Node.js backend is running!');
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
