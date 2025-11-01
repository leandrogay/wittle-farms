import { useNotifications } from '../../context/NotificationContext';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

export default function NotificationPanel() {
  const { notifications, markAsRead } = useNotifications();

  const handleMarkAsRead = (notificationId) => {
    markAsRead([notificationId]);
  };

  const handleMarkAllAsRead = () => {
    const ids = notifications.map(n => n._id);
    markAsRead(ids);
  };

  return (
    <div className="absolute right-0 mt-2 w-74 bg-light-bg dark:bg-dark-bg rounded-lg shadow-lg z-30 border border-light-border dark:border-dark-border overflow-hidden">
      <div className="p-4 border-b border-light-border dark:border-dark-border flex justify-between items-center">
        <h3 className="text-lg font-semibold text-light-text-primary dark:text-dark-text-primary">
          Notifications
        </h3>
        {notifications.length > 0 && (
          <button
            onClick={handleMarkAllAsRead}
            className="text-sm text-brand-primary dark:text-brand-secondary hover:underline"
          >
            Mark all as read
          </button>
        )}
      </div>
      <div className="max-h-96 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="p-4 text-center text-light-text-muted dark:text-dark-text-muted">
            No new notifications
          </div>
        ) : (
          <ul>
            {notifications.map((notification) => (
              <li
                key={notification._id}
                className="border-b border-light-border dark:border-dark-border last:border-0"
              >
                <div className="p-4 hover:bg-light-bg-secondary dark:hover:bg-dark-bg-secondary">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="text-sm text-light-text-primary dark:text-dark-text-primary">
                        {notification.message}
                      </p>
                      <p className="mt-1 text-xs text-light-text-muted dark:text-dark-text-muted">
                        {dayjs(notification.scheduledFor).fromNow()}
                      </p>
                    </div>
                    <button
                      onClick={() => handleMarkAsRead(notification._id)}
                      className="ml-2 text-brand-primary dark:text-brand-secondary hover:underline text-sm"
                    >
                      Mark as read
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}