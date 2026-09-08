# Proyecto Agua - Sistema de Gestión de Condominio

Aplicación full-stack para gestión de pagos, consumos y usuarios de un condominio.

1. **Frontend**: React (Vite)
2. **Backend**: API Node.js (Express) con Prisma
3. **Base de datos**: PostgreSQL (Neon)

---

## Arquitectura

- **Frontend (React)**: login, paneles de admin/propietario y gráficos. Habla con la API por HTTP (`axios`).
- **Backend (Express)**: JWT, reglas de negocio y persistencia con Prisma.
- **PostgreSQL (Neon)**: usuarios, departamentos, medidores, periodos, lecturas, recibos y pagos.

---

## Cómo inicializar el proyecto localmente

Levanta backend y frontend en dos terminales.

### Paso A: Backend (Terminal 1)

```bash
cd api
npm install
```

Copia `api/.env.example` a `api/.env` y configura:

- `DATABASE_URL`
- `DIRECT_URL`
- `JWT_SECRET_KEY`

```bash
npx prisma generate
npm run dev
```

El backend queda en `http://localhost:5000`.

### Paso B: Frontend (Terminal 2)

En la raíz del proyecto (`proyecto_agua_2`):

```bash
npm install
npm run dev
```

El frontend queda en `http://localhost:5173`. Vite hace proxy de `/api` hacia `http://localhost:5000`.

---

## Despliegue (Vercel + Neon)

Frontend y API se despliegan juntos en Vercel. La base de datos vive en Neon.

### Fase 1: Neon (PostgreSQL)

1. Crea un proyecto en [Neon](https://neon.tech/).
2. Copia las URLs de conexión (`DATABASE_URL` pooled y `DIRECT_URL` directa).
3. Ejecuta las migraciones de Prisma contra esa base.

### Fase 2: Vercel

1. Sube el código a GitHub e importa el repo en [Vercel](https://vercel.com/).
2. Configura las variables de entorno:

   - `DATABASE_URL`
   - `DIRECT_URL`
   - `JWT_SECRET_KEY`
   - `VITE_API_URL` (si el frontend llama a otra URL; en el mismo proyecto puede usarse `/api`)

3. Deploy. La API serverless queda en `/api`.
