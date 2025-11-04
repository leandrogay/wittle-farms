import dotenv from 'dotenv';
dotenv.config({ path: './config/secrets.env' });

import http from 'http';
import mongoose from 'mongoose';
import cron from 'node-cron';
import { Server as IOServer } from 'socket.io';

import app from './app.js';
import { runDailyOverdueDigest } from './jobs/daily-overdue-task-emails.js';
import { 
  checkAndCreateReminders,     
  getUnreadNotifications,
  markNotificationsAsRead,
  sendPendingEmails
} from './services/notification-service.js';

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const io = new IOServer(server, {
  cors: { origin: 'http://localhost:5173', credentials: true },
});
app.set('io', io);

console.log('Loaded ENV:', process.env.MONGO_URI);

// Socket.IO logic
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('getUnreadNotifications', async (userId) => {
    const notifications = await getUnreadNotifications(userId);
    socket.emit('unreadNotifications', notifications);
  });

  socket.on('markNotificationsRead', async (notificationIds) => {
    await markNotificationsAsRead(notificationIds);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Cron jobs
cron.schedule('* * * * *', async () => {
  try {
    const newlyCreated = await checkAndCreateReminders();
    if (newlyCreated.length > 0) {
      newlyCreated.forEach((n) => io.emit(`notification:${n.userId}`, n));
    }
    await sendPendingEmails();
  } catch (err) {
    console.error('[cron] reminder flow failed:', err);
  }
}, { timezone: 'Asia/Singapore' });

cron.schedule('0 9 * * *', async () => {
  try {
    await runDailyOverdueDigest();
    console.log('[cron] daily overdue digest sent');
  } catch (err) {
    console.error('[cron] daily overdue digest failed:', err);
  }
}, { timezone: 'Asia/Singapore' });

// Mongo connection + server start
try {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 10,
  });
  console.log('MongoDB Connected');
} catch (err) {
  console.error('MongoDB connection error:', err);
}

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
