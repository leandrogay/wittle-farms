import mongoose from 'mongoose';
const { Schema, model, Types } = mongoose;

export const STATUS = ['To Do', 'In Progress', 'Done'];
export const PRIORITY = ['Low', 'Medium', 'High'];

const TaskSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, default: '' },
  notes: { type: String, default: '' },
  
  assignedProject: { type: Types.ObjectId, ref: 'Project', default: null, index: true },
  assignedTeamMembers: [{ type: Types.ObjectId, ref: 'User', default: [], index: true, }],

  status: { type: String, enum: STATUS, default: 'To Do', index: true },
  priority: { type: String, enum: PRIORITY, default: 'Low', index: true },
  deadline: { type: Date, index: true },

  createdBy: { type: Types.ObjectId, ref: 'User', required: true, index: true },

  attachments: [{ type: Types.ObjectId, ref: 'Attachment', index: true }],

  allDay:   { type: Boolean, default: false },
  startAt:  { type: Date, index: true },
  endAt:    { type: Date, index: true },
},
  { timestamps: true });

TaskSchema.index({ assignedProject: 1, status: 1, priority: 1, deadline: 1, startAt: 1, endAt: 1});

export default model('Task', TaskSchema);
