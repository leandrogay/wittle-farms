import mongoose from 'mongoose';
const { Schema, model, Types } = mongoose;

const ProjectSchema = new Schema({
  name: { type: String, required: true, trim: true },
  department: [{ type: Types.ObjectId, ref: "Department", required: true }],
  description: { type: String, default: '' },
  createdBy: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  teamMembers: [{ type: Types.ObjectId, ref: 'User', default: [], index: true }]
},
  { timestamps: true });

export default model('Project', ProjectSchema);