import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const DepartmentSchema = new Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' }
},
  { timestamps: true });

export default model('Department', DepartmentSchema);