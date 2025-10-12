import { io } from 'socket.io-client';
let socket = null;

export function initializeSocket() {
  if (!socket) {
    socket = io('http://localhost:3000', {
      withCredentials: true
    });

    socket.on('connect', () => {
      console.log('Connected to notification service');
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });
  }
  return socket;
}

export function getSocket() {
  if (!socket) {
    return initializeSocket();
  }
  return socket;
}

export function subscribeToNotifications(userId, onNotification) {
  const socket = getSocket();
  
  // Subscribe to user-specific notifications
  socket.on(`notification:${userId}`, onNotification);
  
  // Request any unread notifications
  socket.emit('getUnreadNotifications', userId);
  
  // Return cleanup function
  return () => {
    socket.off(`notification:${userId}`, onNotification);
  };
}

export function markNotificationsAsRead(notificationIds) {
  const socket = getSocket();
  socket.emit('markNotificationsRead', notificationIds);
}