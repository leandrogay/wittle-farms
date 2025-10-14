#!/usr/bin/env node

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Import models
import Project from '../models/Project.js';
import Task from '../models/Task.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: './config/secrets.env' });

async function createTestTask() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Find the project "LF-50 functional test cases"
    const project = await Project.findOne({ name: "LF-50 functional test cases" });
    if (!project) {
      throw new Error('❌ Project "LF-50 functional test cases" not found. Please create it first.');
    }
    console.log('✅ Found project:', project.name);

    // Find the user "littlefarms.inappreminder"
    const user = await User.findOne({ email: "littlefarms.inappreminder@gmail.com" });
    if (!user) {
      throw new Error('❌ User "littlefarms.inappreminder" not found. Please create this user first.');
    }
    console.log('✅ Found user:', user.email);

    // Clean up ALL existing notifications for this user (clean slate for TC-001)
    const existingNotifications = await Notification.find({ userId: user._id });
    if (existingNotifications.length > 0) {
      await Notification.deleteMany({ userId: user._id });
      console.log(`🗑️  Deleted ${existingNotifications.length} existing notification(s) for clean slate`);
    }

    // Calculate deadline: 1 day after current time
    const now = new Date();
    const deadline = new Date(now.getTime() + (24 * 60 * 60 * 1000)); // 1 day from now
    
    console.log('📅 Current time:', now.toISOString());
    console.log('📅 Task deadline:', deadline.toISOString());



    // Delete ALL existing tasks under LF-50 functional test cases project
    const existingTasks = await Task.find({ assignedProject: project._id });
    if (existingTasks.length > 0) {
      console.log(`🗑️  Deleting ${existingTasks.length} existing task(s) under "${project.name}" project...`);
      await Task.deleteMany({ assignedProject: project._id });
    }

    // Create the task with single 1 day reminder
    const taskData = {
      title: "LF-50 TC-001",
      description: "Test case for single 1 day reminder notification functionality",
      assignedProject: project._id,
      assignedTeamMembers: [user._id],
      createdBy: user._id,
      deadline: deadline,
      reminderOffsets: [1440], // 1 day (1440 minutes)
      status: "To Do",
      priority: "Medium"
    };

    const task = await Task.create(taskData);
    console.log('✅ Created task successfully!');
    console.log('📋 Task Details:');
    console.log('   - Title:', task.title);
    console.log('   - Deadline:', task.deadline.toISOString());
    console.log('   - Reminders: 1 day reminder');
    console.log('   - Assigned to:', user.email);
    console.log('   - Project:', project.name);
    console.log('   - Task ID:', task._id.toString());

    console.log('\n🎯 Test Case TC-001 Setup Complete!');
    console.log('👉 The cron job will automatically create the notification when the reminder time arrives.');
    console.log('👉 Now log in as littlefarms.inappreminder@gmail.com and check for notifications.');

  } catch (error) {
    console.error('❌ Error creating test task:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the script
createTestTask();