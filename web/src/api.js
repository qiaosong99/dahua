function getToken() {
  return sessionStorage.getItem('admin_token') || '';
}

function setToken(t) {
  if (t) sessionStorage.setItem('admin_token', t);
  else sessionStorage.removeItem('admin_token');
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && typeof options.body !== 'string') {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(path, { ...options, headers });
  if (res.status === 401) {
    setToken('');
    if (!path.includes('/login')) {
      location.hash = '#/login';
    }
    throw new Error('登录已过期，请重新登录');
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res;
}

export { getToken, setToken, request };
