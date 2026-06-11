/**
 * Custom server para TallerFlow.
 *
 * Por qué un custom server: Next.js 16 con App Router no expone el HTTP server
 * subyacente a Route Handlers, lo que es necesario para attach a Socket.io.
 * Ver explicación completa en `src/lib/socket/socket-server.ts`.
 *
 * Comportamiento:
 *  - dev: corre next dev programáticamente con HMR habilitado.
 *  - prod: corre el servidor con la build optimizada de `next build`.
 *  - Levanta Socket.io en el mismo puerto vía path `/api/socketio`.
 *
 * Para arrancar:
 *   npm run dev    →  tsx watch server.ts
 *   npm run start  →  cross-env NODE_ENV=production tsx server.ts (tras `npm run build`)
 */

// dotenv debe cargarse ANTES de cualquier import que lea process.env
// (incluyendo la cadena server → alerta-service → prisma que crea el
// PrismaClient singleton en el momento del import).
import "dotenv/config";

import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";
import { initSocketServer } from "./src/lib/socket/socket-server";
import { startAlertasScheduler } from "./src/lib/services/alerta-service";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME ?? "localhost";
const port = Number(process.env.PORT ?? 3000);

// `turbopack: false` fuerza el bundler webpack en dev — ya en uso en este
// proyecto por compatibilidad con la configuración de `next.config.ts` y el
// plugin de Serwist (ver discusión previa al arreglar el inicio del server).
const app = next({ dev, hostname, port, turbopack: false });
const handle = app.getRequestHandler();

async function main() {
  await app.prepare();

  const httpServer = createServer((req, res) => {
    try {
      const parsedUrl = parse(req.url ?? "/", true);
      void handle(req, res, parsedUrl);
    } catch (err) {
      console.error("[server] error handling request:", err);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  });

  initSocketServer(httpServer);

  // Motor de alertas — Opción A: scheduler en el mismo proceso del custom
  // server. Razón: corre en proceso único (no se duplica entre conexiones de
  // browser), no requiere infra externa (Lambda/Cron), y mientras el proceso
  // viva las reglas se evalúan cada 60s. Si en prod se necesita correr
  // múltiples instancias del backend con HA, migrar a Opción C (cron externo
  // que llame /api/cron/evaluar-alertas con CRON_SECRET) y no llamar
  // startAlertasScheduler aquí.
  startAlertasScheduler();

  httpServer.once("error", (err) => {
    console.error("[server] fatal:", err);
    process.exit(1);
  });

  httpServer.listen(port, () => {
    console.log(`> TallerFlow listo en http://${hostname}:${port}`);
    console.log(`> Socket.io path: /api/socketio (namespaces: /control, /kiosco)`);
  });

  // Graceful shutdown — importante para que `next dev` cierre limpio en
  // hot-reload del custom server, y para SIGTERM en ECS Fargate (prod).
  const shutdown = (signal: string) => {
    console.log(`\n[server] ${signal} recibido — cerrando…`);
    httpServer.close(() => process.exit(0));
    // forzar salida si algún socket cuelga
    setTimeout(() => process.exit(0), 5_000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

void main();
