import mongoose from 'mongoose';
const { Schema, model, Types } = mongoose;

const ProjectSchema = new Schema({
  name: { 
    type: String, 
    required: [true, 'Project name is required'], 
    trim: true,
    maxlength: [200, 'Project name cannot exceed 200 characters']
  },
  department: [{ 
    type: Types.ObjectId, 
    ref: "Department"
  }],
  deadline: {
    type: Date,
    default: null
  },
  description: { 
    type: String, 
    default: '',
    trim: true 
  },
  createdBy: { 
    type: Types.ObjectId, 
    ref: 'User', 
    required: [true, 'Project creator is required']
  },
  teamMembers: [{ 
    type: Types.ObjectId, 
    ref: 'User'
  }]
}, { timestamps: true });

// Define indexes separately to avoid duplication warnings
ProjectSchema.index({ createdBy: 1 });
ProjectSchema.index({ teamMembers: 1 });
ProjectSchema.index({ department: 1 });
ProjectSchema.index({ name: 1 }); // For searching projects by name

// Compound indexes for common queries
ProjectSchema.index({ createdBy: 1, department: 1, teamMembers: 1 });
ProjectSchema.index({ department: 1, createdBy: 1 }); // Projects by department and creator
ProjectSchema.index({ createdBy: 1, createdAt: -1 }); // User's projects sorted by creation date

export default mongoose.models.Project || model('Project', ProjectSchema);