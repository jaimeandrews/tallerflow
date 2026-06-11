/**
 * Database seed helpers for E2E tests.
 *
 * These functions run CLI commands in the Node.js process (not in the browser),
 * so they are suitable for use in beforeAll / afterAll hooks.
 *
 * WARNING: resetDB() drops and recreates the entire database.
 * Only call it in test suites that explicitly need a clean state.
 * Most tests should be resilient to existing data instead of relying on a reset.
 */

import { execSync, type ExecSyncOptionsWithBufferEncoding } from "child_process";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../../../");

const EXEC_OPTS: ExecSyncOptionsWithBufferEncoding = {
  cwd: ROOT,
  stdio: "pipe", // suppress output unless there is an error
  env: {
    ...process.env,
    NODE_ENV: "test",
  },
};

// ── Core helpers ──────────────────────────────────────────────────────────────

/**
 * Reset the database to a clean state and re-apply the seed.
 *
 * Runs:
 *   1. npx prisma migrate reset --force --skip-seed
 *   2. npx prisma db seed
 *
 * Typical use: call in `test.beforeAll()` for suites that require isolated data.
 * Takes ~5-10 seconds depending on DB speed.
 */
export async function resetDB(): Promise<void> {
  try {
    execSync("npx prisma migrate reset --force --skip-seed", EXEC_OPTS);
    execSync("npx prisma db seed", EXEC_OPTS);
  } catch (err) {
    const output =
      err instanceof Error && "stdout" in err
        ? String((err as NodeJS.ErrnoException & { stdout: Buffer }).stdout)
        : String(err);
    throw new Error(`resetDB failed:\n${output}`);
  }
}

/**
 * Run the seed without resetting migrations (faster, assumes schema is current).
 * Use when you only want to ensure seed data exists, not wipe everything.
 */
export async function seedDB(): Promise<void> {
  try {
    execSync("npx prisma db seed", EXEC_OPTS);
  } catch (err) {
    const output =
      err instanceof Error && "stdout" in err
        ? String((err as NodeJS.ErrnoException & { stdout: Buffer }).stdout)
        : String(err);
    throw new Error(`seedDB failed:\n${output}`);
  }
}

// ── Known seed data ───────────────────────────────────────────────────────────
// Reference values from prisma/seed.ts. Import these in tests instead of
// duplicating the strings, so a seed change only needs to be updated here.

export const SEED_DATA = {
  sucursales: {
    antofagasta: { nombre: "Antofagasta", codigo: "ANT" },
    calama: { nombre: "Calama", codigo: "CAL" },
    copiapó: { nombre: "Copiapó", codigo: "COP" },
    santiago: { nombre: "Santiago", codigo: "SCL" },
    losAngeles: { nombre: "Los Ángeles", codigo: "LAG" },
    puertoMontt: { nombre: "Puerto Montt", codigo: "PMC" },
  },
  usuarios: {
    admin: { email: "admin@tallerflow.cl", password: "admin123", rol: "ADMIN" },
    jefeAnt: {
      email: "jefe.antofagasta@tallerflow.cl",
      password: "jefe123",
      rol: "JEFE_TALLER",
    },
    tecnico1: {
      email: "tecnico1.ant@tallerflow.cl",
      password: "tecnico123",
      pin: "1234",
      rol: "TECNICO",
    },
    tecnico2: {
      email: "tecnico2.ant@tallerflow.cl",
      pin: "5678",
      rol: "TECNICO",
    },
    tecnico3: {
      email: "tecnico3.ant@tallerflow.cl",
      pin: "9012",
      rol: "TECNICO",
    },
  },
} as const;
