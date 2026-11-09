require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const http       = require('http');
const fs         = require('fs');
const { Server } = require('socket.io');

const authRoutes         = require('./routes/auth.routes');
const userRoutes         = require('./routes/user.routes');
const adminRoutes        = require('./routes/admin.routes');
const incidentRoutes     = require('./routes/incident.routes');
const responderRoutes    = require('./routes/responder.routes');
const announcementRoutes = require('./routes/announcement.routes');
const reportRoutes       = require('./routes/report.routes');
const blotterRoutes      = require('./routes/blotter.routes');
const purokRoutes        = require('./routes/purok.routes');
const auditRoutes        = require('./routes/audit.routes');
const smsRoutes          = require('./routes/sms.routes');
const setupSockets       = require('./sockets/incidentSocket');
const { tenantMiddleware, VALID_TENANTS } = require('./middleware/tenant');
require('./utils/archiver');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

app.set('io', io);
global.__resqtrack_io = io;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/:barangay(manay|new-visayas)/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/:barangay(manay|new-visayas)/*/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve client assets (css, images, js)
app.use(express.static(path.join(__dirname, '../client')));
app.use('/client', express.static(path.join(__dirname, '../client')));
app.use('/:barangay(manay|new-visayas)/client', express.static(path.join(__dirname, '../client')));
app.use('/:barangay(manay|new-visayas)/public', express.static(path.join(__dirname, '../client/public')));
app.use('/:barangay(manay|new-visayas)/js', express.static(path.join(__dirname, '../client/js')));
app.use('/:barangay(manay|new-visayas)/*/public', express.static(path.join(__dirname, '../client/public')));
app.use('/:barangay(manay|new-visayas)/*/js', express.static(path.join(__dirname, '../client/js')));

// Tenant middleware on API
app.use('/api', tenantMiddleware);

// API routes
const apiRouter = express.Router();
apiRouter.use('/auth',          authRoutes);
apiRouter.use('/user',          userRoutes);
apiRouter.use('/admin',         adminRoutes);
apiRouter.use('/incidents',     incidentRoutes);
apiRouter.use('/responders',    responderRoutes);
apiRouter.use('/announcements', announcementRoutes);
apiRouter.use('/reports',       reportRoutes);
apiRouter.use('/blotter',       blotterRoutes);
apiRouter.use('/puroks',        purokRoutes);
apiRouter.use('/audit',         auditRoutes);
apiRouter.use('/sms',           smsRoutes);

app.use('/api', apiRouter);

// Also allow /:barangay/api/* requests
app.use('/:barangay(manay|new-visayas)/api', (req, res, next) => {
  req.tenantVersion = req.params.barangay;
  next();
}, apiRouter);

// ── Smart dashboard dispatcher ──
const DASHBOARD_DISPATCHER = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Redirecting — ResQTrack</title></head>
<body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc; color: #475569;">
  <p>Loading dashboard…</p>
  <script>
    (function() {
      var segs = window.location.pathname.split('/').filter(Boolean);
      var b = (segs[0] === 'new-visayas') ? 'new-visayas' : 'manay';
      try {
        var user = JSON.parse(localStorage.getItem('user'));
        var token = localStorage.getItem('accessToken');
        if (!token || !user) {
          window.location.replace('/' + b + '/login');
        } else if (user.version && user.version !== b) {
          window.location.replace('/' + b + '/login?error=cross_tenant');
        } else if (user.role === 'admin') {
          window.location.replace('/' + b + '/admin/dashboard');
        } else if (user.role === 'responder') {
          window.location.replace('/' + b + '/responder/dashboard');
        } else {
          window.location.replace('/' + b + '/client/home');
        }
      } catch (e) {
        window.location.replace('/' + b + '/login');
      }
    })();
  </script>
</body>
</html>`;

// Map of clean paths to file paths
const PAGE_MAP = {
  'login':                  '../client/pages/shared/login.html',
  'register':               '../client/pages/shared/register.html',
  'profile':                '../client/pages/shared/profile.html',

  'admin/dashboard':        '../client/pages/admin/dashboard.html',
  'admin/incidents':        '../client/pages/admin/incidents.html',
  'admin/users':            '../client/pages/admin/users.html',
  'admin/logbook':          '../client/pages/admin/logbook.html',
  'admin/blotter':          '../client/pages/admin/blotter.html',
  'admin/announcements':    '../client/pages/admin/announcements.html',
  'admin/puroks':           '../client/pages/admin/puroks.html',
  'admin/reports':          '../client/pages/admin/reports.html',
  'admin/audit':            '../client/pages/admin/audit.html',

  'responder/dashboard':    '../client/pages/responder/dashboard.html',
  'responder/my-incidents': '../client/pages/responder/my-incidents.html',

  'client/home':            '../client/pages/client/home.html',
  'client/report-incident': '../client/pages/client/report-incident.html',
  'client/my-reports':      '../client/pages/client/my-reports.html',

  // Top-level aliases
  'home':                   '../client/pages/client/home.html',
  'incidents':              '../client/pages/admin/incidents.html',
  'users':                  '../client/pages/admin/users.html',
  'logbook':                '../client/pages/admin/logbook.html',
  'blotter':                '../client/pages/admin/blotter.html',
  'announcements':          '../client/pages/admin/announcements.html',
  'puroks':                 '../client/pages/admin/puroks.html',
  'reports':                '../client/pages/admin/reports.html',
  'audit':                  '../client/pages/admin/audit.html',
  'report-incident':        '../client/pages/client/report-incident.html',
  'my-reports':             '../client/pages/client/my-reports.html',
  'my-incidents':           '../client/pages/responder/my-incidents.html',
};

// Tenant-scoped routing: /:barangay (manay or new-visayas)
app.get('/:barangay(manay|new-visayas)', (req, res) => {
  res.redirect(`/${req.params.barangay}/login`);
});

app.get('/:barangay(manay|new-visayas)/dashboard', (req, res) => {
  res.send(DASHBOARD_DISPATCHER);
});

// Direct support for /:barangay/pages/* (e.g. /manay/pages/admin/dashboard.html)
app.get('/:barangay(manay|new-visayas)/pages/*', (req, res) => {
  const subPath = req.params[0];
  const target = path.join(__dirname, '../client/pages', subPath);
  if (fs.existsSync(target) && fs.statSync(target).isFile()) {
    return res.sendFile(target);
  }
  res.sendFile(path.join(__dirname, '../client/pages/shared/login.html'));
});

// Dynamic route handler for /:barangay/:section/:page or /:barangay/:page
app.get('/:barangay(manay|new-visayas)/*', (req, res) => {
  const route = req.params[0].replace(/\.html$/, '').replace(/^\/+|\/+$/g, '');
  if (PAGE_MAP[route]) {
    return res.sendFile(path.join(__dirname, PAGE_MAP[route]));
  }
  // Fallback to login for that barangay
  res.sendFile(path.join(__dirname, '../client/pages/shared/login.html'));
});

// Root → redirect to /manay/login
app.get('/', (_req, res) => {
  res.redirect('/manay/login');
});

// 404 for unknown API routes
app.use(['/api/*', '/:barangay(manay|new-visayas)/api/*'], (_req, res) => {
  res.status(404).json({ message: 'API route not found' });
});

// Catch-all fallback
app.get('*', (req, res) => {
  // Check if starts with a known tenant
  if (req.path.startsWith('/new-visayas')) {
    return res.redirect('/new-visayas/login');
  }
  res.redirect('/manay/login');
});

setupSockets(io);

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`\n🚨 ResQTrack server running → http://localhost:${PORT}`);
    console.log(`   📍 Barangay Manay       → http://localhost:${PORT}/manay/login`);
    console.log(`   📍 Barangay New Visayas  → http://localhost:${PORT}/new-visayas/login\n`);
  });
}

module.exports = { app, server, io };
