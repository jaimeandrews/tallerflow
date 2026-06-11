@AGENTS.md

# TallerFlow

## Descripción

SaaS para gestionar y controlar el marcaje de técnicos en órdenes de trabajo (OF) en talleres. Permite el registro de tiempos, asignación de técnicos, monitoreo en tiempo real y generación de reportes de productividad.

## Stack técnico

- **Framework:** Next.js 15 (App Router) + React 19 + TypeScript
- **UI:** Tailwind CSS 4 + shadcn/ui (estilo new-york)
- **ORM:** Prisma con PostgreSQL 16
- **Auth:** NextAuth.js v5 (Auth.js) con credentials provider + PIN para kiosco
- **Real-time:** Socket.io
- **Offline:** PWA con Service Worker (Workbox/Serwist) + IndexedDB
- **Testing:** Vitest + Playwright + Testing Library
- **Deploy:** AWS (RDS + ECS Fargate + S3 + CloudFront)

## Comandos principales

```bash
npm run dev          # Servidor de desarrollo en http://localhost:3000
npm run build        # Build de producción
npm run start        # Iniciar build de producción
npm run lint         # ESLint
npx prisma migrate dev    # Ejecutar migraciones pendientes
npx prisma db seed        # Cargar datos de prueba
npx prisma studio         # UI visual de la base de datos
npx vitest run             # Ejecutar tests
npx vitest --watch         # Tests en modo watch
docker compose up -d       # Levantar PostgreSQL local
docker compose down        # Detener PostgreSQL
```

## Estructura del proyecto

```
tallerflow-marcaje/
├── src/
│   ├── app/
│   │   ├── (dashboard)/        # Layout con sidebar — vistas de supervisor
│   │   │   ├── dashboard/
│   │   │   ├── ordenes/
│   │   │   ├── asignacion/
│   │   │   ├── centro-control/
│   │   │   ├── reportes/
│   │   │   ├── configuracion/
│   │   │   └── layout.tsx
│   │   ├── (kiosco)/           # Layout fullscreen dark — kiosco de taller
│   │   │   ├── marcaje/
│   │   │   └── layout.tsx
│   │   ├── (tecnico)/          # Layout sin sidebar — tablet de técnico
│   │   │   ├── tecnico/
│   │   │   └── layout.tsx
│   │   ├── api/
│   │   │   ├── auth/           # NextAuth + PIN endpoint
│   │   │   ├── marcaje/        # Motor de marcaje (iniciar, pausar, reanudar, finalizar, sync)
│   │   │   ├── ordenes/        # CRUD de órdenes de trabajo
│   │   │   ├── asignacion/     # Asignación de técnicos a OF
│   │   │   ├── actividades/
│   │   │   └── turnos/
│   │   ├── login/
│   │   └── layout.tsx
│   ├── components/
│   │   ├── layout/             # Sidebar, Topbar
│   │   ├── marcaje/            # TimerDisplay, PinInput, ActividadGrid, MarcajeTimeline
│   │   ├── ordenes/            # TablaOrdenes, KanbanOrdenes, DialogOrden, SheetDetalleOF
│   │   ├── asignacion/         # PoolTecnicos, OFDropCard, GanttDiario
│   │   └── ui/                 # Componentes shadcn/ui
│   ├── hooks/
│   │   ├── useTimer.ts
│   │   ├── useMarcajeActivo.ts
│   │   ├── useHistorialHoy.ts
│   │   ├── useInactividadLogout.ts
│   │   ├── useOnlineStatus.ts
│   │   ├── useOrdenes.ts
│   │   └── useAsignacion.ts
│   ├── lib/
│   │   ├── auth/               # Configuración NextAuth, permisos por rol
│   │   ├── services/           # marcaje-service, auditoria-service
│   │   ├── middleware/         # Rate limiting
│   │   ├── offline/            # IndexedDB store, cola de sync, sync engine
│   │   ├── utils/              # Formatters, constants, validators (Zod)
│   │   ├── api-client.ts       # Fetch wrapper con auth y retry
│   │   └── prisma.ts           # Cliente Prisma singleton
│   ├── types/
│   │   └── marcaje.ts          # Tipos compartidos front/back
│   └── __tests__/
│       ├── marcaje/
│       └── fase2/
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
├── public/
│   └── manifest.json           # PWA manifest
├── docker-compose.yml
├── .env                        # Variables de entorno (NO commitear)
├── .env.example
└── CLAUDE.md
```

## Base de datos

PostgreSQL 16 via Docker local, AWS RDS en producción.

**Entidades principales:**

- **Sucursal:** 6 sucursales (Antofagasta, Calama, Copiapó, Santiago, Los Ángeles, Puerto Montt)
- **Usuario:** roles → ADMIN, GERENTE_SUCURSAL, JEFE_TALLER, COORDINADOR, TECNICO, CONTROL_GESTION
- **OrdenTrabajo:** estados → PENDIENTE, EN_PROCESO, PAUSADA, ESPERA_REPUESTO, FINALIZADA
- **Marcaje:** registro de inicio/fin de actividad de un técnico, con soporte offline (`idOffline` para deduplicación)
- **AsignacionTecnico:** relación N:N entre técnicos y OF con HH planificadas
- **Actividad:** catálogo configurable (productivas y no productivas)
- **ConfiguracionSLA:** reglas de alerta configurables por sucursal
- **LogAuditoria:** registro inmutable de todas las acciones

**Conexión local:**

```
postgresql://tallerflow:tallerflow_dev_2024@localhost:5432/tallerflow_marcaje
```

## Autenticación

- **Supervisores/admin:** login con email + password via NextAuth (JWT strategy)
- **Técnicos en kiosco:** PIN de 4 dígitos hasheado con bcrypt, JWT con expiración de 8h
- **Técnicos en tablet:** login con email + password, sesión persistente

**Usuarios de prueba (seed):**

| Email                          | Password | Rol              |
| ------------------------------ | -------- | ---------------- |
| admin@tallerflow.cl            | admin123 | ADMIN            |
| jefe.antofagasta@tallerflow.cl | jefe123  | JEFE_TALLER      |
| PIN: 1234                      | —        | TECNICO (kiosco) |

## Roles y permisos

| Rol              | Acceso                                                      |
| ---------------- | ----------------------------------------------------------- |
| ADMIN            | Todo el sistema                                             |
| GERENTE_SUCURSAL | Dashboard, reportes (su sucursal)                           |
| JEFE_TALLER      | Dashboard, OF, asignación, centro control, reportes, config |
| COORDINADOR      | OF, asignación, centro control                              |
| TECNICO          | Vista técnico, marcaje kiosco                               |
| CONTROL_GESTION  | Dashboard, reportes (solo lectura)                          |

## Reglas de negocio clave

- Un técnico solo puede tener un marcaje activo a la vez (`horaFin === null`)
- Al iniciar un nuevo marcaje, el anterior se cierra automáticamente
- Las HH consumidas de una OF se recalculan sumando `duracionMinutos` de todos sus marcajes
- Las transiciones de estado de OF tienen restricciones (FINALIZADA no puede volver atrás excepto ADMIN)
- El kiosco tiene auto-logout tras 5 minutos de inactividad
- Los marcajes offline se deduplicar por `idOffline` (UUID generado en el dispositivo)
- Rate limiting en PIN: 5 intentos max en 5 min, luego bloqueo 15 min
- Todos los datos se filtran por `sucursalId` del usuario autenticado

## Modo offline (PWA)

- Los marcajes se guardan en IndexedDB cuando no hay red
- Al recuperar conexión, se sincronizan via `POST /api/marcaje/sync-offline`
- Deduplicación por `idOffline` evita duplicados
- Indicador visual: chip verde "EN LÍNEA" / rojo "SIN CONEXIÓN · X pendientes"

## Convenciones de código

- TypeScript estricto, no usar `any`
- Validación de inputs con Zod en todos los endpoints
- Nombres de variables y funciones en `camelCase`
- Componentes React en `PascalCase`
- Archivos de componentes en `kebab-case` (`.tsx`)
- Prisma models en `PascalCase`, campos en `camelCase`, tablas mapeadas a `snake_case`
- Imports con alias `@/*` → `src/*`
- Todos los endpoints registran acciones importantes en `LogAuditoria`

## Seguridad

- JWT firmado con `NEXTAUTH_SECRET`, expiración corta (15min access)
- PIN hasheado con bcrypt (nunca en texto plano)
- Headers de seguridad: CSP, HSTS, X-Frame-Options, X-Content-Type-Options
- Row-level security: filtrado por `sucursalId` en todas las queries
- Sanitización contra XSS/injection (Prisma parameterized queries + Zod)
- Variables sensibles en `.env` (no en código)

## Fases de desarrollo

- ✅ **Fase 0:** Scaffolding (Next.js, Prisma, Auth, Layout) — _listo_
- ✅ **Fase 1:** MVP Marcaje kiosco + Vista técnico + Offline PWA — _listo_
- ⬜ **Fase 2:** Órdenes de trabajo (CRUD + tabla + kanban) + Asignación (drag & drop + gantt) — _sin completar_
- ⬜ **Fase 3:** Dashboard operacional + Centro de control en tiempo real — _sin completar_
- ⬜ **Fase 4:** Reportes + Configuración — _sin completar_
- ⬜ **Fase 5:** Seguridad final, QA, deploy AWS — _sin completar_
