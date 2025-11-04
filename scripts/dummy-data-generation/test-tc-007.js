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

    // Clean up ALL existing notifications for this user (clean slate for TC-007)
    const existingNotifications = await Notification.find({ userId: user._id });
    if (existingNotifications.length > 0) {
      await Notification.deleteMany({ userId: user._id });
      console.log(`🗑️  Deleted ${existingNotifications.length} existing notification(s) for clean slate`);
    }

    // Calculate deadline: Set deadline to be 5 minutes AGO (overdue)
    const now = new Date();
    const deadline = new Date(now.getTime() - (5 * 60 * 1000)); // 5 minutes ago
    
    console.log('📅 Current time:', now.toISOString());
    console.log('📅 Task deadline (OVERDUE):', deadline.toISOString());
    console.log('⏰ Task is overdue by:', Math.floor((now - deadline) / 60000), 'minutes');

    // Delete ALL existing tasks under LF-50 functional test cases project
    const existingTasks = await Task.find({ assignedProject: project._id });
    if (existingTasks.length > 0) {
      console.log(`🗑️  Deleting ${existingTasks.length} existing task(s) under "${project.name}" project...`);
      await Task.deleteMany({ assignedProject: project._id });
    }

    // Create the overdue task with no reminder offsets (we want to test overdue notification only)
    const taskData = {
      title: "LF-50 TC-007",
      description: "Test case for overdue notification functionality - task deadline has passed",
      assignedProject: project._id,
      assignedTeamMembers: [user._id],
      createdBy: user._id,
      // NOTE: We'll set deadline after creation to avoid default reminderOffsets being applied
      reminderOffsets: [], // No reminder offsets - we only want overdue notification
      status: "In Progress", // Not Done yet, so overdue notification should trigger
      priority: 8 // High priority (1-10 scale) since it's overdue
    };

    const task = await Task.create(taskData);
    
    // Now update the task with the deadline to avoid the pre-save middleware adding default reminders
    task.deadline = deadline;
    task.reminderOffsets = []; // Explicitly clear any default reminders
    await task.save();
    console.log('✅ Created overdue task successfully!');
    console.log('📋 Task Details:');
    console.log('   - Title:', task.title);
    console.log('   - Deadline:', task.deadline.toISOString());
    console.log('   - Status:', task.status);
    console.log('   - Reminders: None (testing overdue only)');
    console.log('   - Assigned to:', user.email);
    console.log('   - Project:', project.name);
    console.log('   - Task ID:', task._id.toString());

    console.log('\n🎯 Test Case TC-007 Setup Complete!');
    console.log('🚨 TASK IS OVERDUE - deadline was 5 minutes ago');
    console.log('👉 The cron job will automatically create an overdue notification within 1 minute.');
    console.log('👉 Now log in as littlefarms.inappreminder@gmail.com and check for overdue notification.');
    console.log('');
    console.log('📝 Expected Result:');
    console.log('   ✅ An overdue notification should appear in the notification bell');
    console.log('   ✅ Notification message should contain "overdue" and task title');
    console.log('   ✅ Notification should persist until task is marked "Done"');
    console.log('   ✅ Only ONE overdue notification per task (no duplicates)');

  } catch (error) {
    console.error('❌ Error creating test task:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the script
createTestTask();