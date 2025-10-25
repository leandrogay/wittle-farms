const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// =====================
// Configuration
// =====================
const API_BASE_URL = 'http://localhost:3000/api';
const PROJECTS_ENDPOINT = `${API_BASE_URL}/projects`;
const TASKS_ENDPOINT = `${API_BASE_URL}/tasks`;

// =====================
// Static Data
// =====================

// Department IDs
const DEPARTMENTS = {
  SALES: "68e48a4a10fbb4910a50f2fd",
  CONSULTANCY: "68e48ac310fbb4910a50f300",
  SYSTEM_SOLUTIONING: "68e48ade10fbb4910a50f302",
  ENGINEERING_OPS: "68e48bac10fbb4910a50f30c",
  HR_ADMIN: "68e48bcf10fbb4910a50f30f",
  FINANCE: "68e48bd910fbb4910a50f311",
  IT: "68e48be010fbb4910a50f313"
};

// User IDs
const DIRECTORS = [
  { _id: "68d105001122a3d207eacebc", name: "leandroakk", role: "Director" }
];

const MANAGERS = [
  { _id: "68d1053d1122a3d207eacebe", name: "tankwangwei958", role: "Manager" },
  { _id: "68d10d32a2bb30c65da0a312", name: "ssnharika", role: "Manager" }
];

const STAFF = [
  { _id: "68d10caa4ed529c49767bfbb", name: "jamie.tan.2023", role: "Staff" },
  { _id: "68d79231285e8d7d7adb2baa", name: "imranashry", role: "Staff" },
  { _id: "68d11bc98e4f31d1ac5b5196", name: "ledroburner123", role: "Staff" }
];

const ALL_CREATORS = [...DIRECTORS, ...MANAGERS];
const ALL_USERS = [...DIRECTORS, ...MANAGERS, ...STAFF];

// Task constants
const STATUSES = ['To Do', 'In Progress', 'Done'];
const PRIORITIES = ['Low', 'Medium', 'High'];
const DEFAULT_REMINDERS = [10080, 4320, 1440]; // 7d, 3d, 1d

const availableFiles = [
  'bug_report.txt',
  'meeting_notes.md',
  'requirements.txt',
  'design_mockup.json',
  'code_review.md'
];

// =====================
// Project Templates (15 projects)
// =====================
const projectTemplates = [
  {
    name: "Operation Caffeinate Supreme",
    description: "Enterprise-wide initiative to optimize caffeine distribution networks across all office locations. Strategic planning includes procurement, machine maintenance, and emergency protocols for Monday mornings.",
    departments: [DEPARTMENTS.HR_ADMIN],
    deadlineOffset: -5,
    teamSize: 2
  },
  {
    name: "The Great Cloud Migration Adventure",
    description: "Epic odyssey of migrating our entire infrastructure from 'that mysterious server in the closet' to the ethereal realm of cloud computing. Dragons and uptime guarantees included.",
    departments: [DEPARTMENTS.IT, DEPARTMENTS.SYSTEM_SOLUTIONING],
    deadlineOffset: 3,
    teamSize: 3
  },
  {
    name: "Project Synergy Overdrive",
    description: "Paradigm-shifting initiative leveraging bleeding-edge cross-functional synergies to revolutionize our vertical integration deliverables. (Translation available upon request)",
    departments: [DEPARTMENTS.CONSULTANCY],
    deadlineOffset: 8,
    teamSize: 2
  },
  {
    name: "Digital Renaissance 2.0",
    description: "Revolutionary campaign to eliminate all paper from workflows. Current status: Ironically printing out documentation about going paperless.",
    departments: [DEPARTMENTS.FINANCE, DEPARTMENTS.HR_ADMIN],
    deadlineOffset: -10,
    teamSize: 1
  },
  {
    name: "The Meeting Reduction Manifesto",
    description: "Comprehensive strategy to reduce unnecessary meetings by 60%. Implementation requires weekly status meetings to discuss meeting reduction progress.",
    departments: [DEPARTMENTS.HR_ADMIN],
    deadlineOffset: 15,
    teamSize: 2
  },
  {
    name: "Moonshot Q4 Revenue Blitz 🚀",
    description: "Aggressive sales offensive featuring ambitious targets, motivational mantras, and enough optimism to power a startup incubator. Reality checks sold separately.",
    departments: [DEPARTMENTS.SALES, DEPARTMENTS.CONSULTANCY],
    deadlineOffset: 45,
    teamSize: 4
  },
  {
    name: "WiFi Archaeology Expedition",
    description: "Scientific investigation into the mysterious connectivity dead zone in the northwest corner. Local legends speak of an ancient router curse.",
    departments: [DEPARTMENTS.IT, DEPARTMENTS.ENGINEERING_OPS],
    deadlineOffset: 2,
    teamSize: 1
  },
  {
    name: "Budget Matrix: Financial Awakening",
    description: "Construction of the ultimate financial forecasting mega-spreadsheet. Features 52 interconnected tabs, formulas that question existence, and macros that may achieve sentience.",
    departments: [DEPARTMENTS.FINANCE],
    deadlineOffset: -2,
    teamSize: 2
  },
  {
    name: "Meta-Automation Initiative",
    description: "Revolutionary project to automate our automation workflows. Future phases include automating the automation of automation. Efficiency paradox imminent.",
    departments: [DEPARTMENTS.SYSTEM_SOLUTIONING, DEPARTMENTS.IT],
    deadlineOffset: 25,
    teamSize: 2
  },
  {
    name: "Inbox Zero Pilgrimage 2025",
    description: "Annual spiritual journey toward the mythical state of zero unread emails. Current obstacles: 5,742 unread messages and a complete lack of self-discipline.",
    departments: [DEPARTMENTS.HR_ADMIN, DEPARTMENTS.SALES],
    deadlineOffset: 10,
    teamSize: 1
  },
  {
    name: "Customer Experience Metamorphosis",
    description: "Total transformation of customer touchpoints through revolutionary UX principles. Includes redesigning things that weren't broken to begin with.",
    departments: [DEPARTMENTS.CONSULTANCY, DEPARTMENTS.SALES],
    deadlineOffset: -7,
    teamSize: 3
  },
  {
    name: "Security Fortress Protocol",
    description: "Comprehensive cybersecurity overhaul to protect against threats both real and imaginary. Step 1: Change all passwords. Step 2: Forget all passwords.",
    departments: [DEPARTMENTS.IT],
    deadlineOffset: 5,
    teamSize: 2
  },
  {
    name: "Onboarding Experience Revolution",
    description: "Complete reimagining of new employee orientation. Now features interactive modules, mentorship programs, and significantly less awkward icebreakers.",
    departments: [DEPARTMENTS.HR_ADMIN],
    deadlineOffset: 20,
    teamSize: 2
  },
  {
    name: "Process Optimization Extravaganza",
    description: "Streamlining all business processes by introducing new processes to optimize old processes. Efficiency through complexity, obviously.",
    departments: [DEPARTMENTS.ENGINEERING_OPS, DEPARTMENTS.CONSULTANCY],
    deadlineOffset: 12,
    teamSize: 3
  },
  {
    name: "Annual Report Spectacular",
    description: "Creating this year's annual report: 200 pages of graphs, achievements, and carefully worded explanations for things that didn't go as planned.",
    departments: [DEPARTMENTS.FINANCE, DEPARTMENTS.SALES],
    deadlineOffset: 30,
    teamSize: 2
  }
];

// =====================
// Task Templates (Various for each project)
// =====================
const taskTemplates = {
  // General task templates that can apply to any project
  generic: [
    { title: "Debug the Coffee Machine API", description: "The office coffee machine is returning 418 'I'm a teapot' errors. Critical investigation required before Monday meetings.", notes: "Caffeine levels directly impact code quality. This is not a drill." },
    { title: "Implement Dark Mode for Everything", description: "Because my soul exists in perpetual darkness and the UI should match. Also, it's trendy.", notes: "Must synchronize with eternal void in developer hearts" },
    { title: "Refactor the Spaghetti Code Beast", description: "Legacy codebase has evolved into pasta-based organism. Urgently need Italian translator and courage.", notes: "Consider hiring exorcist as backup plan" },
    { title: "Fix 99 Little Bugs (Now 127)", description: "Classic tale: 99 bugs in code, patch one down, somehow 127 bugs appear. Mathematics don't apply here.", notes: "Investigating potential bug multiplication algorithm" },
    { title: "Train Rubber Duck Consultant", description: "Our debugging rubber duck needs advanced training in architectural patterns and existential debugging.", notes: "Duck available for morning sessions only, quacks during code reviews" },
    { title: "Optimize Hamster Wheel Algorithm", description: "Current implementation runs like hamster on wheel - lots of activity, zero progress. Upgrade needed.", notes: "Research suggests gerbil-based solution might be faster" },
    { title: "Write Unit Tests for Sanity", description: "Create comprehensive test suite to verify developer sanity remains functional after sprint. Currently failing.", notes: "sanity.isWorking() consistently returns false" },
    { title: "Deploy Production Friday (YOLO Edition)", description: "What could go wrong deploying to production on Friday afternoon? (Everything. Everything could go wrong.)", notes: "Emergency contacts: therapist, pizza place, energy drink supplier" },
    { title: "Create AI Lunch Ordering System", description: "ML model to predict lunch preferences based on commit messages and stress levels. Training data: 80% pizza.", notes: "Model keeps suggesting coffee regardless of input" },
    { title: "Solve World Hunger with CSS", description: "Challenge accepted: Using CSS to solve actual problems beyond centering divs. Starting ambitious.", notes: "Current solution: display: flex; justify-content: feed-everyone;" },
    { title: "Build Time Machine for Deadlines", description: "Since meeting deadlines proves difficult, we'll just travel back in time. Simple temporal mechanics.", notes: "Potential paradoxes are Future Me's problem" },
    { title: "Teach Client Internet vs WiFi", description: "Educational mission: Internet ≠ WiFi. Requires patience of saint and visual aids suitable for all ages.", notes: "Bring coloring books and simple analogies" },
    { title: "Implement Procrastination Prevention", description: "Build feature preventing developers from browsing memes during work. Ironically delayed by meme browsing.", notes: "Will definitely start tomorrow... or next week" },
    { title: "Document Everything (Good Luck)", description: "Create comprehensive documentation for codebase. Difficulty: Understanding what the code actually does.", notes: "Most comments currently read 'TODO: Figure out what this does'" },
    { title: "Migrate Database to Actual Cloud", description: "Customer wants data 'in cloud', so attaching hard drives to weather balloons. Modern problems, modern solutions.", notes: "Weather forecast critical for uptime SLA" },
    { title: "Design Client Dream Feature", description: "Build feature client described as 'like Facebook but different, and also Uber but for cats'.", notes: "Requirements gathering revealed they actually want a button" },
    { title: "Implement Infinite Scroll Todo List", description: "Since todo list grows infinitely anyway, embrace it with proper infinite scroll UI.", notes: "Meta: This task will be added to infinite todo list" },
    { title: "Security Audit the Office Plant", description: "Comprehensive security review revealed office plant has concerning access to WiFi. Investigation needed.", notes: "Plant refuses to comment on allegations" },
    { title: "Optimize Meeting Duration Algorithm", description: "ML model to predict optimal meeting length. Current average: 2x longer than necessary.", notes: "Model suggests all meetings could be emails" },
    { title: "Create Emergency Response Protocol", description: "Establish procedures for critical incidents: server crashes, coffee shortages, and Friday deployments.", notes: "Protocol step 1: Don't panic. Step 2: Panic appropriately" }
  ]
};

// =====================
// Deterministic Helpers
// =====================
function getDeterministicDeadline(offsetDays) {
  const now = new Date();
  return new Date(now.getTime() + offsetDays * 24 * 60 * 60 * 1000).toISOString();
}

function pick(array, index) {
  return array[index % array.length];
}

function getDeterministicTeamMembers(index, teamSize, excludeId = null) {
  const candidates = excludeId 
    ? ALL_USERS.filter(u => u._id !== excludeId)
    : ALL_USERS;
  
  const startIndex = index % candidates.length;
  const selected = [];
  
  for (let i = 0; i < teamSize; i++) {
    const memberIndex = (startIndex + i) % candidates.length;
    selected.push(candidates[memberIndex]._id);
  }
  
  return selected;
}

function getDeterministicCreator(index, managersOnly = false) {
  const pool = managersOnly ? ALL_CREATORS : ALL_USERS;
  return pick(pool, index)._id;
}

function getDeterministicReminders(index) {
  // 60% use default, 40% use custom
  if (index % 10 < 6) {
    return DEFAULT_REMINDERS;
  }
  
  // Custom variations
  const customs = [
    [1440, 720], // 1d, 12h
    [2880, 1440, 60], // 2d, 1d, 1h
    [10080], // 7d only
    [4320, 1440], // 3d, 1d
    []  // No reminders
  ];
  
  return customs[index % customs.length];
}

function shouldHaveAttachments(index, creatorId) {
  // Check if creator is ledro or leandro
  const isLedroOrLeandro = creatorId === "68d11bc98e4f31d1ac5b5196" || // ledroburner123
                           creatorId === "68d105001122a3d207eacebc";   // leandroakk
  
  if (isLedroOrLeandro) {
    // 55% chance for ledro and leandro
    // Use modulo 20: indices 0-10 = 11/20 = 55%
    return (index % 20) < 11;
  } else {
    // 40% chance for others
    // Use modulo 10: indices 0-3 = 4/10 = 40%
    return (index % 10) < 4;
  }
}

function getDeterministicAttachments(index, creatorId) {
  if (!shouldHaveAttachments(index, creatorId)) return undefined;
  
  const numFiles = (index % 3) + 1; // 1-3 files
  return availableFiles.slice(0, numFiles).map(createFileFromPath);
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
  const types = {
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.pdf': 'application/pdf'
  };
  return types[ext] || 'application/octet-stream';
}

function getDummyContent(filename) {
  const contents = {
    'bug_report.txt': 'Bug Report: Coffee machine API returning 418 status\nSteps: 1. Be tired 2. Need coffee 3. Push button 4. Receive error 5. Cry',
    'meeting_notes.md': '# Meeting Notes\n\n## Attendees\n- Me (regrettably)\n- Rubber Duck (most valuable contributor)\n\n## Action Items\n- [ ] Fix everything\n- [ ] Order emergency coffee supplies',
    'requirements.txt': 'Requirements:\n1. Must work perfectly\n2. Must work instantly\n3. Must work yesterday\n4. Budget: $0\n5. Timeline: Already late',
    'design_mockup.json': '{"design": "pixel perfect", "reality": "barely functional", "client_expectations": "unrealistic", "developer_sanity": "declining"}',
    'code_review.md': '# Code Review\n\n## Feedback\n- Found the bug hiding in callback hell\n- This function needs renaming to "PrayAndHope()"\n- Consider adding comments explaining black magic used here'
  };
  return contents[filename] || `Dummy content for ${filename}`;
}

// =====================
// API Helpers
// =====================
async function clearExistingData() {
  console.log('🗑️  Clearing existing data...\n');
  
  try {
    // Clear tasks first (they reference projects)
    const tasks = await axios.get(TASKS_ENDPOINT);
    for (const task of tasks.data) {
      await axios.delete(`${TASKS_ENDPOINT}/${task._id}`);
    }
    console.log(`✅ Cleared ${tasks.data.length} tasks`);
  } catch (error) {
    console.log('ℹ️  No existing tasks to clear');
  }
  
  try {
    // Clear projects
    const projects = await axios.get(PROJECTS_ENDPOINT);
    for (const project of projects.data) {
      await axios.delete(`${PROJECTS_ENDPOINT}/${project._id}`);
    }
    console.log(`✅ Cleared ${projects.data.length} projects`);
  } catch (error) {
    console.log('ℹ️  No existing projects to clear');
  }
  
  console.log('');
}

async function createProject(projectData) {
  const response = await axios.post(PROJECTS_ENDPOINT, projectData);
  return response.data;
}

async function createTask(taskData) {
  const formData = new FormData();
  
  // Append fields
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
  
  // Append files
  if (taskData.attachments) {
    taskData.attachments.forEach(file => {
      formData.append('attachments', file.buffer, {
        filename: file.filename,
        contentType: file.mimetype
      });
    });
  }
  
  const response = await axios.post(TASKS_ENDPOINT, formData, {
    headers: formData.getHeaders()
  });
  return response.data;
}

// =====================
// Main Generation
// =====================
async function generateProjectsAndTasks() {
  console.log('🚀 Starting project and task generation...\n');
  
  const now = new Date();
  const createdProjects = [];
  let totalTasks = 0;
  let taskIndex = 0;
  
  // Create projects
  console.log('📁 Creating 15 projects...\n');
  
  for (let i = 0; i < projectTemplates.length; i++) {
    const template = projectTemplates[i];
    
    try {
      const projectData = {
        name: template.name,
        description: template.description,
        department: template.departments,
        deadline: getDeterministicDeadline(template.deadlineOffset),
        createdBy: getDeterministicCreator(i, true), // Managers/Directors only
        teamMembers: getDeterministicTeamMembers(i, template.teamSize)
      };
      
      const project = await createProject(projectData);
      createdProjects.push(project);
      
      const daysUntil = Math.ceil((new Date(project.deadline) - now) / (1000 * 60 * 60 * 24));
      const status = daysUntil < 0 
        ? `⚠️  ${Math.abs(daysUntil)}d overdue` 
        : `✓ Due in ${daysUntil}d`;
      
      console.log(`✅ ${i + 1}/15 "${project.name}"`);
      console.log(`   ${status} | Team: ${project.teamMembers.length}\n`);
      
      await new Promise(r => setTimeout(r, 50));
    } catch (error) {
      console.log(`❌ ${i + 1}/15 Failed: "${template.name}"\n`);
    }
  }
  
  console.log('─'.repeat(80));
  console.log('📝 Creating tasks for projects...\n');
  
  // Create tasks for each project (1-5 tasks per project)
  for (let i = 0; i < createdProjects.length; i++) {
    const project = createdProjects[i];
    const numTasks = ((i % 5) + 1); // 1-5 tasks deterministically
    
    console.log(`\n📦 Project: "${project.name}" (${numTasks} tasks)`);
    
    for (let t = 0; t < numTasks; t++) {
      const taskTemplate = pick(taskTemplates.generic, taskIndex);
      const creatorId = getDeterministicCreator(taskIndex, false); // All users can create
      
      // Task deadline relative to project deadline (-10 to +5 days from project)
      const projectDeadline = new Date(project.deadline);
      const taskDeadlineOffset = ((taskIndex % 16) - 10); // -10 to +5 days
      const taskDeadline = new Date(projectDeadline.getTime() + taskDeadlineOffset * 24 * 60 * 60 * 1000);
      
      try {
        const taskData = {
          title: taskTemplate.title,
          description: taskTemplate.description,
          notes: taskTemplate.notes,
          assignedProject: project._id,
          assignedTeamMembers: getDeterministicTeamMembers(taskIndex, (taskIndex % 3) + 1, creatorId),
          status: pick(STATUSES, taskIndex),
          priority: pick(PRIORITIES, taskIndex),
          deadline: taskDeadline.toISOString(),
          createdBy: creatorId,
          reminderOffsets: getDeterministicReminders(taskIndex),
          attachments: getDeterministicAttachments(taskIndex, creatorId)
        };
        
        const task = await createTask(taskData);
        totalTasks++;
        
        const attachInfo = taskData.attachments ? ` 📎${taskData.attachments.length}` : '';
        const statusIcon = task.status === 'Done' ? '✅' : task.status === 'In Progress' ? '🔄' : '📋';
        console.log(`  ${statusIcon} "${task.title}"${attachInfo}`);
        
        await new Promise(r => setTimeout(r, 50));
      } catch (error) {
        console.log(`  ❌ Failed: "${taskTemplate.title}"`);
      }
      
      taskIndex++;
    }
  }
  
  // Statistics
  console.log('\n' + '═'.repeat(80));
  console.log('🎉 Generation completed successfully!');
  console.log('═'.repeat(80));
  
  const overdueProjects = createdProjects.filter(p => new Date(p.deadline) < now).length;
  const dueSoonProjects = createdProjects.filter(p => {
    const days = (new Date(p.deadline) - now) / (1000 * 60 * 60 * 24);
    return days >= 0 && days <= 7;
  }).length;
  
  // Count tasks created by ledro and leandro
  let ledroLeandroTasks = 0;
  let otherUserTasks = 0;
  let tasksWithAttachments = 0;
  
  // Note: We approximate based on creation pattern
  for (let i = 0; i < totalTasks; i++) {
    const creatorId = getDeterministicCreator(i, false);
    const isLedroOrLeandro = creatorId === "68d11bc98e4f31d1ac5b5196" || 
                             creatorId === "68d105001122a3d207eacebc";
    
    if (isLedroOrLeandro) {
      ledroLeandroTasks++;
      if (shouldHaveAttachments(i, creatorId)) tasksWithAttachments++;
    } else {
      otherUserTasks++;
      if (shouldHaveAttachments(i, creatorId)) tasksWithAttachments++;
    }
  }
  
  console.log('\n📊 Summary:');
  console.log('─'.repeat(80));
  console.log('Projects:');
  console.log(`  • Total: ${createdProjects.length}`);
  console.log(`  • Overdue: ${overdueProjects}`);
  console.log(`  • Due this week: ${dueSoonProjects}`);
  console.log(`  • Future: ${createdProjects.length - overdueProjects - dueSoonProjects}`);
  console.log('\nTasks:');
  console.log(`  • Total created: ${totalTasks}`);
  console.log(`  • Average per project: ${(totalTasks / createdProjects.length).toFixed(1)}`);
  console.log(`  • With attachments: ${tasksWithAttachments} (~${Math.round(tasksWithAttachments/totalTasks*100)}%)`);
  console.log(`  • Created by Ledro/Leandro: ${ledroLeandroTasks} (${Math.round(ledroLeandroTasks/totalTasks*100)}% with ~55% attachment rate)`);
  console.log(`  • Created by others: ${otherUserTasks} (${Math.round(otherUserTasks/totalTasks*100)}% with ~40% attachment rate)`);
  console.log('\nCoverage:');
  console.log(`  • All 7 departments represented`);
  console.log(`  • Team sizes: 1-4 members`);
  console.log(`  • Mixed deadlines: overdue, urgent, future`);
  console.log(`  • Varied task statuses and priorities`);
}

async function verifyConnection() {
  try {
    console.log('🔍 Verifying API connection...');
    await axios.get(PROJECTS_ENDPOINT);
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
  console.log('═'.repeat(80));
  console.log('🎭 PROJECT & TASK DATABASE SEEDER 🎭');
  console.log('═'.repeat(80));
  console.log('\n');
  
  const isConnected = await verifyConnection();
  if (!isConnected) process.exit(1);
  
  await clearExistingData();
  await generateProjectsAndTasks();
  
  console.log('\n✨ All done! Your database is ready for testing.\n');
}

if (require.main === module) {
  main().catch(error => {
    console.error('\n💥 Fatal error:', error.message);
    process.exit(1);
  });
}

module.exports = { generateProjectsAndTasks, clearExistingData };