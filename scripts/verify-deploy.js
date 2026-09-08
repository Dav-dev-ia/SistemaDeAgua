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
module.paths.unshift(require('path').join(__dirname, '..', 'api', 'node_modules'));
require('dotenv').config({ path: require('path').join(__dirname, '..', 'api', '.env') });

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
      console.log(`❌ Login admin falló: status=${status}`, data);
      allPassed = false;
    }
  } catch (err) {
    console.log('❌ Login admin error:', err.message);
    allPassed = false;
  }

  // 4. Login Owner
  console.log('\n--- 4. Login Propietario (juan) ---');
  try {
    const start = Date.now();
    const { status, data } = await fetchJSON(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'juan', password: 'Juan2026!' })
    });
    const elapsed = Date.now() - start;
    if (status === 200 && data.ok) {
      console.log(`✅ Login propietario exitoso (${elapsed}ms)`);
      console.log('   User:', data.user?.username, '| Role:', data.user?.role);
    } else {
      console.log(`⚠️ Login propietario no verificado (puede no existir aún en producción): status=${status}`);
    }
  } catch (err) {
    console.log('⚠️ Login propietario error:', err.message);
  }

  // Resultado final
  console.log('\n========================================');
  if (allPassed) {
    console.log('✅ SISTEMA OPERATIVO - Autenticación y Backend OK');
    console.log('\n📋 Credenciales para probar:');
    console.log('   👑 ADMIN:');
    console.log('      Usuario:    admin');
    console.log('      Contraseña: ' + ADMIN_PASSWORD);
    console.log('   🏠 PROPIETARIO:');
    console.log('      Usuario:    juan');
    console.log('      Contraseña: Juan2026!');
    console.log('      Bloque / Dpto: Bloque 2 - Dpto 202');
  } else {
    console.log('❌ SISTEMA CON PROBLEMAS - Revisar los errores arriba');
    console.log('\n🔧 Checklist de Vercel:');
    console.log('   1. DATABASE_URL → Neon pooler URL (con ?sslmode=require)');
    console.log('   2. DIRECT_URL → Neon direct URL (para migraciones)');
    console.log('   3. JWT_SECRET_KEY → clave secreta fuerte');
    console.log('   4. ADMIN_PASSWORD → Admin2026!');
  }
  console.log('========================================\n');

}

main().catch((err) => {
  console.error('Error fatal:', err.message);
  process.exit(1);
});
