import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const UserSchema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  role: { type: String, enum: ['Manager', 'Staff'], default: 'Staff' }
},
  { timestamps: true });

export default model('User', UserSchema);