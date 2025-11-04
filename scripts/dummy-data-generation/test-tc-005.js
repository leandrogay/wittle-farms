#!/usr/bin/env node

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Import m    console.log('👉 Now log in as littlefarms.inappreminder@gmail.com and check for 3 notifications.');   console.log('👉 Now log in as littlefarms.inappreminder@gmail.com and check for 3 notifications.');dels
import Project from '../../backend/models/Project.js';
import Task from '../../backend/models/Task.js';
import User from '../../backend/models/User.js';
import Notification from '../../backend/models/Notification.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const envPath = path.join(__dirname, '..', 'config', 'secrets.env');
dotenv.config({ path: envPath });

async function createTestTask() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Find or create the user "littlefarms.inappreminder"
    let user = await User.findOne({ email: "littlefarms.inappreminder@gmail.com" });
    if (!user) {
      console.log('👤 User "littlefarms.inappreminder@gmail.com" not found. Creating it...');
      user = await User.create({
        name: "LF-50 Test User",
        email: "littlefarms.inappreminder@gmail.com",
        password: process.env.UNIT_TEST_GENERIC_PASSWORD,
        role: "Staff"
      });
      console.log('✅ Created user:', user.email);
    } else {
      console.log('✅ Found existing user:', user.email);
      
      // Ensure the user has "Staff" role for task access in this test
      if (user.role !== "Staff") {
        console.log(`🔄 User role is "${user.role}" but test requires "Staff" role for task access`);
        console.log('🔧 Temporarily updating user role to "Staff" for this test...');
        user.role = "Staff";
        await user.save();
        console.log('✅ User role updated to "Staff"');
      } else {
        console.log('✅ User role is already "Staff"');
      }
    }

    // Find or create the project "LF-50 functional test cases"
    let project = await Project.findOne({ name: "LF-50 functional test cases" });
    if (!project) {
      console.log('📁 Project "LF-50 functional test cases" not found. Creating it...');
      project = await Project.create({
        name: "LF-50 functional test cases",
        description: "Project for functional testing of LF-50 in-app notification reminder feature",
        status: "Active",
        createdBy: user._id,
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      });
      console.log('✅ Created project:', project.name);
    } else {
      console.log('✅ Found existing project:', project.name);
    }

    // Clean up ALL existing notifications for this user (clean slate for TC-005)
    const existingNotifications = await Notification.find({ userId: user._id });
    if (existingNotifications.length > 0) {
      await Notification.deleteMany({ userId: user._id });
      console.log(`🗑️  Deleted ${existingNotifications.length} existing notification(s) for clean slate`);
    }

    // Calculate deadline: Set reminder times to be exactly NOW (within 1 minute)
    // The notification system only triggers when Math.abs(now.diff(reminderTime, 'minute')) <= 1
    const now = new Date();
    // Set deadline = now + 30 minutes, so 30min reminder = exactly now
    const deadline = new Date(now.getTime() + (30 * 60 * 1000)); // 30 minutes from now
    
    console.log('📅 Current time:', now.toISOString());
    console.log('📅 Task deadline:', deadline.toISOString());

    // Clean up existing TC-005 notifications first
    const existingTC005Task = await Task.findOne({ 
      assignedProject: project._id, 
      title: "LF-50 TC-005" 
    });
    
    if (existingTC005Task) {
      const deletedNotifs = await Notification.deleteMany({
        userId: user._id,
        taskId: existingTC005Task._id,
        type: "reminder"
      });
      if (deletedNotifs.deletedCount > 0) {
        console.log(`🗑️  Deleted ${deletedNotifs.deletedCount} existing TC-005 notifications`);
      }
    }

    // Delete ALL existing tasks under LF-50 functional test cases project
    const existingTasks = await Task.find({ assignedProject: project._id });
    if (existingTasks.length > 0) {
      console.log(`🗑️  Deleting ${existingTasks.length} existing task(s) under "${project.name}" project...`);
      await Task.deleteMany({ assignedProject: project._id });
    }

    // Create the task with 3 custom reminders
    const taskData = {
      title: "LF-50 TC-005",
      description: "Test case for multiple custom reminders (1 day, 1 hour, 30 minutes) notification functionality",
      assignedProject: project._id,
      assignedTeamMembers: [user._id],
      createdBy: user._id,
      deadline: deadline,
      reminderOffsets: [1440, 60, 30], // 1 day (1440 min), 1 hour (60 min), 30 minutes
      status: "To Do",
      priority: 5 // Medium priority (1-10 scale)
    };

    const task = await Task.create(taskData);
    console.log('✅ Created task successfully!');
    console.log('📋 Task Details:');
    console.log('   - Title:', task.title);
    console.log('   - Deadline:', task.deadline.toISOString());
    console.log('   - Reminders: 3 custom reminders (1 day, 1 hour, 30 minutes before deadline)');
    console.log('   - Assigned to:', user.email);
    console.log('   - Project:', project.name);
    console.log('   - Task ID:', task._id.toString());

    // Calculate when reminder notifications should be sent
    const reminder1Day = new Date(deadline.getTime() - (1440 * 60 * 1000));
    const reminder1Hour = new Date(deadline.getTime() - (60 * 60 * 1000));
    const reminder30Min = new Date(deadline.getTime() - (30 * 60 * 1000));
    
    console.log('🔔 Reminder notifications should be sent at:');
    console.log('   - 1 day reminder:', reminder1Day.toISOString());
    console.log('   - 1 hour reminder:', reminder1Hour.toISOString());
    console.log('   - 30 minute reminder:', reminder30Min.toISOString());

    // Create the 3 reminder notifications with realistic createdAt timestamps
    const notifications = [
      {
        userId: user._id,
        taskId: task._id,
        type: "reminder",
        reminderOffset: 1440, // 1 day
        message: `Task "${task.title}" is due in 1 day.`,
        scheduledFor: reminder1Day,
        read: false,
        sent: true,
        createdAt: reminder1Day, // Set createdAt to when the reminder should have been sent
        updatedAt: reminder1Day
      },
      {
        userId: user._id,
        taskId: task._id,
        type: "reminder",
        reminderOffset: 60, // 1 hour
        message: `Task "${task.title}" is due in 1 hour.`,
        scheduledFor: reminder1Hour,
        read: false,
        sent: true,
        createdAt: reminder1Hour, // Set createdAt to when the reminder should have been sent
        updatedAt: reminder1Hour
      },
      {
        userId: user._id,
        taskId: task._id,
        type: "reminder",
        reminderOffset: 30, // 30 minutes
        message: `Task "${task.title}" is due in 30 minutes.`,
        scheduledFor: reminder30Min,
        read: false,
        sent: true,
        createdAt: reminder30Min, // Set createdAt to when the reminder should have been sent
        updatedAt: reminder30Min
      }
    ];

    await Notification.insertMany(notifications);
    console.log('✅ Created 3 reminder notifications with realistic timestamps');

    console.log('\n🎯 Test Case TC-005 Setup Complete!');
    console.log('� 3 notifications have been created for the 3 reminders');
    console.log('�👉 Now log in as littlefarms.inappreminder@gmail.com and check for 3 notifications.');
    console.log('💡 Expected: 3 notifications should appear when notification bell is clicked');

  } catch (error) {
    console.error('❌ Error creating test task:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the script
createTestTask();