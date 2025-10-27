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
    assignedProject: { type: Types.ObjectId, ref: 'Project', default: null },
    assignedTeamMembers: [{ type: Types.ObjectId, ref: 'User' }],
    status: { type: String, enum: STATUS, default: 'To Do' },
    priority: {
      type: Number,
      min: 1,
      max: 10,
      default: 5,
    },
    deadline: { type: Date },
    createdBy: { type: Types.ObjectId, ref: 'User', required: true },
    attachments: [{ type: Types.ObjectId, ref: 'Attachment' }],
    allDay: { type: Boolean, default: false },
    startAt: { type: Date },
    endAt: { type: Date },
    completedAt: { type: Date },
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

// Define all indexes using .index() method
// Compound index for most common query pattern
TaskSchema.index({
  assignedProject: 1,
  status: 1,
  priority: 1,
  deadline: 1,
  startAt: 1,
  endAt: 1
});

// Additional indexes for array fields and specific queries
TaskSchema.index({ assignedTeamMembers: 1 });
TaskSchema.index({ attachments: 1 });
TaskSchema.index({ createdBy: 1 });

function normalizeOffsets(val) {
  const arr = Array.isArray(val) ? val : [];
  return [...new Set(arr.map(Number))]
    .filter(n => Number.isFinite(n) && n > 0)
    .sort((a, b) => b - a);
}

TaskSchema.pre('save', function (next) {
  this.reminderOffsets = normalizeOffsets(this.reminderOffsets);

  if (this.deadline && this.reminderOffsets.length === 0) {
    this.reminderOffsets = DEFAULT_REMINDERS_MIN;
  }
  next();
});

TaskSchema.pre('findOneAndUpdate', function (next) {
  const u = this.getUpdate() || {};
  if (u && Object.prototype.hasOwnProperty.call(u, 'reminderOffsets')) {
    u.reminderOffsets = normalizeOffsets(u.reminderOffsets);
    this.setUpdate(u);
  }
  next();
});

export default mongoose.models.Task || model('Task', TaskSchema);