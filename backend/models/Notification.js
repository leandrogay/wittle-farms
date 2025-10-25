// models/Notification.js (notification.js in your message)
import mongoose from 'mongoose';
const { Schema, model, Types } = mongoose;

const NotificationSchema = new Schema({
  userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  taskId: { type: Types.ObjectId, ref: 'Task', required: true, index: true },

  // NEW: include 'comment'
  type: { type: String, enum: ['reminder', 'overdue', 'comment', 'mention'], required: true },

  // Only for reminders
  reminderOffset: {
    type: Number,
    required: function () { return this.type === 'reminder'; },
    index: true,
  },

  // Optional: link to the specific comment
  commentId: { type: Types.ObjectId, ref: 'Comment', default: null },

  message: { type: String, required: true },

  read: { type: Boolean, default: false, index: true },

  // For immediate events (like comments), just store "now"
  scheduledFor: { type: Date, required: true, index: true },

  sent: { type: Boolean, default: false },
}, { timestamps: true });

NotificationSchema.index({ userId: 1, read: 1, scheduledFor: -1 });

export default model('Notification', NotificationSchema);
