require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const http       = require('http');
const { Server } = require('socket.io');

const authRoutes         = require('./routes/auth.routes');
const userRoutes         = require('./routes/user.routes');
const adminRoutes        = require('./routes/admin.routes');
const incidentRoutes     = require('./routes/incident.routes');
const responderRoutes    = require('./routes/responder.routes');
const announcementRoutes = require('./routes/announcement.routes');
const reportRoutes       = require('./routes/report.routes');
const setupSockets       = require('./sockets/incidentSocket');
require('./utils/archiver');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

app.set('io', io);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve built Tailwind CSS and all client assets
app.use(express.static(path.join(__dirname, '../client')));

// API routes
app.use('/api/auth',          authRoutes);
app.use('/api/user',          userRoutes);
app.use('/api/admin',         adminRoutes);
app.use('/api/incidents',     incidentRoutes);
app.use('/api/responders',    responderRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/reports',       reportRoutes);

// Root → login
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '../client/pages/shared/login.html'));
});

// 404 for unknown API routes
app.use('/api/*', (_req, res) => res.status(404).json({ message: 'API route not found' }));

// All other requests → login (fallback)
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../client/pages/shared/login.html'));
});

setupSockets(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🚨 ResQTrack server running → http://localhost:${PORT}\n`);
});
