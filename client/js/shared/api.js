const API_BASE = '/api';

function getTenantSlugFallback() {
  if (typeof getTenantSlug === 'function') return getTenantSlug();
  const seg = window.location.pathname.split('/').filter(Boolean)[0];
  if (seg === 'new-visayas' || seg === 'manay') return seg;
  try {
    const u = JSON.parse(localStorage.getItem('user'));
    if (u?.version) return u.version;
  } catch {}
  return 'manay';
}

async function apiRequest(method, endpoint, data = null, isFormData = false) {
  const token      = localStorage.getItem('accessToken');
  const tenantSlug = getTenantSlugFallback();
  const headers    = {
    'X-Barangay-Version': tenantSlug,
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!isFormData && data) headers['Content-Type'] = 'application/json';

  const options = { method, headers };
  if (data) options.body = isFormData ? data : JSON.stringify(data);

  let res = await fetch(`${API_BASE}${endpoint}`, options);

  if (res.status === 401) {
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken) {
      const rr = await fetch(`${API_BASE}/auth/refresh-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Barangay-Version': tenantSlug },
        body: JSON.stringify({ refreshToken }),
      });
      if (rr.ok) {
        const tokens = await rr.json();
        localStorage.setItem('accessToken',  tokens.accessToken);
        localStorage.setItem('refreshToken', tokens.refreshToken);
        options.headers['Authorization'] = `Bearer ${tokens.accessToken}`;
        res = await fetch(`${API_BASE}${endpoint}`, options);
      } else {
        if (typeof logout === 'function') logout();
        return null;
      }
    } else {
      if (typeof logout === 'function') logout();
      return null;
    }
  }

  return res;
}

const api = {
  get:      (ep)       => apiRequest('GET',    ep),
  post:     (ep, data) => apiRequest('POST',   ep, data),
  patch:    (ep, data) => apiRequest('PATCH',  ep, data),
  put:      (ep, data) => apiRequest('PUT',    ep, data),
  delete:   (ep)       => apiRequest('DELETE', ep),
  postForm: (ep, fd)   => apiRequest('POST',   ep, fd, true),
};
