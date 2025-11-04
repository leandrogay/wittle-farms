#!/usr/bin/env node

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Import models
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
      priority: 5 // Medium priority (1-10 scale)
    };

    const task = await Task.create(taskData);
    console.log('✅ Created task successfully!');
    console.log('📋 Task Details:');
    console.log('   - Title:', task.title);
    console.log('   - Deadline:', task.deadline.toISOString());
    console.log('   - ReminderOffsets:', task.reminderOffsets); // Verify defaults applied
    console.log('   - Assigned to:', user.email);
    console.log('   - Project:', project.name);
    console.log('   - Task ID:', task._id.toString());

    // Verify that default reminders were automatically applied
    if (JSON.stringify(task.reminderOffsets) === JSON.stringify([10080, 4320, 1440])) {
      console.log('✅ Default reminders automatically applied: [10080, 4320, 1440] (7d, 3d, 1d)');
    } else {
      console.log('⚠️  Warning: Expected default reminders [10080, 4320, 1440], got:', task.reminderOffsets);
    }

    // Calculate when reminder notifications will be sent
    const reminder7Days = new Date(deadline.getTime() - (10080 * 60 * 1000)); // 7 days before deadline
    const reminder3Days = new Date(deadline.getTime() - (4320 * 60 * 1000));  // 3 days before deadline
    const reminder1Day = new Date(deadline.getTime() - (1440 * 60 * 1000));   // 1 day before deadline
    
    console.log('\n🔔 Reminder notifications will be automatically created by cron at:');
    console.log('   - 7 days before:', reminder7Days.toISOString());
    console.log('   - 3 days before:', reminder3Days.toISOString());
    console.log('   - 1 day before:', reminder1Day.toISOString());

    console.log('\n🎯 Test Case TC-006 Setup Complete!');
    console.log('👉 The cron job will automatically create notifications at the scheduled times.');
    console.log('👉 Log in as littlefarms.inappreminder@gmail.com to check for notifications as they arrive.');

  } catch (error) {
    console.error('❌ Error creating test task:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the script
createTestTask();