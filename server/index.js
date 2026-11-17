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

// ── Subdomain Brand / Tenant Extractor ──
function getSubdomainBrand(host) {
  if (!host) return null;
  const h = String(host).toLowerCase().split(':')[0]; // strip port if any
  if (h.startsWith('new-visayas.') || h.startsWith('newvisayas.')) {
    return 'new-visayas';
  }
  if (h.startsWith('manay.')) {
    return 'manay';
  }
  return null;
}

// ── Subdomain Routing & Tenant Prepending Middleware ──
// When accessed via manay.resqtrack.online or new-visayas.resqtrack.online:
// 1. Pass x-tenant-version / x-barangay-version header
// 2. Prepend /${brand} internally so existing /:barangay routes and APIs work seamlessly
app.use((req, res, next) => {
  const host = req.headers['x-forwarded-host'] || req.headers.host || req.hostname;
  const brand = getSubdomainBrand(host);
  if (brand) {
    req.headers['x-tenant-version'] = brand;
    req.headers['x-barangay-version'] = brand;
    req.tenantVersion = brand;

    const url = req.url;
    // Don't rewrite socket.io or paths that already specify a tenant
    if (
      !url.startsWith('/socket.io') &&
      !url.startsWith('/manay') &&
      !url.startsWith('/new-visayas')
    ) {
      if (url === '/' || url === '') {
        req.url = `/${brand}/login`;
      } else {
        req.url = `/${brand}${url.startsWith('/') ? '' : '/'}${url}`;
      }
    }
  }
  next();
});

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/:barangay(manay|new-visayas)/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/:barangay(manay|new-visayas)/*/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve client assets (css, images, js)
app.use(express.static(path.join(__dirname, '../client')));
app.use('/client', express.static(path.join(__dirname, '../client')));
app.use('/public', express.static(path.join(__dirname, '../client/public')));
app.use('/js', express.static(path.join(__dirname, '../client/js')));
app.use('/:barangay(manay|new-visayas)/client', express.static(path.join(__dirname, '../client')));
app.use('/:barangay(manay|new-visayas)/public', express.static(path.join(__dirname, '../client/public')));
app.use('/:barangay(manay|new-visayas)/js', express.static(path.join(__dirname, '../client/js')));
app.use('/:barangay(manay|new-visayas)/*/public', express.static(path.join(__dirname, '../client/public')));
app.use('/:barangay(manay|new-visayas)/*/js', express.static(path.join(__dirname, '../client/js')));

// API routes router with tenant middleware
const apiRouter = express.Router();
apiRouter.use(tenantMiddleware);
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

// Mount API on /api and /:barangay/api
app.use('/api', apiRouter);
app.use('/:barangay(manay|new-visayas)/api', (req, res, next) => {
  req.tenantVersion = req.params.barangay;
  next();
}, apiRouter);

// ── Smart dashboard dispatcher ──
// Checks window.location.hostname first before falling back to the URL path
const DASHBOARD_DISPATCHER = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Redirecting — ResQTrack</title></head>
<body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc; color: #475569;">
  <p>Loading dashboard…</p>
  <script>
    (function() {
      var host = (window.location.hostname || '').toLowerCase();
      var b = null;
      if (host.indexOf('new-visayas') !== -1 || host.indexOf('newvisayas') !== -1) {
        b = 'new-visayas';
      } else if (host.indexOf('manay') !== -1) {
        b = 'manay';
      }
      if (!b) {
        var segs = window.location.pathname.split('/').filter(Boolean);
        b = (segs[0] === 'new-visayas') ? 'new-visayas' : 'manay';
      }

      var isSubdomain = host.indexOf('new-visayas.') !== -1 || host.indexOf('newvisayas.') !== -1 || host.indexOf('manay.') !== -1;
      var prefix = isSubdomain ? '' : '/' + b;

      try {
        var user = JSON.parse(localStorage.getItem('user'));
        var token = localStorage.getItem('accessToken');
        if (!token || !user) {
          window.location.replace(prefix + '/login');
        } else if (user.version && user.version !== b) {
          window.location.replace(prefix + '/login?error=cross_tenant');
        } else if (user.role === 'admin') {
          window.location.replace(prefix + '/admin/dashboard');
        } else if (user.role === 'responder') {
          window.location.replace(prefix + '/responder/dashboard');
        } else {
          window.location.replace(prefix + '/client/home');
        }
      } catch (e) {
        window.location.replace(prefix + '/login');
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

// Root → redirect to /manay/login (for bare non-subdomain host)
app.get('/', (_req, res) => {
  res.redirect('/manay/login');
});

// 404 for unknown API routes
app.use(['/api/*', '/:barangay(manay|new-visayas)/api/*'], (_req, res) => {
  res.status(404).json({ message: 'API route not found' });
});

// Catch-all fallback
app.get('*', (req, res) => {
  const brand = getSubdomainBrand(req.headers.host || req.hostname);
  if (brand) {
    return res.redirect(`/${brand}/login`);
  }
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
