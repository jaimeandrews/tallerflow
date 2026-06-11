/**
 * Data sanitization utilities.
 *
 * Primary defense: Prisma `select:` clauses never fetch passwordHash or pin.
 * These utilities are a **defense-in-depth** layer — they strip sensitive
 * fields from any object before it can be serialized into an API response,
 * guarding against future regressions where a developer adds a query without
 * an explicit select.
 *
 * Usage:
 *   // Typed (keys verified at compile time):
 *   const safe = excluirCampos(usuario, ["passwordHash", "pin"]);
 *
 *   // Generic runtime stripping (e.g., unknown shape from DB):
 *   const safe = excluirCamposSensibles(anyObject);
 */

// ── Typed field exclusion ─────────────────────────────────────────────────────

/**
 * Removes the specified keys from `obj` and returns a new object.
 * TypeScript tracks which keys were removed via the `Omit<T, K>` return type,
 * so callers get compile-time safety that the excluded fields aren't accessible.
 *
 * @example
 * const safe = excluirCampos(user, ["passwordHash", "pin"] as const);
 * // TypeScript error: safe.passwordHash  ← correctly rejected
 */
export function excluirCampos<T extends object, K extends keyof T>(
  obj: T,
  campos: readonly K[]
): Omit<T, K> {
  const result = { ...obj };
  for (const campo of campos) {
    delete result[campo];
  }
  return result as Omit<T, K>;
}

// ── Sensitive field constants ─────────────────────────────────────────────────

/** Fields that must NEVER appear in any API response. */
export const CAMPOS_SENSIBLES = ["passwordHash", "pin"] as const;
export type CampoSensible = (typeof CAMPOS_SENSIBLES)[number];

// ── Runtime safety net ────────────────────────────────────────────────────────

/**
 * Strips ALL known sensitive fields from any object, regardless of its shape.
 * Safe to call on Prisma results that may have been fetched without an explicit
 * `select:` clause.
 *
 * Works recursively on arrays so it can be applied to `findMany` results.
 *
 * @example
 * // Single object
 * return Response.json({ usuario: excluirCamposSensibles(user) });
 *
 * // Array from findMany
 * return Response.json({ data: excluirCamposSensibles(users) });
 */
export function excluirCamposSensibles<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj.map(excluirCamposSensibles) as unknown as T;
  }
  if (obj !== null && typeof obj === "object") {
    const sanitized = { ...obj } as Record<string, unknown>;
    for (const campo of CAMPOS_SENSIBLES) {
      if (campo in sanitized) {
        delete sanitized[campo];
      }
    }
    return sanitized as T;
  }
  return obj;
}

/**
 * Type-safe wrapper specifically for usuario-shaped objects.
 * Use this in any endpoint that returns user data to guarantee the
 * sensitive fields are excluded even if Prisma select changes.
 *
 * Uses the runtime strip (no compile-time key constraint needed) since
 * the return type is explicitly declared.
 */
export type UsuarioSanitizado<T> = Omit<T, CampoSensible>;

export function sanitizarUsuario<T extends object>(usuario: T): UsuarioSanitizado<T> {
  return excluirCamposSensibles(usuario) as UsuarioSanitizado<T>;
}
