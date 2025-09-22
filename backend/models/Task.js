import mongoose from 'mongoose';
const { Schema, model, Types } = mongoose;

export const STATUS = ['Not Started', 'In Progress', 'Done'];
export const PRIORITY = ['Low', 'Medium', 'High'];

const TaskSchema = new Schema({
  assignedProject: { type: Types.ObjectId, ref: 'Project', default: null, index: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, default: '' },
  notes: { type: String, default: '' },

  assignedTeamMembers: [{ type: Types.ObjectId, ref: 'User', default: [], index: true, }],

  status: { type: String, enum: STATUS, default: 'Not Started', index: true },
  priority: { type: String, enum: PRIORITY, default: 'Low', index: true },
  deadline: { type: Date, index: true },

  createdBy: { type: Types.ObjectId, ref: 'User', required: true, index: true },

  attachments: [{ type: Types.ObjectId, ref: 'Attachment', index: true }]
},
  { timestamps: true });

TaskSchema.index({ assignedProject: 1, status: 1, priority: 1, deadline: 1 });

export default model('Task', TaskSchema);
