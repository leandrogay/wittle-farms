# Smart Task Manager and Productivity System (G1T5)

This document serves as the README providing an overview of Little Farm’s Smart Task Manager and Productivity System, including its purpose, core capabilities, and instructions for running the application. It serves as a reference for developers, maintainers, and contributors who interact with the system.

**GitHub Link:** https://github.com/leandrogay/wittle-farms

---

## About the Project

The Smart Task Manager and Productivity Systems aim to streamline personal and team productivity by offering an integrated platform for task creation, organisation, tracking, and report generation. Designed with usability and efficiency in mind, the system consolidates essential productivity functions into a single application.

It incorporates six core feature pillars:

- **User Authorisation and Authentication** – Ensures secure access and personalised sessions.  
- **Task Management** – Enables users to create, update, manage, and complete tasks efficiently.  
- **Task Grouping and Organisation** – Supports categorisation through projects, status, deadlines, and prioritisation to keep workflow structured.  
- **Deadlines and Schedule Tracking** – Provides visibility into due dates, progress, and upcoming deadlines.  
- **Notification System (In-App & Email)** – Sends reminders and updates to keep users aware of important deadlines or events.  
- **Report Generation and Exporting** – Produces summaries and insights to support reflection, planning, and accountability.

---

## Tech Stack

### Frontend
- **React + Vite** – Powers a fast, responsive, and modern user interface.  
- **JavaScript** – Handles client-side logic, state changes, and real-time interactions.

### Backend
- **Node.js** – Forms the core server runtime environment for backend logic and APIs.  
- **Express** – Manages API routing and server-side functionality.  
- **Mongoose** – Provides a robust ODM layer for database operations.

### Database
- **MongoDB** – NoSQL flexible data storage for JSON-like documents.

---

## Pre-Requisites

Before running the application, ensure that the following software is installed on your system.

### Secrets.env
The application requires some environment variables to be set from the `secrets.env` file provided in the drive.  
Please ensure that the `secrets.env` file is placed in the `/backend/config/` directory.

### Node.js
The application requires Node.js to run both the frontend and backend.

Node.js provides the runtime environment necessary to execute JavaScript outside the browser and to manage project dependencies.

- **Recommended Version:** Node.js 22+  
- **Download Link:** https://nodejs.org  
- **Verify Installation:**
  ```
  node -v
  npm -v
  ```

---

## Running the Application

### Serving the Frontend
Open your terminal and navigate to the frontend directory:
```
cd frontend
```

Install dependencies:
```
npm install
```

Serve the frontend:
```
npm run dev
```

### Serving the Backend
Open your terminal and navigate to the backend directory:
```
cd backend
```

Install dependencies:
```
npm install
```

Serve the backend:
```
npm run dev
```

---

## Running Backend Tests

Open your terminal and navigate to the backend directory:
```
cd backend
```

Install dependencies:
```
npm install
```

Run the tests:
```
npx vitest run --coverage --config ./config/vitest.config.js
```

---

## Contributors (G1T5)

- Leandro Gay  
- Sunkari Saraswati Neeharika  
- Tan Kwang Wei  
- Jamie Tan Jia Hui  
- Muhammad Imran Ashry Bin Azhari
