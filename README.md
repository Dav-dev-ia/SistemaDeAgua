# Sistema de Gestión de Agua de Condominio (AguaPago)

Aplicación full-stack para la gestión de consumos, facturación y cobros de un condominio.

1. **Frontend**: React (Vite) + React Router + Chart.js + Axios
2. **Backend**: API Node.js (Express) + Prisma (PostgreSQL)
3. **Base de datos**: PostgreSQL (Neon, plan free tier)

> Publicación: <https://cobro-agua.vercel.app>

---

## Arquitectura

```
├─ api/                  → Backend consolidado (serverless en Vercel)
│  ├─ index.js           → Express: rutas, middlewares de auth, CORS, rate-limit, health/ping
│  ├─ controllers.js     → Lógica de negocio (auth, admin, owner)
│  ├─ prisma.js          → Cliente Prisma singleton + withRetry + transformers
│  ├─ calc.js            → Lógica pura de facturación (testable)
│  ├─ package.json       → Dependencias del backend (vercel-build = prisma generate)
│  └─ prisma/schema.prisma → Modelo de datos
├─ src/                  → Frontend React
│  ├─ pages/             → Login, Registro, admin/ (Dashboard, Apartments, Periods, Collections, Users), owner/OwnerDashboard
│  ├─ components/        → Layout, Navbar, Sidebar, Modal (accesible)
│  ├─ context/           → AuthContext, ThemeContext, ToastContext
│  ├─ api/client.js      → Cliente Axios (JWT + retry ante cold starts de Neon)
│  └─ routes/            → AppRoutes, ProtectedRoute
├─ scripts/              → Utilidades de administración y pruebas (CommonJS)
└─ vercel.json           → Rewrites, headers, función serverless única
```

### Nota sobre funciones serverless de Vercel (límite Hobby = 12)

Vercel convierte **cada** `.js` dentro de `api/` en una función serverless, y el plan Hobby
tiene un máximo de 12. Por eso:

- Todo el backend vive en **4 archivos**: `index.js`, `controllers.js`, `prisma.js`, `calc.js`.
- Los scripts de administración **no** viven en `api/` sino en `scripts/`.
- `scripts/package.json` fija `"type": "commonjs"` porque la raíz del repo es `"type": "module"`.

---

## Arranque local

### Backend (Terminal 1)

```bash
cd api
npm install
```

Copia `api/.env.example` a `api/.env` y configura:

| Variable        | Descripción                                                      |
|-----------------|------------------------------------------------------------------|
| `DATABASE_URL`  | URL de conexión *pooled* de Neon                                 |
| `DIRECT_URL`    | URL de conexión directa de Neon (para prisma / migraciones)      |
| `JWT_SECRET_KEY`| Secreto para firmar los JWT (8 horas de validez)                 |
| `BOOTSTRAP_KEY` | Clave maestra para crear la cuenta admin (endpoint bootstrap)    |
| `CORS_ORIGINS`  | Orígenes extra permitidos (comma-separated), opcional            |

```bash
# Genera el cliente Prisma desde api/prisma/schema.prisma
cd api && npx prisma generate

# Sincroniza el esquema con la BD (solo primera vez / tras cambios de schema)
npx prisma db push

# Levanta el backend
npm run dev   # → http://localhost:5000
```

### Crear el administrador inicial

Ya no existe contraseña maestra hardcodeada. Con `BOOTSTRAP_KEY` configurada:

```bash
curl -X POST http://localhost:5000/api/auth/bootstrap-admin \
  -H "Content-Type: application/json" \
  -d '{
    "bootstrap_key": "<tu-BOOTSTRAP_KEY>",
    "username": "admin",
    "full_name": "Administrador General",
    "password": "una-clave-fuerte"
  }'
```

Si ya existe un admin, el endpoint responde `400`. El endpoint responde `503` si `BOOTSTRAP_KEY`
no está definida en el servidor.

### Frontend (Terminal 2)

```bash
npm install
npm run dev    # → http://localhost:5173 (Vite hace proxy de /api → localhost:5000)
```

---

## Modelo de datos

Modelo en `api/prisma/schema.prisma` (PostgreSQL → Neon):

- **users** — rol (`ADMIN`/`OWNER`), `isActive` (los registros por autoservicio nacen **inactivos** hasta que el admin los activa), `lastLoginAt`.
- **apartments** — bloque, número, propietario, teléfono, **coeficiente** de medidor, activo.
- **meters** — código del medidor y flag `isInverted` (cuenta hacia atrás).
- **billing_periods** — código, monto común (factura), consumo del medidor general, estado `OPEN → CALCULATED → CLOSED`, precio por m³ en JSON.
- **readings** — lecturas anterior/actual y consumo calculado por medidor y periodo.
- **allocations** (recibos) — consumo, consumo efectivo (`consumo × coeficiente`), % participación, monto adeudado/pagado, desglose JSON, estado `PENDIENTE/PARCIAL/PAGADO`.
- **payments** — monto, método (`EFECTIVO/TRANSFERENCIA/QR`), referencia, quién registró.

**Montos**: todos los campos de dinero son `Decimal(12,2)` en base de datos. En la API se
serializan como números (`Number`) en las respuestas; el reparto se redondea a 2 decimales y
se concilia para que la suma exacta sea igual a la factura.

---

## Lógica de reparto (fair billing)

`api/calc.js` implementa el cálculo puro:

```
monto_i = factura × (consumo_efectivo_i / consumo_efectivo_total)
consumo_efectivo_i = consumo_i × coeficiente_i
base_i = consumo_i × precio_por_m³
parte_comun_i = monto_i − base_i
```

Características:

- Reparto **proporcional al consumo efectivo** (los coeficientes ponderan a cada medidor).
- **Conciliación de redondeo**: a cada ítem se le redondea a 2 decimales y el residuo se ajusta
  sobre el primer ítem para que Σ montos = factura exacta.
- Desglose por recibo (`breakdown`) con precio, coef., consumo, participación, base, parte común,
  factura y diferencia contra el medidor general.
- `settlePeriod` **no permite reliquidar** un periodo que ya tiene pagos (protege el historial).
- `registerPayment` valida que el pago no exceda el pendiente y actualiza el estado a
  `PARCIAL` o `PAGADO`.

---

## Seguridad

- **Passwords**: bcrypt con coste 12.
- **JWT** (8h) guardado en `localStorage`; interceptor de Axios con redirección a login en 401.
- **Registro público** genera cuentas **inactivas**: el login responde `403` con el mensaje
  *"Tu cuenta está pendiente de activación por el administrador"* hasta que un admin las active.
- **Bootstrap admin** exige `BOOTSTRAP_KEY` (sin fallback en código).
- **CORS** restringido a orígenes Vercel conocidos + localhost (+ `CORS_ORIGINS` del env);
  cualquier otro origen recibe `403`.
- **Rate limiting** por IP en toda la API (y límite más estricto en login).
- **helmet** + `X-Frame-Options: DENY` y cabeceras de seguridad en `vercel.json`.
- El error global no filtra detalles internos (usa códigos Prisma genéricos y `500`).

### Recomendación pendiente

El token JWT vive en `localStorage` (exposición ante XSS). Para máxima seguridad se sugiere
guardarlo en `sessionStorage` o cookie `HttpOnly` + `SameSite`. No hay XSS conocido en la app.

---

## Panel de administración

- **Dashboard**: KPIs (total departamentos, periodo activo, recaudado, pendiente) y últimos periodos.
- **Departamentos**: alta/edición/baja con medidor y credenciales; toggle de activar/desactivar acceso.
- **Periodos**: crear periodo (factura común, consumo general), cargar lecturas (batch, sin N+1),
  liquidar periodo, exportar Excel.
- **Cobro Rápido**: filtrar por periodo/estado, cobrar (efectivo/transferencia/QR), **ver detalle e
  historial de pagos** de cada recibo, exportar Excel.
- **Usuarios**: lista con estado, acceso, último login; activar/desactivar cuentas y restablecer
  contraseñas. No se puede desactivar la propia cuenta.

### Panel del adjudicatario (owner)

- Resumen del mes, deuda total, último periodo.
- **Desglose del recibo** (cómo se calculó su monto).
- Gráfico histórico de consumo y tabla de periodos.

---

## Pruebas

```bash
# Unitarias (lógica de facturación): scripts/test-calc.js
node --test scripts/test-calc.js

# Integración contra un backend local (debe estar corriendo en :5000)
node scripts/test-api.js

# Integración contra producción
$env:BASE_URL="https://cobro-agua.vercel.app"; node scripts/test-api.js
```

`test-api.js` (29 casos) valida: health, login (ok/error/case), permisos roles (401/403),
registro → pendiente → activación → desactivación, creación de periodo, lecturas, liquidación
con suma exacta a la factura, control de pagos (> adeudo → 400), reliquidación con pagos → 400,
dashboard/historial de owner y prevención de "takeover" de departamento. Al terminar **limpia**
todos los datos de prueba que crea.

Otros scripts (`scripts/`):

- `seed-all.js` / `test-login.js` — siembran/validan credenciales iniciales.
- `backup-before-push.js`, `restore-after-push.js`, `verify-schema.js` — respaldo/restauración de
  estados/roles/métodos ante cambios de esquema con `prisma db push --accept-data-loss`.

Lint: `npm run lint` (oxlint). Build: `npm run build`.

---

## Despliegue (Vercel + Neon)

1. Crea la BD en [Neon](https://neon.tech/) y copia `DATABASE_URL` (pooled) y `DIRECT_URL`.
2. En el repo raíz: `cd api && npx prisma db push` contra esa BD.
3. Importa el repo en [Vercel](https://vercel.com) y define en *Settings → Environment Variables*:

   - `DATABASE_URL`
   - `DIRECT_URL`
   - `JWT_SECRET_KEY`
   - `BOOTSTRAP_KEY`
   - (`VITE_API_URL` solo si el frontend debe llamar a otra URL; por defecto usa `/api`)

4. `vercel --prod` (o push a `main` si hay Git integration). El build ejecuta `prisma generate`
   (definido en `api/package.json` → `vercel-build`) y luego `vite build` para el frontend.
5. Crea el admin con el endpoint bootstrap usando `BOOTSTRAP_KEY`.

`vercel.json` enruta `/api/*` hacia `api/index.js` (una sola función serverless) y `/*` hacia
`index.html`, evitando así superar el límite de 12 funciones del plan gratuito.

---

## Estructura de commits relevante

- `80a1cc4` fix: mover scripts fuera de `api/` para no exceder el límite de 12 funciones.
- `34893e8` refactor: consolidar API (enums + Decimal), seguridad y tests.
- `08cf5f7` feat(frontend): página Usuarios, modal accesible, historial de pagos, desglose de recibo, toggle de acceso y accesibilidad.