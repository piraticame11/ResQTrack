const API_BASE = '/api';

async function apiRequest(method, endpoint, data = null, isFormData = false) {
  const token   = localStorage.getItem('accessToken');
  const headers = {};
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (rr.ok) {
        const tokens = await rr.json();
        localStorage.setItem('accessToken',  tokens.accessToken);
        localStorage.setItem('refreshToken', tokens.refreshToken);
        options.headers['Authorization'] = `Bearer ${tokens.accessToken}`;
        res = await fetch(`${API_BASE}${endpoint}`, options);
      } else {
        logout();
        return null;
      }
    } else {
      logout();
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
