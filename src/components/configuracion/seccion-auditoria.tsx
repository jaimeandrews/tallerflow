"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { RolUsuario } from "@/generated/prisma";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronRight as ChevronRightSm,
  ScrollText,
} from "lucide-react";
import { ROL_LABELS } from "@/lib/utils/constants";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LogEntry {
  id: string;
  accion: string;
  entidad: string | null;
  entidadId: string | null;
  datosAnteriores: unknown;
  datosNuevos: unknown;
  ip: string | null;
  dispositivo: string | null;
  createdAt: string;
  usuario: {
    id: string;
    nombre: string;
    apellido: string;
    iniciales: string;
    rol: string;
    color: string;
  } | null;
}

interface UsuarioOpcion {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  iniciales: string;
  color: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCIONES_LISTA = [
  // Auth
  "LOGIN",
  "LOGOUT",
  // Usuarios
  "CREAR_USUARIO",
  "ACTUALIZAR_USUARIO",
  "TOGGLE_ACTIVO_USUARIO",
  "RESET_PIN_USUARIO",
  // Sucursales
  "CREAR_SUCURSAL",
  "ACTUALIZAR_SUCURSAL",
  // Actividades
  "CREAR_ACTIVIDAD",
  "ACTUALIZAR_ACTIVIDAD",
  "ACTIVAR_ACTIVIDAD",
  "DESACTIVAR_ACTIVIDAD",
  // Turnos
  "CREAR_TURNO",
  "ACTUALIZAR_TURNO",
  // SLA
  "CREAR_REGLA_SLA",
  "ACTUALIZAR_REGLA_SLA",
  // Especialidades
  "CREAR_ESPECIALIDAD",
  "ELIMINAR_ESPECIALIDAD",
  // Marcajes
  "INICIAR_MARCAJE",
  "PAUSAR_MARCAJE",
  "REANUDAR_MARCAJE",
  "FINALIZAR_MARCAJE",
  // Órdenes
  "ACTUALIZAR_ORDEN_TRABAJO",
  // Alertas
  "RESOLVER_ALERTA",
] as const;

const ENTIDADES_LISTA = [
  "Usuario",
  "Sucursal",
  "Actividad",
  "Turno",
  "ConfiguracionSLA",
  "Especialidad",
  "Marcaje",
  "OrdenTrabajo",
  "AsignacionTecnico",
  "Alerta",
];

const POR_PAGINA = 50;

// ── Utils ─────────────────────────────────────────────────────────────────────

function fmtFecha(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function accionStyle(accion: string): string {
  const a = accion.toUpperCase();
  if (a === "LOGIN" || a === "LOGOUT") return "bg-blue-50 text-blue-700 border border-blue-200";
  if (a.includes("MARCAJE")) return "bg-emerald-50 text-emerald-700 border border-emerald-200";
  if (a.startsWith("CREAR")) return "bg-green-50 text-green-700 border border-green-200";
  if (a.startsWith("ELIMINAR")) return "bg-red-50 text-red-700 border border-red-200";
  if (a.includes("RESET") || a.includes("PIN"))
    return "bg-orange-50 text-orange-700 border border-orange-200";
  if (
    a.startsWith("ACTUALIZAR") ||
    a.includes("TOGGLE") ||
    a.startsWith("ACTIVAR") ||
    a.startsWith("DESACTIVAR")
  )
    return "bg-amber-50 text-amber-700 border border-amber-200";
  if (a.includes("RESOLVER")) return "bg-purple-50 text-purple-700 border border-purple-200";
  return "bg-slate-50 text-slate-600 border border-slate-200";
}

function extractDetalle(log: LogEntry): string {
  if (log.datosNuevos && typeof log.datosNuevos === "object") {
    const d = log.datosNuevos as Record<string, unknown>;
    if (typeof d.nombre === "string") return d.nombre;
    if (typeof d.email === "string") return d.email;
    if (typeof d.numero === "string") return d.numero;
  }
  if (log.entidadId) {
    return log.entidadId.length > 12 ? `${log.entidadId.slice(0, 8)}…` : log.entidadId;
  }
  return "—";
}

// ── Usuario combobox ──────────────────────────────────────────────────────────

function UsuarioCombobox({
  usuarios,
  value,
  onChange,
}: {
  usuarios: UsuarioOpcion[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = value ? usuarios.find((u) => u.id === value) : null;

  const filtered = search
    ? usuarios.filter((u) =>
        `${u.nombre} ${u.apellido} ${u.email}`.toLowerCase().includes(search.toLowerCase())
      )
    : usuarios;

  return (
    <div
      ref={containerRef}
      className="relative"
      onBlur={(e) => {
        if (!containerRef.current?.contains(e.relatedTarget as Node)) {
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-2.5 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        {selected ? (
          <span className="flex items-center gap-1.5 truncate">
            <span
              className="inline-flex h-4 w-4 rounded-full shrink-0 items-center justify-center text-white text-[8px] font-bold"
              style={{ backgroundColor: selected.color }}
            >
              {selected.iniciales}
            </span>
            <span className="truncate text-xs">
              {selected.nombre} {selected.apellido}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">Todos los usuarios</span>
        )}
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      </button>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-64 rounded-md border bg-white shadow-lg">
          <div className="p-2 border-b">
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar usuario..."
              className="h-7 text-xs"
            />
          </div>
          <ul className="max-h-48 overflow-y-auto py-1">
            <li>
              <button
                type="button"
                tabIndex={0}
                className="w-full text-left px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
                onClick={() => {
                  onChange("__all__");
                  setOpen(false);
                  setSearch("");
                }}
              >
                Todos los usuarios
              </button>
            </li>
            {filtered.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  tabIndex={0}
                  className={cn(
                    "w-full text-left flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-slate-50",
                    value === u.id && "bg-slate-50"
                  )}
                  onClick={() => {
                    onChange(u.id);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <span
                    className="inline-flex h-5 w-5 rounded-full shrink-0 items-center justify-center text-white text-[9px] font-bold"
                    style={{ backgroundColor: u.color }}
                  >
                    {u.iniciales}
                  </span>
                  <span>
                    <span className="font-medium text-slate-700">
                      {u.nombre} {u.apellido}
                    </span>
                    <span className="ml-1 text-slate-400">{u.email}</span>
                  </span>
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-3 py-3 text-xs text-slate-400 text-center">Sin resultados</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Expandable row detail ─────────────────────────────────────────────────────

function JsonBlock({ label, data }: { label: string; data: unknown }) {
  if (!data) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
        {label}
      </p>
      <pre className="text-[10px] font-mono bg-white border rounded p-2 overflow-x-auto max-h-32 whitespace-pre-wrap break-all text-slate-700">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  rol: RolUsuario;
  sucursales: { id: string; nombre: string; codigo: string }[];
}

// ── Main component ────────────────────────────────────────────────────────────

export function SeccionAuditoria({ rol, sucursales }: Props) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filtroDesde, setFiltroDesde] = useState("");
  const [filtroHasta, setFiltroHasta] = useState("");
  const [filtroUsuarioId, setFiltroUsuarioId] = useState("__all__");
  const [filtroAccion, setFiltroAccion] = useState("__all__");
  const [filtroEntidad, setFiltroEntidad] = useState("__all__");

  // Users list (ADMIN only)
  const [usuarios, setUsuarios] = useState<UsuarioOpcion[]>([]);

  // Expanded rows
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  // Fetch users once (ADMIN only)
  useEffect(() => {
    if (rol !== "ADMIN") return;
    fetch("/api/configuracion/usuarios?porPagina=200&activo=true")
      .then((r) => r.json())
      .then((j) => setUsuarios(j.data ?? []))
      .catch(() => {});
  }, [rol]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ pagina: String(pagina), porPagina: String(POR_PAGINA) });
      if (filtroUsuarioId !== "__all__") params.set("usuarioId", filtroUsuarioId);
      if (filtroAccion !== "__all__") params.set("accion", filtroAccion);
      if (filtroEntidad !== "__all__") params.set("entidad", filtroEntidad);
      if (filtroDesde) params.set("desde", filtroDesde);
      if (filtroHasta) params.set("hasta", filtroHasta);

      const res = await fetch(`/api/configuracion/auditoria?${params}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setLogs(json.data);
      setTotal(json.total);
    } catch {
      setError("No se pudo cargar el log de auditoría");
    } finally {
      setLoading(false);
    }
  }, [pagina, filtroUsuarioId, filtroAccion, filtroEntidad, filtroDesde, filtroHasta]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const resetFiltros = () => {
    setFiltroDesde("");
    setFiltroHasta("");
    setFiltroUsuarioId("__all__");
    setFiltroAccion("__all__");
    setFiltroEntidad("__all__");
    setPagina(1);
  };

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const hayFiltros =
    filtroDesde ||
    filtroHasta ||
    filtroUsuarioId !== "__all__" ||
    filtroAccion !== "__all__" ||
    filtroEntidad !== "__all__";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Auditoría</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Registro inmutable de todas las acciones del sistema
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white border rounded-xl p-3 space-y-2.5">
        {/* Row 1: dates + usuario */}
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-slate-500 whitespace-nowrap">Desde</label>
            <Input
              type="date"
              value={filtroDesde}
              onChange={(e) => {
                setFiltroDesde(e.target.value);
                setPagina(1);
              }}
              className="h-8 text-sm w-36"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-slate-500 whitespace-nowrap">Hasta</label>
            <Input
              type="date"
              value={filtroHasta}
              onChange={(e) => {
                setFiltroHasta(e.target.value);
                setPagina(1);
              }}
              className="h-8 text-sm w-36"
            />
          </div>
          {rol === "ADMIN" && usuarios.length > 0 && (
            <div className="w-52">
              <UsuarioCombobox
                usuarios={usuarios}
                value={filtroUsuarioId}
                onChange={(id) => {
                  setFiltroUsuarioId(id);
                  setPagina(1);
                }}
              />
            </div>
          )}
        </div>

        {/* Row 2: accion + entidad + reset */}
        <div className="flex flex-wrap gap-2 items-center">
          <Select
            value={filtroAccion}
            onValueChange={(v) => {
              setFiltroAccion(v);
              setPagina(1);
            }}
          >
            <SelectTrigger className="w-52 h-8 text-sm">
              <SelectValue placeholder="Todas las acciones" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas las acciones</SelectItem>
              {ACCIONES_LISTA.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filtroEntidad}
            onValueChange={(v) => {
              setFiltroEntidad(v);
              setPagina(1);
            }}
          >
            <SelectTrigger className="w-44 h-8 text-sm">
              <SelectValue placeholder="Todas las entidades" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas las entidades</SelectItem>
              {ENTIDADES_LISTA.map((e) => (
                <SelectItem key={e} value={e}>
                  {e}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hayFiltros && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFiltros}
              className="h-8 text-xs text-slate-400 hover:text-slate-700"
            >
              Limpiar filtros
            </Button>
          )}

          <span className="ml-auto text-xs text-slate-400">{total.toLocaleString()} registros</span>
        </div>
      </div>

      {/* Table */}
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : loading ? (
        <div className="space-y-1.5">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-14 text-slate-400">
          <ScrollText className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Sin registros para los filtros aplicados</p>
        </div>
      ) : (
        <>
          <div className="border rounded-xl overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50">
                    <TableHead className="w-[140px]">Fecha/hora</TableHead>
                    <TableHead className="w-[160px]">Usuario</TableHead>
                    <TableHead className="w-[200px]">Acción</TableHead>
                    <TableHead className="w-[120px]">Entidad</TableHead>
                    <TableHead>Detalle</TableHead>
                    <TableHead className="w-[110px]">IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => {
                    const expanded = expandedRows.has(log.id);
                    const hasDetail = !!(log.datosAnteriores || log.datosNuevos);
                    const detalle = extractDetalle(log);

                    return (
                      <>
                        <TableRow
                          key={log.id}
                          className={cn("cursor-pointer", expanded && "bg-slate-50")}
                          onClick={() => hasDetail && toggleRow(log.id)}
                        >
                          {/* Fecha */}
                          <TableCell className="text-xs text-slate-500 font-mono whitespace-nowrap py-2.5">
                            {fmtFecha(log.createdAt)}
                          </TableCell>

                          {/* Usuario */}
                          <TableCell className="py-2.5">
                            {log.usuario ? (
                              <div className="flex items-center gap-1.5">
                                <Avatar className="h-6 w-6 shrink-0">
                                  <AvatarFallback
                                    style={{ backgroundColor: log.usuario.color }}
                                    className="text-white text-[9px] font-bold"
                                  >
                                    {log.usuario.iniciales}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <p className="text-xs font-medium text-slate-700 truncate leading-tight">
                                    {log.usuario.nombre} {log.usuario.apellido}
                                  </p>
                                  <p className="text-[10px] text-slate-400 truncate leading-tight">
                                    {ROL_LABELS[log.usuario.rol as keyof typeof ROL_LABELS] ??
                                      log.usuario.rol}
                                  </p>
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 italic">Sistema</span>
                            )}
                          </TableCell>

                          {/* Acción */}
                          <TableCell className="py-2.5">
                            <span
                              className={cn(
                                "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono font-medium whitespace-nowrap",
                                accionStyle(log.accion)
                              )}
                            >
                              {log.accion}
                            </span>
                          </TableCell>

                          {/* Entidad */}
                          <TableCell className="py-2.5">
                            {log.entidad ? (
                              <div>
                                <p className="text-xs text-slate-700">{log.entidad}</p>
                                {log.entidadId && (
                                  <p className="text-[10px] text-slate-400 font-mono truncate max-w-[80px]">
                                    {log.entidadId.slice(0, 8)}…
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-300">—</span>
                            )}
                          </TableCell>

                          {/* Detalle */}
                          <TableCell className="py-2.5">
                            <div className="flex items-center gap-1">
                              {hasDetail && (
                                <span className="text-slate-300 shrink-0">
                                  {expanded ? (
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  ) : (
                                    <ChevronRightSm className="h-3.5 w-3.5" />
                                  )}
                                </span>
                              )}
                              <span className="text-xs text-slate-600 truncate max-w-[180px]">
                                {detalle}
                              </span>
                            </div>
                          </TableCell>

                          {/* IP */}
                          <TableCell className="py-2.5 text-xs text-slate-400 font-mono whitespace-nowrap">
                            {log.ip ?? "—"}
                          </TableCell>
                        </TableRow>

                        {/* Expanded detail */}
                        {expanded && hasDetail && (
                          <TableRow key={`${log.id}-exp`} className="bg-slate-50 hover:bg-slate-50">
                            <TableCell colSpan={6} className="py-0 px-0">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
                                <JsonBlock label="Datos anteriores" data={log.datosAnteriores} />
                                <JsonBlock label="Datos nuevos" data={log.datosNuevos} />
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Mostrando {(pagina - 1) * POR_PAGINA + 1}–{Math.min(pagina * POR_PAGINA, total)} de{" "}
              {total.toLocaleString()} registros
            </p>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                disabled={pagina === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {/* Page numbers (show ± 2) */}
              {Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => {
                const p = Math.max(1, Math.min(pagina - 2, totalPaginas - 4)) + i;
                return (
                  <Button
                    key={p}
                    variant={p === pagina ? "default" : "outline"}
                    size="sm"
                    className={cn(
                      "h-8 w-8",
                      p === pagina && "bg-[#006FA0] hover:bg-[#005a82] text-white"
                    )}
                    onClick={() => setPagina(p)}
                  >
                    {p}
                  </Button>
                );
              })}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                disabled={pagina >= totalPaginas}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
