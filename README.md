# TallerFlow

SaaS de control de tiempos y productividad para talleres industriales (demo de portafolio)

## 🔗 Demo en vivo

**[tallerflow-production.up.railway.app](https://tallerflow-production.up.railway.app)**

| Acceso | Credencial |
|---|---|
| Admin | admin@tallerflow.cl / admin123 |
| Kiosco técnico | PIN 1234 |

> Datos de demostración. La base se puede reiniciar sin aviso.
>
> <img width="1895" height="957" alt="image" src="https://github.com/user-attachments/assets/defe3938-7b77-466b-8c19-cb1180536ecf" />


## Stack

- **Framework:** Next.js 15 (App Router) + React 19 + TypeScript
- **UI:** Tailwind CSS 4 + shadcn/ui (estilo new-york)
- **ORM:** Prisma con PostgreSQL 16
- **Auth:** NextAuth.js v5 (Auth.js) — credentials + PIN para kiosco
- **Real-time:** Socket.io
- **Offline:** PWA con Service Worker (Workbox/Serwist) + IndexedDB
- **Testing:** Vitest + Playwright + Testing Library
- **Deploy:** AWS (RDS + ECS Fargate + S3 + CloudFront)

## Requisitos previos

- Node.js 20+
- Docker Desktop (para PostgreSQL local)
- npm 10+

## Puesta en marcha

```bash
# 1. Instalar dependencias
npm install

# 2. Copiar variables de entorno
cp .env.example .env

# 3. Levantar PostgreSQL local
docker compose up -d

# 4. Ejecutar migraciones
npx prisma migrate dev

# 5. Cargar datos de prueba
npx prisma db seed

# 6. Iniciar servidor de desarrollo
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000).

## Comandos

```bash
npm run dev               # Servidor de desarrollo
npm run build             # Build de producción
npm run start             # Iniciar build de producción
npm run lint              # ESLint
npx prisma migrate dev    # Migraciones pendientes
npx prisma db seed        # Datos de prueba
npx prisma studio         # UI visual de la base de datos
npx vitest run            # Tests
npx vitest --watch        # Tests en modo watch
docker compose up -d      # Levantar PostgreSQL local
docker compose down       # Detener PostgreSQL
```

## Usuarios de prueba

| Email                             | Password | Rol              |
| --------------------------------- | -------- | ---------------- |
| admin@tallerflow.cl               | admin123 | ADMIN            |
| jefetallernc@tallerflow.cl        | jefe123  | JEFE_TALLER      |
| PIN: 1234                         | —        | TECNICO (kiosco) |
| coordinadortallernc@tallerflow.cl | coord123 | COORDINADOR      |

## Documentación adicional

- [CLAUDE.md](CLAUDE.md) — Guía completa para agentes de IA y referencia técnica detallada (estructura, entidades, roles, reglas de negocio, convenciones).
- [AGENTS.md](AGENTS.md) — Notas específicas sobre la versión de Next.js usada.
