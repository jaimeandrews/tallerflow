import NextAuth, { type DefaultSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { registrarAuditoria } from "@/lib/services/auditoria-service";
import type { RolUsuario } from "@/generated/prisma";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      nombre: string;
      apellido: string;
      iniciales: string;
      rol: RolUsuario;
      sucursalId: string;
      color: string;
    };
  }

  interface User {
    nombre: string;
    apellido: string;
    iniciales: string;
    rol: RolUsuario;
    sucursalId: string;
    color: string;
  }
}

const isProd = process.env.NODE_ENV === "production";

// Anti-enumeration / timing oracle: pre-computed bcrypt hash used when a login
// attempt targets an email that doesn't exist. Running bcrypt.compare() against
// this dummy ensures the response time is identical (~100ms) whether the user
// exists or not, preventing email enumeration via timing difference.
//
// This is a hardcoded valid bcrypt hash (cost=10) — equivalent to:
//   `await bcrypt.hash("tallerflow_dummy", 10)` run once at module load.
// Hardcoded to avoid async initialization and be ready from the first request.
const DUMMY_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
    // A07: session lifetime — one full shift maximum.
    maxAge: 8 * 60 * 60, // 8 hours absolute maximum
    // A07: re-issue (refresh) the JWT every 15 minutes while the user is active.
    // On each re-issue the jwt() callback fires, which re-checks activo status
    // against the DB. Deactivated users are kicked out within 15 minutes.
    updateAge: 15 * 60, // 15 minutes
  },
  pages: {
    signIn: "/login",
  },
  // A02: explicit cookie flags — document security intent.
  cookies: {
    sessionToken: {
      options: {
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
        secure: isProd,
      },
    },
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      // A09: `request` (second param) gives us the IP for audit logging
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) return null;

        const ip =
          request?.headers?.get("x-forwarded-for")?.split(",")[0].trim() ??
          request?.headers?.get("x-real-ip") ??
          "unknown";

        // A02: explicit select — passwordHash needed for comparison only
        const usuario = await prisma.usuario.findUnique({
          where: { email: credentials.email as string },
          select: {
            id: true,
            email: true,
            nombre: true,
            apellido: true,
            iniciales: true,
            rol: true,
            sucursalId: true,
            color: true,
            activo: true,
            passwordHash: true,
          },
        });

        // A07: always run bcrypt (uses module-level DUMMY_HASH) — see above
        const passwordMatch = await bcrypt.compare(
          credentials.password as string,
          usuario?.passwordHash ?? DUMMY_HASH
        );

        // A09: log all login failures (one generic path, no information leak)
        if (!usuario || !usuario.activo || !passwordMatch) {
          void registrarAuditoria({
            usuarioId: usuario?.id, // null if user not found
            accion: "LOGIN_FAILED",
            entidad: "Auth",
            ip,
            datosNuevos: {
              email: credentials.email, // helps detect targeted attacks
              reason: !usuario
                ? "user_not_found"
                : !usuario.activo
                  ? "user_inactive"
                  : "wrong_password",
            },
          });
          return null;
        }

        // A09: log successful web login
        void registrarAuditoria({
          usuarioId: usuario.id,
          accion: "LOGIN",
          entidad: "Auth",
          ip,
          datosNuevos: { via: "web", email: usuario.email },
        });

        return {
          id: usuario.id,
          email: usuario.email,
          nombre: usuario.nombre,
          apellido: usuario.apellido,
          iniciales: usuario.iniciales,
          rol: usuario.rol,
          sucursalId: usuario.sucursalId,
          color: usuario.color,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Initial sign-in: populate token from User returned by authorize()
      if (user) {
        token.id = user.id as string;
        token.nombre = user.nombre;
        token.apellido = user.apellido;
        token.iniciales = user.iniciales;
        token.rol = user.rol;
        token.sucursalId = user.sucursalId;
        token.color = user.color;
        return token;
      }

      // A07: re-validate active status on every 15-min token re-issue
      if (token.id) {
        const u = await prisma.usuario.findUnique({
          where: { id: token.id as string },
          select: { activo: true, rol: true, sucursalId: true },
        });
        if (!u || !u.activo) return null as unknown as typeof token;
        token.rol = u.rol;
        token.sucursalId = u.sucursalId;
      }

      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id as string;
      session.user.nombre = token.nombre as string;
      session.user.apellido = token.apellido as string;
      session.user.iniciales = token.iniciales as string;
      session.user.rol = token.rol as RolUsuario;
      session.user.sucursalId = token.sucursalId as string;
      session.user.color = token.color as string;
      return session;
    },
  },
});
