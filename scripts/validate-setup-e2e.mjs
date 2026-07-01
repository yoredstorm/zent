#!/usr/bin/env node
/**
 * Validacion E2E del flujo de instalacion Zent.
 * Uso: node scripts/validate-setup-e2e.mjs [API_BASE]
 */
const API = (process.argv[2] || 'http://localhost:3001/api').replace(/\/$/, '');

const results = [];
let passed = 0;
let failed = 0;

function ok(name, detail = '') {
  passed++;
  results.push({ name, ok: true, detail });
  console.log(`  OK  ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  failed++;
  results.push({ name, ok: false, detail });
  console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
}

async function get(path) {
  const res = await fetch(`${API}${path}`, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function post(path, data) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(data),
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function resetInstallState() {
  // Solo para validacion local: marcar como no instalado via SQL directo no es posible desde aqui.
  // Si ya esta instalado, los tests de install fallaran con 403 — lo reportamos.
}

async function testHealth() {
  const { status, body } = await get('/health');
  if (status === 200 && body?.status === 'ok') ok('GET /api/health');
  else fail('GET /api/health', `status=${status} body=${JSON.stringify(body)}`);
}

async function testSetupStatus() {
  const { status, body } = await get('/setup/status');
  if (status === 200 && typeof body?.installed === 'boolean') {
    ok('GET /api/setup/status', `installed=${body.installed}`);
    return body;
  }
  fail('GET /api/setup/status', `status=${status}`);
  return null;
}

async function testInstallGuard(status) {
  const { status: code, body } = await get('/products');
  if (!status.installed) {
    if (code === 503 && (body?.error === 'NOT_INSTALLED' || body?.message?.includes('no instalado'))) {
      ok('InstallGuard bloquea /api/products (503)');
    } else {
      fail('InstallGuard bloquea /api/products', `expected 503, got ${code}`);
    }
  } else {
    if (code === 401) ok('InstallGuard permite /api/products (401 sin JWT, sistema instalado)');
    else if (code === 200) ok('InstallGuard permite /api/products (200)');
    else fail('InstallGuard post-install', `status=${code}`);
  }
}

async function testCredentials(status) {
  if (status.installed) {
    const { status: code } = await get('/setup/credentials');
    if (code === 403) ok('GET /api/setup/credentials bloqueado post-install (403)');
    else fail('GET /api/setup/credentials post-install', `expected 403, got ${code}`);
    return;
  }
  const { status: code, body } = await get('/setup/credentials');
  if (code === 200 && body?.JWT_SECRET) ok('GET /api/setup/credentials', 'secretos presentes');
  else fail('GET /api/setup/credentials', `status=${code}`);
}

async function testWhatsappEndpoints() {
  const st = await get('/setup/whatsapp/status');
  if (st.status === 200 && st.body?.status) ok('GET /api/setup/whatsapp/status', st.body.status);
  else fail('GET /api/setup/whatsapp/status', `status=${st.status}`);

  const qr = await get('/setup/whatsapp/qr');
  if (qr.status === 200) ok('GET /api/setup/whatsapp/qr');
  else fail('GET /api/setup/whatsapp/qr', `status=${qr.status}`);
}

async function testInstallFlow(status) {
  if (status.installed) {
    console.log('  SKIP instalacion (sistema ya instalado)');
    return null;
  }

  const payload = {
    storeName: 'Tienda E2E Test',
    currency: 'PEN',
    taxRate: 18,
    phoneNumber: '51999999999',
    ownerName: 'Tester',
    adminEmail: `e2e-${Date.now()}@zent.test`,
    adminPassword: 'TestPass123!',
    adminName: 'E2E Admin',
  };

  const { status: startCode, body: startBody } = await post('/setup/install', payload);
  if (startCode === 201 || startCode === 200) {
    if (startBody?.started !== false) ok('POST /api/setup/install');
    else fail('POST /api/setup/install', 'already running');
  } else {
    fail('POST /api/setup/install', `status=${startCode} ${JSON.stringify(startBody)}`);
    return null;
  }

  // SSE stream (timeout 30s)
  const events = await new Promise((resolve) => {
    const collected = [];
    const timeout = setTimeout(() => resolve(collected), 30000);
    fetch(`${API}/setup/install/stream`, { headers: { Accept: 'text/event-stream' } })
      .then(async (res) => {
        const reader = res.body?.getReader();
        if (!reader) {
          clearTimeout(timeout);
          resolve(collected);
          return;
        }
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';
          for (const part of parts) {
            const line = part.split('\n').find((l) => l.startsWith('data:'));
            if (line) {
              try {
                collected.push(JSON.parse(line.slice(5).trim()));
              } catch {
                /* ignore */
              }
            }
          }
          if (collected.some((e) => e.status === 'done' || e.status === 'error')) break;
        }
        clearTimeout(timeout);
        resolve(collected);
      })
      .catch(() => {
        clearTimeout(timeout);
        resolve(collected);
      });
  });

  if (events.length > 0) ok('GET /api/setup/install/stream (SSE)', `${events.length} eventos`);
  else fail('GET /api/setup/install/stream (SSE)', 'sin eventos');

  const done = events.find((e) => e.status === 'done');
  const err = events.find((e) => e.status === 'error');
  if (done) ok('Instalacion completada (SSE done)');
  else if (err) fail('Instalacion SSE', err.message || 'error');
  else fail('Instalacion SSE', 'no llego a done');

  return payload;
}

async function testLoginAfterInstall(payload) {
  if (!payload) return;
  const { status, body } = await post('/auth/login', {
    email: payload.adminEmail,
    password: payload.adminPassword,
  });
  if (status === 201 || status === 200) {
    if (body?.accessToken) ok('POST /api/auth/login post-install', 'token recibido');
    else fail('POST /api/auth/login', 'sin accessToken');
  } else {
    fail('POST /api/auth/login', `status=${status}`);
  }
}

async function testFrontendProxy() {
  const bases = ['http://localhost:3000', 'http://localhost:8080'];
  for (const base of bases) {
    try {
      const res = await fetch(`${base}/api/setup/status`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json();
        ok(`Frontend proxy ${base}/api/setup/status`, `installed=${data.installed}`);
        return;
      }
    } catch {
      /* try next */
    }
  }
  fail('Frontend proxy /api/setup/status', 'ningun puerto respondio (3000/8080)');
}

async function main() {
  console.log(`\n=== Validacion E2E Zent Setup ===`);
  console.log(`API: ${API}\n`);

  await testHealth();
  const status = await testSetupStatus();
  if (!status) {
    console.log(`\n=== Resumen: ${passed} OK, ${failed} FAIL ===\n`);
    process.exit(1);
  }
  await testInstallGuard(status);
  await testCredentials(status);
  await testWhatsappEndpoints();
  const payload = await testInstallFlow(status);
  await testLoginAfterInstall(payload);

  const statusAfter = await get('/setup/status');
  if (statusAfter.body?.installed && statusAfter.body?.storeName) {
    ok('Estado post-install', statusAfter.body.storeName);
  } else if (!status.installed && payload) {
    fail('Estado post-install', JSON.stringify(statusAfter.body));
  }

  await testFrontendProxy();

  console.log(`\n=== Resumen: ${passed} OK, ${failed} FAIL ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
