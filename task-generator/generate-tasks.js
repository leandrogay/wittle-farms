const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// =====================
// Configuration
// =====================
const API_BASE_URL = 'http://localhost:3000/api';
const TASKS_ENDPOINT = `${API_BASE_URL}/tasks`;
const ATTACHMENT_DROP_ENDPOINT = `${API_BASE_URL}/tasks/attachments/drop`;

// =====================
// Static Data
// =====================
const users = [
  { _id: "68d105001122a3d207eacebc", name: "leandroakk", email: "leandroakk@gmail.com" },
  { _id: "68d11bc98e4f31d1ac5b5196", name: "ledroburner123", email: "ledroburner123@gmail.com" },
  { _id: "68d10d5b4ed529c49767bfc1", name: "jamietan888", email: "jamietan888@gmail.com" },
  { _id: "68d1053d1122a3d207eacebe", name: "tankwangwei958", email: "tankwangwei958@gmail.com" },
  { _id: "68d10d32a2bb30c65da0a312", name: "ssnharika", email: "ssnharika@gmail.com" }
];

const projects = [
  { _id: "68d11eae8e4f31d1ac5b51aa", name: "Project Z (Sprint 1)" },
  { _id: "68cbd957e831e05efdfc9f9e", name: "Project Charlie (Sprint 1)" },
  { _id: "68cbd934e831e05efdfc9f99", name: "Project Beta (Sprint 1)" },
  { _id: "68cbd906e831e05efdfc9f94", name: "Project Alpha (Sprint 1)" }
];

const funnyTasks = [
  { title: "Debug the Coffee Machine API", description: "The office coffee machine is returning 418 'I'm a teapot' errors. Need to investigate ASAP before Monday morning meetings.", notes: "Remember: caffeine levels directly correlate with code quality" },
  { title: "Implement 'Dark Mode' for My Soul", description: "Add dark theme to the application because my soul is already in dark mode and we need consistency.", notes: "Must match the eternal darkness in my heart" },
  { title: "Refactor the Spaghetti Code Monster", description: "The codebase has evolved into a pasta-based life form. Need to untangle the spaghetti before it becomes sentient.", notes: "Bring Italian dictionary for translation" },
  { title: "Fix the 99 Little Bugs", description: "99 little bugs in the code, 99 little bugs. Take one down, patch it around, 127 little bugs in the code...", notes: "Math doesn't check out but that's programming for you" },
  { title: "Train the Rubber Duck in Advanced Debugging", description: "Our rubber duck debugging consultant needs upskilling. Enroll duck in advanced problem-solving courses.", notes: "Duck prefers morning sessions, quacks loudly during afternoon meetings" },
  { title: "Optimize the Hamster Wheel Algorithm", description: "The current algorithm runs like a hamster on a wheel - lots of movement but going nowhere. Time for upgrades!", notes: "Consider replacing hamster with a more efficient rodent" },
  { title: "Write Unit Tests for My Sanity", description: "Need to verify that my sanity still functions as expected after this sprint. Create comprehensive test suite.", notes: "Current sanity.isWorking() returns false, needs investigation" },
  { title: "Implement Procrastination Prevention Module", description: "Create a feature that prevents developers from browsing memes during work hours. Ironically delayed due to meme browsing.", notes: "Will start tomorrow... or next week... or when inspiration strikes" },
  { title: "Deploy to Production on a Friday (YOLO Mode)", description: "What could possibly go wrong? Famous last words in software development history.", notes: "Emergency contact: therapy hotline, pizza delivery, energy drinks supplier" },
  { title: "Migrate Database to the Cloud (Literally)", description: "Customer wants their data 'in the cloud' so we're attaching hard drives to weather balloons. Modern problems, modern solutions.", notes: "Weather forecast crucial for uptime SLA" },
  { title: "Create AI That Orders Lunch", description: "Machine learning model to predict what developers want for lunch based on their commit messages and stress levels.", notes: "Training data: 80% pizza, 15% coffee, 5% actual food" },
  { title: "Solve World Hunger with CSS", description: "Someone said CSS can't solve real problems. Challenge accepted. Starting with centering divs, then world hunger.", notes: "display: flex; justify-content: save-the-world;" },
  { title: "Build Time Machine for Project Deadlines", description: "Since we can't meet deadlines, we'll just go back in time and give ourselves more time. Simple physics.", notes: "May cause paradoxes, but that's Future Me's problem" },
  { title: "Teach Client the Difference Between Internet and WiFi", description: "Educational mission to explain that the internet is not 'broken' when their WiFi is down. Bring visual aids.", notes: "Patience level required: Saint-like" },
  { title: "Implement Infinite Scroll for My Todo List", description: "Since my todo list keeps growing infinitely, might as well embrace it with proper infinite scroll functionality.", notes: "Ironically, this task will be added to the infinite todo list" }
];

const statuses = ['To Do', 'In Progress', 'Done'];
const priorities = ['Low', 'Medium', 'High'];

const availableFiles = [
  'bug_report.txt',
  'meeting_notes.md',
  'requirements.txt',
  'design_mockup.json',
  'code_review.md'
];

// =====================
// Deterministic Helpers
// =====================

// Fixed base deadline: 2025-01-01 12:00:00 UTC + index days
function getDeterministicDeadline(index) {
  const baseMs = Date.UTC(2025, 0, 1, 12, 0, 0);
  const ms = baseMs + index * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString();
}

// Pick item at index modulo length (stable)
function pick(array, index) {
  return array[index % array.length];
}

// Deterministic team members: take the first `count` non-creator users in a stable order
function getDeterministicTeamMembers(allUsers, creatorId, index, min = 1, max = 3) {
  const candidates = allUsers.filter(u => u._id !== creatorId);
  const count = (index % (max - min + 1)) + min; // cycles 1..3 deterministically
  return candidates.slice(0, Math.min(count, candidates.length)).map(u => u._id);
}

// Deterministic attachments: ~70% coverage via pattern, with deterministic file selection
function getDeterministicAttachments(index) {
  // Include attachments when (index % 10) < 7  => 0..6 -> 7/10 ≈ 70%
  const include = (index % 10) < 7;
  if (!include) return undefined;

  // Number of attachments cycles 1..3 deterministically
  const num = (index % 3) + 1;
  const selected = availableFiles.slice(0, num);
  return selected.map(filename => createFileFromPath(filename));
}

// Deterministic status/priority/project/creator
function getDeterministicStatus(index) {
  return pick(statuses, index);
}
function getDeterministicPriority(index) {
  return pick(priorities, index);
}
function getDeterministicProjectId(index) {
  return pick(projects, index)._id;
}
function getDeterministicCreatorId(index) {
  return pick(users, index)._id;
}

// =====================
// File Helpers
// =====================
function createFileFromPath(filename) {
  const filePath = path.join(__dirname, 'dummy-files', filename);
  try {
    const buffer = fs.readFileSync(filePath);
    return {
      filename,
      buffer,
      mimetype: getContentType(filename),
      originalname: filename,
      size: buffer.length
    };
  } catch (error) {
    console.warn(`⚠️  Could not read file: ${filename}, creating dummy content instead`);
    const content = getDummyContent(filename);
    const buffer = Buffer.from(content, 'utf-8');
    return {
      filename,
      buffer,
      mimetype: getContentType(filename),
      originalname: filename,
      size: buffer.length
    };
  }
}

function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const contentTypes = {
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.js': 'application/javascript',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.pdf': 'application/pdf'
  };
  return contentTypes[ext] || 'application/octet-stream';
}

function getDummyContent(filename) {
  const dummyContents = {
    'bug_report.txt': 'Bug Report: Coffee machine returning 418 status code\nSteps to reproduce: 1. Be tired 2. Need coffee 3. Push button 4. Cry',
    'meeting_notes.md': '# Meeting Notes\n\n## Attendees\n- Me (unfortunately)\n- Rubber Duck (most productive member)\n\n## Action Items\n- [ ] Fix everything\n- [ ] Order more coffee',
    'requirements.txt': 'Project Requirements:\n1. Must work\n2. Must work fast\n3. Must work yesterday\n4. Budget: $0\n5. Timeline: Already overdue',
    'design_mockup.json': '{"design": "beautiful", "reality": "404 not found", "client_expectations": "unrealistic", "developer_tears": "infinite"}',
    'code_review.md': '# Code Review\n\n## Comments\n- This code is like a box of chocolates... mostly nuts\n- Found the bug, it was hiding behind 3 layers of callbacks\n- Suggest we name this function "PrayItWorks()"'
  };
  return dummyContents[filename] || `Sample content for ${filename}`;
}

// =====================
// API Helpers
// =====================
async function clearExistingAttachments() {
  try {
    console.log('🗑️  Clearing existing attachments...');
    await axios.delete(ATTACHMENT_DROP_ENDPOINT);
    console.log('✅ Cleared existing attachments');
  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.log('ℹ️  No existing attachments to clear');
    } else {
      console.error('❌ Error clearing attachments:', error.message);
    }
  }
}

async function clearExistingTasks() {
  try {
    console.log('🗑️  Clearing existing tasks...');
    const response = await axios.get(TASKS_ENDPOINT);
    const tasks = response.data;
    for (const task of tasks) {
      await axios.delete(`${TASKS_ENDPOINT}/${task._id}`);
    }
    console.log(`✅ Cleared ${tasks.length} existing tasks`);
  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.log('ℹ️  No existing tasks to clear');
    } else {
      console.error('❌ Error clearing tasks:', error.message);
    }
  }
}

async function createTask(taskData) {
  try {
    const formData = new FormData();

    // Append non-file fields
    Object.keys(taskData).forEach(key => {
      if (key !== 'attachments') {
        const val = taskData[key];
        if (Array.isArray(val)) {
          val.forEach(item => formData.append(key, item));
        } else {
          formData.append(key, val);
        }
      }
    });

    // Append file fields
    if (taskData.attachments) {
      taskData.attachments.forEach(file => {
        formData.append('attachments', file.buffer, {
          filename: file.filename,
          contentType: file.mimetype
        });
      });
    }

    const response = await axios.post(TASKS_ENDPOINT, formData, {
      headers: { ...formData.getHeaders() }
    });
    return response.data;
  } catch (error) {
    console.error(`❌ Error creating task "${taskData.title}":`, error.response?.data?.error || error.message);
    throw error;
  }
}

// =====================
// Generation (Deterministic)
// =====================
async function generateTasks() {
  console.log('🚀 Starting deterministic task data generation...\n');

  try {
    await clearExistingAttachments();
    await clearExistingTasks();
    console.log('');

    const tasksToCreate = [];

    funnyTasks.forEach((taskTemplate, index) => {
      const creatorId = getDeterministicCreatorId(index);
      const taskData = {
        title: taskTemplate.title,
        description: taskTemplate.description,
        notes: taskTemplate.notes,
        assignedProject: getDeterministicProjectId(index),
        assignedTeamMembers: getDeterministicTeamMembers(users, creatorId, index, 1, 3),
        status: getDeterministicStatus(index),
        priority: getDeterministicPriority(index),
        deadline: getDeterministicDeadline(index),
        createdBy: creatorId,
        attachments: getDeterministicAttachments(index)
      };
      tasksToCreate.push(taskData);
    });

    console.log(`📝 Creating ${tasksToCreate.length} tasks...\n`);

    for (let i = 0; i < tasksToCreate.length; i++) {
      const taskData = tasksToCreate[i];
      try {
        const createdTask = await createTask(taskData);
        const attachmentInfo = taskData.attachments ? ` (${taskData.attachments.length} attachments)` : '';
        console.log(`✅ ${i + 1}/${tasksToCreate.length} Created: "${createdTask.title}"${attachmentInfo}`);
      } catch {
        console.log(`❌ ${i + 1}/${tasksToCreate.length} Failed: "${taskData.title}"`);
      }
      // Gentle pacing (still deterministic; adjust/remove as desired)
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    console.log('\n🎉 Task generation completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`   • ${tasksToCreate.length} tasks created`);
    console.log(`   • Status cycle: ${statuses.join(' → ')}`);
    console.log(`   • Priority cycle: ${priorities.join(' → ')}`);
    console.log(`   • Team members chosen deterministically from users (excluding creator)`);
    console.log(`   • Attachments included on indices where (index % 10) < 7, with 1–3 files deterministically`);

  } catch (error) {
    console.error('\n💥 Script failed:', error.message);
    process.exit(1);
  }
}

async function verifyConnection() {
  try {
    console.log('🔍 Verifying API connection...');
    await axios.get(TASKS_ENDPOINT);
    console.log('✅ API connection successful\n');
    return true;
  } catch (error) {
    console.error('❌ Cannot connect to API:', error.message);
    console.error('   Make sure your server is running at:', API_BASE_URL);
    return false;
  }
}

async function main() {
  console.log('🎭 Funny Task Generator (Deterministic) 🎭');
  console.log('=========================================\n');

  const isConnected = await verifyConnection();
  if (!isConnected) process.exit(1);

  await generateTasks();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { generateTasks, clearExistingTasks };
