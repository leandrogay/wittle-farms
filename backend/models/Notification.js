import mongoose from 'mongoose';
const { Schema, model, Types } = mongoose;

const NotificationSchema = new Schema({
  userId: { 
    type: Types.ObjectId, 
    ref: 'User', 
    required: true, 
    index: true 
  },
  taskId: { 
    type: Types.ObjectId, 
    ref: 'Task', 
    required: true, 
    index: true 
  },
  type: { 
    type: String, 
    enum: ['reminder', 'overdue'], 
    required: true 
  },
  message: { 
    type: String, 
    required: true 
  },
  read: { 
    type: Boolean, 
    default: false, 
    index: true 
  },
  scheduledFor: { 
    type: Date, 
    required: true,
    index: true 
  },
  sent: { 
    type: Boolean, 
    default: false 
  }
}, {
  timestamps: true // Adds createdAt and updatedAt timestamps
});

// Compound index for efficient querying of unread notifications
NotificationSchema.index({ userId: 1, read: 1, scheduledFor: -1 });

export default model('Notification', NotificationSchema);