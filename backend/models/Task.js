import mongoose from 'mongoose';
const { Schema, model, Types } = mongoose;

export const STATUS = ['To Do', 'In Progress', 'Done'];
export const PRIORITY = ['Low', 'Medium', 'High'];
export const DEFAULT_REMINDERS_MIN = [10080, 4320, 1440]; // 7d, 3d, 1d

const TaskSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '' },
    notes: { type: String, default: '' },

    assignedProject: { type: Types.ObjectId, ref: 'Project', default: null, index: true },
    assignedTeamMembers: [{ type: Types.ObjectId, ref: 'User', default: [], index: true }],

    status: { type: String, enum: STATUS, default: 'To Do', index: true },
    priority: { type: String, enum: PRIORITY, default: 'Low', index: true },
    deadline: { type: Date, index: true },
    createdBy: { type: Types.ObjectId, ref: 'User', required: true, index: true },

    attachments: [{ type: Types.ObjectId, ref: 'Attachment', index: true }],

    allDay: { type: Boolean, default: false },
    startAt: { type: Date, index: true },
    endAt: { type: Date, index: true },
    completedAt: { type: Date, index: true },

    // Minutes before deadline (custom only)
    reminderOffsets: {
      type: [Number],
      default: [],
      validate: {
        validator: arr => arr.every(n => Number.isFinite(n) && n > 0),
        message: 'All reminder offsets must be positive numbers (minutes).'
      }
    }
  },
  { timestamps: true }
);

TaskSchema.index({
  assignedProject: 1,
  status: 1,
  priority: 1,
  deadline: 1,
  startAt: 1,
  endAt: 1
});

function normalizeOffsets(val) {
  const arr = Array.isArray(val) ? val : [];
  return [...new Set(arr.map(Number))]
    .filter(n => Number.isFinite(n) && n > 0)
    .sort((a, b) => b - a);
}

TaskSchema.pre('save', function(next) {
  this.reminderOffsets = normalizeOffsets(this.reminderOffsets);
  next();
});

TaskSchema.pre('findOneAndUpdate', function(next) {
  const u = this.getUpdate() || {};
  if (u && Object.prototype.hasOwnProperty.call(u, 'reminderOffsets')) {
    u.reminderOffsets = normalizeOffsets(u.reminderOffsets);
    this.setUpdate(u);
  }
  next();
});

export default model('Task', TaskSchema);
