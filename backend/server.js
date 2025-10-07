import dotenv from 'dotenv';
dotenv.config({ path: './config/secrets.env' });

import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import http from 'http';
import { Server as IOServer } from 'socket.io';

import authRouter from './routes/auth.js';
import userRouter from './routes/users.js';
import tasksRouter from './routes/tasks.js';
import projectRouter from './routes/projects.js';
import departmentRouter from './routes/departments.js';
import calendarRoute from "./routes/calendar.js";


const app = express();
const PORT = process.env.PORT || 3000;

const server = http.createServer(app);

const io = new IOServer(server, {
  cors: {
    origin: 'http://localhost:5173',
    credentials: true,
  },
});

app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());

app.set("io", io);

app.use("/api/calendar", calendarRoute);
app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/projects', projectRouter);
app.use('/api/departments', departmentRouter);

console.log('Loaded ENV:', process.env.MONGO_URI);

io.on('connection', socket => {
  console.log('Client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

try {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 10,
  });
  console.log('MongoDB Connected');
} catch (err) {
  console.error('MongoDB connection error:', err);
}


// Start both Express + Socket.IO server
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
