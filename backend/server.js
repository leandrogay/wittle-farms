import dotenv from 'dotenv';
dotenv.config({ path: './config/secrets.env' });

import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';

import authRouter from './routes/auth.js';
import userRouter from './routes/users.js';
import tasksRouter from './routes/tasks.js';
import projectRouter from './routes/projects.js';
import departmentRouter from './routes/departments.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/projects', projectRouter);
app.use('/api/departments', departmentRouter);

console.log('Loaded ENV:', process.env.MONGO_URI);

try {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 10,
  });
  console.log('MongoDB Connected');
} catch (err) {
  console.error('MongoDB connection error:', err);
}

app.get('/', (_req, res) => res.send('Hello, Node.js backend is running!'));

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
