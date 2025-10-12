import dotenv from 'dotenv';
dotenv.config({ path: './config/secrets.env' });

import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import http from 'http';
import { Server as IOServer } from 'socket.io';
import cron from 'node-cron';
import { runDailyOverdueDigest } from './jobs/dailyOverdueTaskEmails.js';

import authRouter from './routes/auth.js';
import userRouter from './routes/users.js';
import tasksRouter from './routes/tasks.js';
import projectRouter from './routes/projects.js';
import departmentRouter from './routes/departments.js';
import calendarRoute from "./routes/calendar.js";
import notificationsRouter from './routes/overdue-notifis.js'


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
app.use('/api/notifications', notificationsRouter)

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

// Daily 9:00 AM Asia/Singapore Overdue Email Notifications for Managers
const job = cron.schedule(
  "0 9 * * *",
  async () => {
    try {
      await runDailyOverdueDigest();
      console.log("[cron] Test digest fired");
    } catch (err) {
      console.error("[cron] Test digest failed:", err);
    }
  },
  { timezone: "Asia/Singapore" }
);