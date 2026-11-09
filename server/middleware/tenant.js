const VALID_TENANTS = ['manay', 'new-visayas'];

function normalizeTenant(slug) {
  if (!slug) return null;
  const s = String(slug).toLowerCase().trim();
  if (s === 'new-visayas' || s === 'new visayas' || s.includes('visayas')) {
    return 'new-visayas';
  }
  if (s === 'manay' || s.includes('manay')) {
    return 'manay';
  }
  return null;
}

function resolveTenant(req) {
  // 1. If path param :barangay is present:
  if (req.params && req.params.barangay) {
    const t = normalizeTenant(req.params.barangay);
    if (t) return t;
  }

  // 2. If authenticated user has version:
  if (req.user && req.user.version) {
    const t = normalizeTenant(req.user.version);
    if (t) return t;
  }

  // 3. Header X-Barangay-Version or X-Tenant:
  const header = req.headers['x-barangay-version'] || req.headers['x-tenant'];
  if (header) {
    const t = normalizeTenant(header);
    if (t) return t;
  }

  // 4. Query param ?version= or ?barangay=:
  if (req.query) {
    if (req.query.version) {
      const t = normalizeTenant(req.query.version);
      if (t) return t;
    }
    if (req.query.barangay) {
      const t = normalizeTenant(req.query.barangay);
      if (t) return t;
    }
  }

  // 5. Body version:
  if (req.body && (req.body.version || req.body.barangay)) {
    const t = normalizeTenant(req.body.version || req.body.barangay);
    if (t) return t;
  }

  // 6. Referer header (e.g. /new-visayas/...)
  if (req.headers && req.headers['referer']) {
    try {
      const refPath = new URL(req.headers['referer']).pathname;
      if (refPath.startsWith('/new-visayas')) return 'new-visayas';
      if (refPath.startsWith('/manay')) return 'manay';
    } catch {}
  }

  return 'manay';
}

function tenantMiddleware(req, res, next) {
  const version = resolveTenant(req);
  req.tenantVersion = version;
  req.tenantBarangay = version === 'new-visayas' ? 'Barangay New Visayas' : 'Barangay Manay';
  next();
}

module.exports = {
  VALID_TENANTS,
  normalizeTenant,
  resolveTenant,
  tenantMiddleware,
};

