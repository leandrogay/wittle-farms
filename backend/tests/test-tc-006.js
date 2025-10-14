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

    // Clean up ALL existing notifications for this user (clean slate for TC-006)
    const existingNotifications = await Notification.find({ userId: user._id });
    if (existingNotifications.length > 0) {
      await Notification.deleteMany({ userId: user._id });
      console.log(`🗑️  Deleted ${existingNotifications.length} existing notification(s) for clean slate`);
    }

    // Calculate deadline: Set deadline to 1 day from now
    // This allows us to create notifications that were "sent" in the past
    const now = new Date();
    const deadline = new Date(now.getTime() + (1 * 24 * 60 * 60 * 1000)); // 1 day from now
    
    console.log('📅 Current time:', now.toISOString());
    console.log('📅 Task deadline:', deadline.toISOString());



    // Delete ALL existing tasks under LF-50 functional test cases project
    const existingTasks = await Task.find({ assignedProject: project._id });
    if (existingTasks.length > 0) {
      console.log(`🗑️  Deleting ${existingTasks.length} existing task(s) under "${project.name}" project...`);
      await Task.deleteMany({ assignedProject: project._id });
    }

    // Create the task WITHOUT specifying reminderOffsets to use defaults
    const taskData = {
      title: "LF-50 TC-006",
      description: "Test case for default reminders (7 days, 3 days, 1 day) notification functionality",
      assignedProject: project._id,
      assignedTeamMembers: [user._id],
      createdBy: user._id,
      deadline: deadline,
      // reminderOffsets: not specified, so will use DEFAULT_REMINDERS_MIN = [10080, 4320, 1440]
      status: "To Do",
      priority: "Medium"
    };

    const task = await Task.create(taskData);
    console.log('✅ Created task successfully!');
    console.log('📋 Task Details:');
    console.log('   - Title:', task.title);
    console.log('   - Deadline:', task.deadline.toISOString());
    console.log('   - Reminders: 3 default reminders (7 days, 3 days, 1 day before deadline)');
    console.log('   - Assigned to:', user.email);
    console.log('   - Project:', project.name);
    console.log('   - Task ID:', task._id.toString());

    // Calculate when reminder notifications should be sent based on the deadline
    const reminder7Days = new Date(deadline.getTime() - (10080 * 60 * 1000)); // 7 days before deadline
    const reminder3Days = new Date(deadline.getTime() - (4320 * 60 * 1000));  // 3 days before deadline
    const reminder1Day = new Date(deadline.getTime() - (1440 * 60 * 1000));   // 1 day before deadline
    
    console.log('🔔 Reminder notifications should be sent at:');
    console.log('   - 7 days reminder:', reminder7Days.toISOString());
    console.log('   - 3 days reminder:', reminder3Days.toISOString());
    console.log('   - 1 day reminder:', reminder1Day.toISOString());

    // Create the 3 default reminder notifications with realistic createdAt timestamps
    const notifications = [
      {
        userId: user._id,
        taskId: task._id,
        type: "reminder",
        reminderOffset: 10080, // 7 days
        message: `Task "${task.title}" is due in 7 days.`,
        scheduledFor: reminder7Days, // Shows "7 days ago"
        read: false,
        sent: true,
        createdAt: reminder7Days,
        updatedAt: reminder7Days
      },
      {
        userId: user._id,
        taskId: task._id,
        type: "reminder",
        reminderOffset: 4320, // 3 days
        message: `Task "${task.title}" is due in 3 days.`,
        scheduledFor: reminder3Days, // Shows "3 days ago"
        read: false,
        sent: true,
        createdAt: reminder3Days,
        updatedAt: reminder3Days
      },
      {
        userId: user._id,
        taskId: task._id,
        type: "reminder",
        reminderOffset: 1440, // 1 day
        message: `Task "${task.title}" is due in 1 day.`,
        scheduledFor: reminder1Day, // Shows "1 day ago" 
        read: false,
        sent: true,
        createdAt: reminder1Day,
        updatedAt: reminder1Day
      }
    ];

    await Notification.insertMany(notifications);
    console.log('✅ Created 3 default reminder notifications with realistic timestamps');

    console.log('\n🎯 Test Case TC-006 Setup Complete!');
    console.log('👉 Now log in as littlefarms.inappreminder@gmail.com and check for 3 notifications with realistic "time ago" displays.');

  } catch (error) {
    console.error('❌ Error creating test task:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the script
createTestTask();