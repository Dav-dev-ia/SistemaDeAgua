module.paths.unshift(require('path').join(__dirname, '..', 'api', 'node_modules'));
require('dotenv').config({ path: require('path').join(__dirname, '..', 'api', '.env') });
const prisma = require('../api/prisma');

const BASE = process.env.BASE_URL || 'http://localhost:5000';

let passed = 0;
let failed = 0;

function check(name, ok, detail = '') {
  const label = ok ? 'PASS' : 'FAIL';
  console.log(`  [${label}] ${name}${detail ? ` — ${detail}` : ''}`);
  if (ok) passed++;
  else failed++;
}

async function req(method, path, { token, body, expected } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  if (expected !== undefined && res.status !== expected) {
    throw new Error(`HTTP ${res.status} (esperado ${expected}) en ${method} ${path}: ${text.slice(0, 200)}`);
  }
  return { status: res.status, data };
}

async function main() {
  console.log(`\n=== TEST DE INTEGRACIÓN API — ${BASE} ===\n`);

  // Sanidad
  const health = await req('GET', '/api/health', { expected: 200 });
  check('GET /api/health → 200', health.data.ok === true, `database=${health.data.database}`);

  const adminLogin = await req('POST', '/api/auth/login', {
    body: { username: 'admin', password: 'admin123' }, expected: 200,
  });
  check('login admin → 200', adminLogin.data.user?.role === 'ADMIN');
  const adminToken = adminLogin.data.access_token;

  await req('POST', '/api/auth/login', {
    body: { username: 'admin', password: 'password-incorrecta' }, expected: 401,
  });
  check('login contraseña incorrecta → 401', true, '');

  const juanLogin = await req('POST', '/api/auth/login', {
    body: { username: 'juan', password: 'juan123' }, expected: 200,
  });
  check('login juan → 200', juanLogin.data.user?.role === 'OWNER');
  const juanToken = juanLogin.data.access_token;

  // Permisos
  await req('GET', '/api/admin/dashboard', { token: juanToken, expected: 403 });
  check('juan accede a admin → 403', true, 'rol OWNER bloqueado');

  await req('GET', '/api/admin/dashboard', { expected: 401 });
  check('admin sin token → 401', true, '');

  const adminOwner = await req('GET', '/api/owner/dashboard', { token: adminToken, expected: 400 });
  check('admin sin dpto en owner/dashboard → 400', /departamento/.test(adminOwner.data.message || ''), 'rol ADMIN válido pero sin dpto asignado');
  await req('GET', '/api/owner/dashboard', { token: juanToken, expected: 200 });
  check('juan accede a owner dashboard → 200', true, '');

  const adminDash = await req('GET', '/api/admin/dashboard', { token: adminToken, expected: 200 });
  check('GET /api/admin/dashboard → 200', typeof adminDash.data.stats?.total_apartments === 'number', '');

  const profile = await req('GET', '/api/auth/profile', { token: adminToken, expected: 200 });
  check('GET /api/auth/profile → 200', profile.data.user?.username === 'admin', '');

  // ─── Flujo registro → pendiente → activación → login ───────────────────────
  const testApt = await prisma.apartment.create({
    data: { block: 'T', number: '99', ownerName: 'Testing Temp', coefficient: 1, meters: { create: { code: 'TT-99' } } },
    include: { meters: true },
  });
  console.log('  · departamento de prueba creado: T-99');

  try {
    const reg = await req('POST', '/api/auth/register', {
      body: { username: 'tmp_test', full_name: 'Test Temporal', password: 'tmp123', block: 'T', number: '99' },
      expected: 201,
    });
    check('registro público → 201', reg.data.user?.is_active === false, 'cuenta creada inactiva');

    const pendingLogin = await req('POST', '/api/auth/login', {
      body: { username: 'tmp_test', password: 'tmp123' }, expected: 403,
    });
    check('login cuenta pendiente → 403', /pendiente/.test(pendingLogin.data.message || ''), pendingLogin.data.message);

    const users = await req('GET', '/api/admin/users', { token: adminToken, expected: 200 });
    const tmpUser = users.data.items.find((u) => u.username === 'tmp_test');
    check('admin lista usuarios → incluye tmp_test', !!tmpUser, `id=${tmpUser?.id}`);

    await req('PATCH', `/api/admin/users/${tmpUser.id}`, {
      token: adminToken, body: { is_active: true }, expected: 200,
    });
    check('admin activa usuario → 200', true, '');

    const activeLogin = await req('POST', '/api/auth/login', {
      body: { username: 'tmp_test', password: 'tmp123' }, expected: 200,
    });
    check('login tras activación → 200', activeLogin.data.user?.is_active === true, '');

    await req('PATCH', `/api/admin/users/${tmpUser.id}`, {
      token: adminToken, body: { is_active: false }, expected: 200,
    });
    const deactivatedLogin = await req('POST', '/api/auth/login', {
      body: { username: 'tmp_test', password: 'tmp123' }, expected: 403,
    });
    check('login tras desactivación → 403', true, '');

    await req('PATCH', `/api/admin/users/${tmpUser.id}`, {
      token: adminToken, body: { is_active: true }, expected: 200,
    });
  } finally {
    await prisma.user.deleteMany({ where: { apartmentId: testApt.id } });
    await prisma.meter.deleteMany({ where: { apartmentId: testApt.id } });
    await prisma.apartment.deleteMany({ where: { id: testApt.id } });
  }
  console.log('  · datos de prueba de usuarios limpiados');

  // ─── Flujo periodo → lecturas → liquidación → pagos ─────────────────────────
  const periodCode = `TEST-${Date.now()}`;
  const created = await req('POST', '/api/admin/periods', {
    token: adminToken,
    body: {
      code: periodCode,
      common_amount: '1000',
      general_total_consumption_m3: '120',
      price_per_m3: '7.5',
    },
    expected: 201,
  });
  check('crear periodo → 201', created.data.period?.code === periodCode, `status=${created.data.period?.status}`);

  const apartments = await req('GET', '/api/admin/apartments', { token: adminToken, expected: 200 });
  const apt202 = apartments.data.items.find((a) => a.block === '2' && a.number === '202');
  check('existe departamento 2-202', !!apt202, `meterCode=${apt202?.meter?.code}`);

  const readingsRes = await req('POST', `/api/admin/periods/${created.data.period.id}/readings`, {
    token: adminToken,
    body: { readings: [{ apartment_id: apt202.id, previous_reading: 100, current_reading: 120 }] },
    expected: 200,
  });
  check('guardar lecturas → 200', (readingsRes.data.saved?.length || 0) === 1, `saved=${readingsRes.data.saved?.length}`);

  const settle = await req('POST', `/api/admin/periods/${created.data.period.id}/settle`, {
    token: adminToken, expected: 200,
  });
  const settleMsg = settle.data.message || '';
  const sum = settle.data.allocations?.reduce((s, a) => s + a.amount_due_bs, 0);
  check('liquidar periodo → 200', sum !== undefined && Math.abs(sum - 1000) < 0.01, `Σ=Bs ${sum} (factura 1000)`);
  check('liquidación genera asignación PENDIENTE', (settle.data.allocations || []).some((a) => a.status === 'PENDIENTE'), '');
  check('desglose con base_bs', (settle.data.allocations || []).every((a) => typeof a.breakdown?.base_bs === 'number'), '');

  const periodId = created.data.period.id;
  const allocations = await req('GET', `/api/admin/periods/${periodId}/allocations`, { token: adminToken, expected: 200 });
  const alloc = allocations.data.items.find((a) => a.apartment?.block === '2' && a.apartment?.number === '202');
  check('consultar asignaciones → hay para 2-202', !!alloc, `monto=Bs ${alloc?.amount_due_bs ?? '-'}`);

  try {
    const badPayment = await req('POST', `/api/admin/allocations/${alloc.id}/payments`, {
      token: adminToken,
      body: { amount_bs: '99999', payment_method: 'EFECTIVO' },
      expected: 400,
    });
    check('pago mayor al adeudado → 400', /pendiente/.test(badPayment.data.message || ''), 'monto validado');
  } catch (e) { check('pago mayor al adeudado → 400', false, e.message); }

  const pay = await req('POST', `/api/admin/allocations/${alloc.id}/payments`, {
    token: adminToken,
    body: { amount_bs: String(alloc.amount_due_bs), payment_method: 'TRANSFERENCIA', reference: 'TEST-REF' },
    expected: 200,
  });
  check('registrar pago completo → 200', pay.data.allocation?.status === 'PAGADO', `estado=${pay.data.allocation?.status}`);

  const resettle = await req('POST', `/api/admin/periods/${periodId}/settle`, {
    token: adminToken, expected: 400,
  });
  check('reliquidar con pagos → 400', /pagos/.test(resettle.data.message || ''), 'historico protegido');

  // Owner dashboard y pagos
  const ownerDash = await req('GET', '/api/owner/dashboard', { token: juanToken, expected: 200 });
  const dashAlloc = ownerDash.data.allocations?.find((a) => String(a.period_id) === String(periodId));
  check('owner dashboard ve periodo', !!dashAlloc, `deuda=Bs ${dashAlloc?.amount_due_bs}`);

  const ownerPay = await req('GET', '/api/owner/payments', { token: juanToken, expected: 200 });
  const paySeen = (ownerPay.data.payments || []).some((p) => p.reference === 'TEST-REF');
  check('owner historial incluye pago TEST-REF', paySeen, '');

  // ─── Registro con departamento ocupado → 400 ────────────────────────────────
  const dupReg = await req('POST', '/api/auth/register', {
    body: { username: 'tmp_takeover', full_name: 'X', password: 'tmp123', block: '2', number: '202' },
    expected: 400,
  });
  check('registro de dpto ocupado → 400', /registrado/.test(dupReg.data.message || ''), 'sin takeover');

  // Limpieza del periodo de prueba
  await prisma.payment.deleteMany({ where: { allocation: { periodId } } });
  await prisma.allocation.deleteMany({ where: { periodId } });
  await prisma.reading.deleteMany({ where: { periodId } });
  await prisma.billingPeriod.deleteMany({ where: { id: periodId } });
  console.log('  · datos de prueba del periodo limpiados');

  console.log(`\n=== RESUMEN: ${passed} PASS / ${failed} FAIL ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('\n[ERROR FATAL]', err.message);
  process.exit(1);
});