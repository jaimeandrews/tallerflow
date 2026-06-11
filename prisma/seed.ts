import "dotenv/config";
import { PrismaClient, RolUsuario, EstadoOF, PrioridadOF } from "../src/generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding database...");

  // ─── Sucursales ──────────────────────────────────────────────────────────
  const sucursalesData = [
    { nombre: "Antofagasta", codigo: "ANT" },
    { nombre: "Calama", codigo: "CAL" },
    { nombre: "Copiapó", codigo: "COP" },
    { nombre: "Santiago", codigo: "SCL" },
    { nombre: "Los Ángeles", codigo: "LAG" },
    { nombre: "Puerto Montt", codigo: "PMC" },
  ];

  const sucursales = await Promise.all(
    sucursalesData.map((s) =>
      prisma.sucursal.upsert({
        where: { codigo: s.codigo },
        update: {},
        create: s,
      })
    )
  );

  const sucursalMap = Object.fromEntries(sucursales.map((s) => [s.codigo, s]));
  console.log(`✓ ${sucursales.length} sucursales`);

  // ─── Especialidades ───────────────────────────────────────────────────────
  const especialidadesNombres = [
    "Mecánica",
    "Hidráulica",
    "Eléctrica",
    "Diagnóstico",
    "Electrónica",
    "Soldadura",
    "Cajas",
    "Garantía",
  ];

  await Promise.all(
    especialidadesNombres.map((nombre) =>
      prisma.especialidad.upsert({
        where: { nombre },
        update: {},
        create: { nombre },
      })
    )
  );
  console.log(`✓ ${especialidadesNombres.length} especialidades`);

  // ─── Actividades ──────────────────────────────────────────────────────────
  const actividadesData = [
    { nombre: "Reparación", color: "#2563EB", productiva: true, icono: "wrench" },
    { nombre: "Diagnóstico", color: "#7C3AED", productiva: true, icono: "search" },
    { nombre: "Garantía", color: "#059669", productiva: true, icono: "shield-check" },
    { nombre: "Espera repuesto", color: "#D97706", productiva: false, icono: "clock" },
    { nombre: "Aseo taller", color: "#6B7280", productiva: false, icono: "trash" },
    { nombre: "Reunión", color: "#0891B2", productiva: false, icono: "users" },
    { nombre: "Almuerzo", color: "#DC2626", productiva: false, icono: "coffee" },
  ];

  for (const a of actividadesData) {
    const existing = await prisma.actividad.findFirst({ where: { nombre: a.nombre } });
    if (!existing) await prisma.actividad.create({ data: a });
  }
  console.log(`✓ ${actividadesData.length} actividades`);

  // ─── Admin ───────────────────────────────────────────────────────────────
  const adminHash = await bcrypt.hash("admin123", 10);
  await prisma.usuario.upsert({
    where: { email: "admin@tallerflow.cl" },
    update: {},
    create: {
      email: "admin@tallerflow.cl",
      passwordHash: adminHash,
      nombre: "Administrador",
      apellido: "Sistema",
      rut: "11111111-1",
      iniciales: "AD",
      rol: RolUsuario.ADMIN,
      sucursalId: sucursalMap["ANT"].id,
      color: "#DC2626",
    },
  });
  console.log("✓ Admin creado");

  // ─── Jefes, Coordinadores y Gerentes por sucursal ─────────────────────────
  const rolesData = [
    {
      rol: RolUsuario.JEFE_TALLER,
      password: "jefe123",
      prefijo: "jefe",
      label: "Jefe Taller",
      apellido: "Taller",
      colorBase: "#2563EB",
    },
    {
      rol: RolUsuario.COORDINADOR,
      password: "coord123",
      prefijo: "coord",
      label: "Coordinador",
      apellido: "Coordinación",
      colorBase: "#7C3AED",
    },
    {
      rol: RolUsuario.GERENTE_SUCURSAL,
      password: "gerente123",
      prefijo: "gerente",
      label: "Gerente",
      apellido: "Sucursal",
      colorBase: "#059669",
    },
  ];

  let rutCounter = 22222222;
  for (const sucursal of sucursales) {
    for (const rolData of rolesData) {
      const codigoLower = sucursal.codigo.toLowerCase();
      const email = `${rolData.prefijo}.${codigoLower}@tallerflow.cl`;
      const hash = await bcrypt.hash(rolData.password, 10);
      await prisma.usuario.upsert({
        where: { email },
        update: {},
        create: {
          email,
          passwordHash: hash,
          nombre: `${rolData.label}`,
          apellido: `${rolData.apellido} ${sucursal.nombre}`,
          rut: `${rutCounter}-${rutCounter % 9}`,
          iniciales: rolData.prefijo.substring(0, 2).toUpperCase(),
          rol: rolData.rol,
          sucursalId: sucursal.id,
          color: rolData.colorBase,
        },
      });
      rutCounter++;
    }
  }
  console.log("✓ Jefes, coordinadores y gerentes creados");

  // ─── Técnicos de prueba para Antofagasta ─────────────────────────────────
  const tecnicosData = [
    {
      nombre: "Carlos",
      apellido: "Mendoza",
      rut: "14123456-7",
      email: "tecnico1.ant@tallerflow.cl",
      iniciales: "CM",
      pin: "1234",
      color: "#0891B2",
    },
    {
      nombre: "Juan",
      apellido: "Riquelme",
      rut: "15234567-8",
      email: "tecnico2.ant@tallerflow.cl",
      iniciales: "JR",
      pin: "5678",
      color: "#D97706",
    },
    {
      nombre: "Pedro",
      apellido: "Castillo",
      rut: "16345678-9",
      email: "tecnico3.ant@tallerflow.cl",
      iniciales: "PC",
      pin: "9012",
      color: "#059669",
    },
  ];

  for (const t of tecnicosData) {
    const passHash = await bcrypt.hash("tecnico123", 10);
    const pinHash = await bcrypt.hash(t.pin, 10);
    await prisma.usuario.upsert({
      where: { email: t.email },
      update: {},
      create: {
        email: t.email,
        passwordHash: passHash,
        nombre: t.nombre,
        apellido: t.apellido,
        rut: t.rut,
        iniciales: t.iniciales,
        pin: pinHash,
        rol: RolUsuario.TECNICO,
        sucursalId: sucursalMap["ANT"].id,
        color: t.color,
      },
    });
  }
  console.log("✓ 3 técnicos de prueba creados (Antofagasta)");

  // ─── Turno Mañana por sucursal ────────────────────────────────────────────
  for (const sucursal of sucursales) {
    const turnoId = `turno-manana-${sucursal.codigo}`;
    const existingTurno = await prisma.turno.findUnique({ where: { id: turnoId } });
    if (!existingTurno) {
      await prisma.turno.create({
        data: {
          id: turnoId,
          nombre: "Mañana",
          horaInicio: "07:00",
          horaFin: "15:00",
          sucursalId: sucursal.id,
        },
      });
    }
  }
  console.log("✓ Turnos Mañana creados");

  // ─── OFs de prueba para Antofagasta ──────────────────────────────────────
  const ofsData = [
    {
      numero: "2512001",
      proyecto: "0000031",
      nombre: "MANTENCION PREVENTIVA",
      cliente: "Minera Norte S.A.",
      equipo: "Camión Komatsu 930E · Transporte",
      estado: EstadoOF.EN_PROCESO,
      prioridad: PrioridadOF.ALTA,
      hhEstimadas: 16,
      tecnicosRequeridos: 2,
    },
    {
      numero: "2512002",
      proyecto: "0000032",
      nombre: "REPARACION MOTOR",
      cliente: "Codelco División Norte",
      equipo: "Excavadora Cat 390 · Carguío",
      estado: EstadoOF.PENDIENTE,
      prioridad: PrioridadOF.MEDIA,
      hhEstimadas: 24,
      tecnicosRequeridos: 3,
    },
    {
      numero: "2512003",
      proyecto: "0000033",
      nombre: "REPARACION CAJA",
      cliente: "Anglo American",
      equipo: "USIMECA 26m³ · Recolector",
      estado: EstadoOF.ESPERA_REPUESTO,
      prioridad: PrioridadOF.CRITICA,
      hhEstimadas: 8,
      critica: true,
      tecnicosRequeridos: 1,
    },
  ];

  for (const of_ of ofsData) {
    await prisma.ordenTrabajo.upsert({
      where: { numero: of_.numero },
      update: {},
      create: {
        ...of_,
        sucursalId: sucursalMap["ANT"].id,
      },
    });
  }
  console.log("✓ 3 OFs de prueba creadas (Antofagasta)");

  console.log("\nSeed completado exitosamente.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
