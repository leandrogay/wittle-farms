import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './swagger.js';

import authRouter from './routes/auth.js';
import userRouter from './routes/users.js';
import tasksRouter from './routes/tasks.js';
import projectRouter from './routes/projects.js';
import departmentRouter from './routes/departments.js';
import calendarRoute from './routes/calendar.js';
import notificationsRouter from './routes/overdue-notifis.js';
import commentsRouter from './routes/comments.js';
import timelineRouter from './routes/timeline.js';
import directorRouter from './routes/director.js';
import seniorManagerRouter from './routes/senior-manager.js';

const app = express();

app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());

// register routes
app.use('/api/calendar', calendarRoute);
app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/projects', projectRouter);
app.use('/api/departments', departmentRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/tasks', commentsRouter);
app.use('/api/timeline', timelineRouter);
app.use('/api/director', directorRouter);
app.use('/api/senior-manager', seniorManagerRouter);
app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

export default app;

