/**
 * SCRIPT: verify-deploy.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifica que el sistema AguaPago funcione correctamente en producción.
 * Prueba: health check, ping, login admin.
 *
 * Uso:
 *   node scripts/verify-deploy.js
 *   node scripts/verify-deploy.js https://tu-url-custom.vercel.app
 * ─────────────────────────────────────────────────────────────────────────────
 */
require('dotenv').config();

const BASE_URL = process.argv[2] || 'https://proyectoagua2.vercel.app';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin2026!';

async function fetchJSON(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    try {
      return { status: res.status, data: JSON.parse(text) };
    } catch {
      return { status: res.status, data: { raw: text.substring(0, 200) } };
    }
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  console.log('\n========================================');
  console.log('  VERIFICACIÓN DE DEPLOY - AguaPago');
  console.log('  URL:', BASE_URL);
  console.log('========================================\n');

  let allPassed = true;

  // 1. Ping
  console.log('--- 1. Ping ---');
  try {
    const start = Date.now();
    const { status, data } = await fetchJSON(`${BASE_URL}/api/ping`);
    const elapsed = Date.now() - start;
    if (status === 200 && data.ok) {
      console.log(`✅ Ping OK (${elapsed}ms)`);
    } else {
      console.log(`❌ Ping falló: status=${status}`, data);
      allPassed = false;
    }
  } catch (err) {
    console.log('❌ Ping error:', err.message);
    allPassed = false;
  }

  // 2. Health check
  console.log('\n--- 2. Health Check ---');
  try {
    const start = Date.now();
    const { status, data } = await fetchJSON(`${BASE_URL}/api/health`);
    const elapsed = Date.now() - start;
    if (status === 200 && data.ok) {
      console.log(`✅ Health OK (${elapsed}ms)`);
      console.log('   DB:', data.database || 'no reportado');
      console.log('   JWT env:', data.env?.jwt ? '✅' : '❌ FALTA JWT_SECRET_KEY');
      console.log('   DB env:', data.env?.database ? '✅' : '❌ FALTA DATABASE_URL');
      if (!data.env?.jwt || !data.env?.database) allPassed = false;
    } else {
      console.log(`❌ Health falló: status=${status}`, data);
      allPassed = false;
    }
  } catch (err) {
    console.log('❌ Health error:', err.message);
    allPassed = false;
  }

  // 3. Login admin
  console.log('\n--- 3. Login Admin ---');
  try {
    const start = Date.now();
    const { status, data } = await fetchJSON(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: ADMIN_PASSWORD })
    });
    const elapsed = Date.now() - start;
    if (status === 200 && data.ok) {
      console.log(`✅ Login admin exitoso (${elapsed}ms)`);
      console.log('   User:', data.user?.username, '| Role:', data.user?.role);
      console.log('   Token generado:', data.access_token ? '✅' : '❌');
    } else {
      console.log(`❌ Login falló: status=${status}`, data);
      if (status === 401) console.log('   ⚠️  Contraseña incorrecta. Ejecuta: node scripts/seed-admin.js --reset');
      if (status === 503) console.log('   ⚠️  BD no disponible. Verifica DATABASE_URL en Vercel env vars.');
      allPassed = false;
    }
  } catch (err) {
    console.log('❌ Login error:', err.message);
    allPassed = false;
  }

  // Resultado final
  console.log('\n========================================');
  if (allPassed) {
    console.log('✅ SISTEMA OPERATIVO - Todo funciona correctamente');
    console.log('\n📋 Credenciales de acceso:');
    console.log('   Usuario:    admin');
    console.log('   Contraseña: ' + ADMIN_PASSWORD);
  } else {
    console.log('❌ SISTEMA CON PROBLEMAS - Revisar los errores arriba');
    console.log('\n🔧 Checklist de Vercel:');
    console.log('   1. DATABASE_URL → Neon pooler URL (con ?sslmode=require)');
    console.log('   2. DIRECT_URL → Neon direct URL (para migraciones)');
    console.log('   3. JWT_SECRET_KEY → clave secreta fuerte');
    console.log('   4. ADMIN_PASSWORD → Admin2026! (o la que quieras)');
  }
  console.log('========================================\n');
}

main().catch((err) => {
  console.error('Error fatal:', err.message);
  process.exit(1);
});
