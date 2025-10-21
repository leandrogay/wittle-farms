import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from "../context/useAuth";
import { subscribeToNotifications, markNotificationsAsRead, getSocket } from '../services/socket';

const NotificationContext = createContext();

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id) return;

    // Subscribe to notifications
    const cleanup = subscribeToNotifications(user.id, (notification) => {
      setNotifications(prev => [notification, ...prev]);
    });

    return cleanup;
  }, [user?.id]);

  // Listen for unread notifications from server
  useEffect(() => {
    if (!user?.id) return;

    const socket = getSocket();
    const handleUnread = (unreadNotifications) => {
      setNotifications(unreadNotifications);
    };

    socket.on('unreadNotifications', handleUnread);
    
    return () => {
      socket.off('unreadNotifications', handleUnread);
    };
  }, [user?.id]);

  const markAsRead = async (notificationIds) => {
    await markNotificationsAsRead(notificationIds);
    setNotifications(prev => 
      prev.filter(n => !notificationIds.includes(n._id))
    );
  };

  const value = {
    notifications,
    unreadCount: notifications.length,
    markAsRead
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}

export default function NotificationsProvider({ userId, children }) {
  useEffect(() => {
    if (!userId) return;
    const unsub = subscribeToNotifications(userId, (notif) => {
      // Show toast or badge update
      toast(`${notif.message}`);
      // Optionally, update a notifications store/state here
    });
    return () => unsub();
  }, [userId]);

  return children;
}