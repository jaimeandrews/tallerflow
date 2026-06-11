"use client";

import { useState, useEffect, useCallback } from "react";
import type { RolUsuario } from "@/generated/prisma";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { toast } from "sonner";
import {
  PlusCircle,
  MoreHorizontal,
  KeyRound,
  UserCheck,
  UserX,
  ChevronLeft,
  ChevronRight,
  Activity,
} from "lucide-react";
import { ROL_LABELS } from "@/lib/utils/constants";
import { cn } from "@/lib/utils";
import { DialogUsuario, type UsuarioParaEditar } from "./dialog-usuario";

// ── Types ─────────────────────────────────────────────────────────────────────

type Rol =
  | "ADMIN"
  | "GERENTE_SUCURSAL"
  | "JEFE_TALLER"
  | "COORDINADOR"
  | "TECNICO"
  | "CONTROL_GESTION";

interface Usuario {
  id: string;
  email: string;
  nombre: string;
  apellido: string;
  rut: string | null;
  iniciales: string;
  rol: Rol;
  sucursalId: string;
  activo: boolean;
  color: string;
  ultimoLogin: string | null;
  sucursal: { id: string; nombre: string; codigo: string } | null;
  especialidades: { especialidad: { id: string; nombre: string } }[];
}

interface UserStats {
  totalMarcajes: number;
  hhTotalMes: number;
  productividadMes: number;
  ultimoMarcaje: { horaInicio: string; actividad: string } | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TODOS_LOS_ROLES: Rol[] = [
  "ADMIN",
  "GERENTE_SUCURSAL",
  "JEFE_TALLER",
  "COORDINADOR",
  "TECNICO",
  "CONTROL_GESTION",
];

const ROL_PILL: Record<Rol, string> = {
  ADMIN: "bg-indigo-100 text-indigo-800",
  GERENTE_SUCURSAL: "bg-blue-100 text-blue-700",
  JEFE_TALLER: "bg-orange-100 text-orange-700",
  COORDINADOR: "bg-teal-100 text-teal-700",
  TECNICO: "bg-green-100 text-green-700",
  CONTROL_GESTION: "bg-slate-100 text-slate-600",
};

const POR_PAGINA = 20;

// ── Utils ─────────────────────────────────────────────────────────────────────

function formatRelativo(iso: string | null): string {
  if (!iso) return "Nunca";
  const date = new Date(iso);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffH = Math.floor(diffMs / 3_600_000);
  const diffD = Math.floor(diffMs / 86_400_000);
  if (diffMin < 2) return "hace un momento";
  if (diffMin < 60) return `hace ${diffMin}m`;
  if (diffH < 24) return `hace ${diffH}h`;
  if (diffD === 1) return "ayer";
  if (diffD < 7) return `hace ${diffD} días`;
  return date.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  rol: RolUsuario;
  sucursalId: string;
  sucursales: { id: string; nombre: string; codigo: string }[];
  userId: string;
}

// ── Main component ────────────────────────────────────────────────────────────

export function SeccionUsuarios({ rol, sucursalId, sucursales, userId }: Props) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [busqueda, setBusqueda] = useState("");
  const [debouncedBusqueda, setDebouncedBusqueda] = useState("");
  const [filtroRol, setFiltroRol] = useState("__all__");
  const [filtroSucursal, setFiltroSucursal] = useState("__all__");
  const [filtroActivo, setFiltroActivo] = useState(true);

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [editItem, setEditItem] = useState<UsuarioParaEditar | null>(null);
  const [statsItem, setStatsItem] = useState<Usuario | null>(null);
  const [resetPinItem, setResetPinItem] = useState<Usuario | null>(null);

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedBusqueda(busqueda);
      setPagina(1);
    }, 400);
    return () => clearTimeout(t);
  }, [busqueda]);

  const fetchUsuarios = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ pagina: String(pagina), porPagina: String(POR_PAGINA) });
      if (debouncedBusqueda) params.set("busqueda", debouncedBusqueda);
      if (filtroRol !== "__all__") params.set("rol", filtroRol);
      if (filtroSucursal !== "__all__") params.set("sucursalId", filtroSucursal);
      if (!filtroActivo) params.set("activo", "false");
      else params.set("activo", "true");
      const res = await fetch(`/api/configuracion/usuarios?${params}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setUsuarios(json.data);
      setTotal(json.total);
    } catch {
      setError("No se pudieron cargar los usuarios");
    } finally {
      setLoading(false);
    }
  }, [pagina, debouncedBusqueda, filtroRol, filtroSucursal, filtroActivo]);

  useEffect(() => {
    fetchUsuarios();
  }, [fetchUsuarios]);

  const toggleActivo = async (u: Usuario) => {
    const res = await fetch(`/api/configuracion/usuarios/${u.id}/toggle-activo`, {
      method: "PATCH",
    });
    if (!res.ok) {
      toast.error("Error cambiando estado del usuario");
      return;
    }
    toast.success(u.activo ? "Usuario desactivado" : "Usuario activado");
    fetchUsuarios();
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Gestión de usuarios</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {total} {total === 1 ? "usuario" : "usuarios"}
            {!filtroActivo && " inactivos"}
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setCreateOpen(true)}
          className="gap-2 bg-[#006FA0] hover:bg-[#005a82] text-white shrink-0"
        >
          <PlusCircle className="h-4 w-4" />
          Nuevo usuario
        </Button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <Input
          placeholder="Buscar por nombre, email, RUT..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="max-w-xs h-8 text-sm"
        />
        <Select
          value={filtroRol}
          onValueChange={(v) => {
            setFiltroRol(v);
            setPagina(1);
          }}
        >
          <SelectTrigger className="w-44 h-8 text-sm">
            <SelectValue placeholder="Todos los roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos los roles</SelectItem>
            {TODOS_LOS_ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {ROL_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {rol === "ADMIN" && (
          <Select
            value={filtroSucursal}
            onValueChange={(v) => {
              setFiltroSucursal(v);
              setPagina(1);
            }}
          >
            <SelectTrigger className="w-44 h-8 text-sm">
              <SelectValue placeholder="Todas las sucursales" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas las sucursales</SelectItem>
              {sucursales.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none ml-1">
          <input
            type="checkbox"
            checked={!filtroActivo}
            onChange={(e) => {
              setFiltroActivo(!e.target.checked);
              setPagina(1);
            }}
            className="rounded border-slate-300"
          />
          Mostrar inactivos
        </label>
      </div>

      {/* Table */}
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-md" />
          ))}
        </div>
      ) : (
        <>
          <div className="border rounded-lg overflow-hidden bg-white">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Usuario</TableHead>
                  <TableHead>RUT</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Sucursal</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Último acceso</TableHead>
                  <TableHead className="text-right w-10">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usuarios.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-slate-400 py-10">
                      Sin resultados para los filtros aplicados
                    </TableCell>
                  </TableRow>
                ) : (
                  usuarios.map((u) => (
                    <TableRow key={u.id} className={cn(!u.activo && "opacity-60 bg-slate-50")}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarFallback
                              style={{ backgroundColor: u.color }}
                              className="text-white text-xs font-semibold"
                            >
                              {u.iniciales}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800 leading-tight">
                              {u.nombre} {u.apellido}
                            </p>
                            <p className="text-xs text-slate-400 truncate">{u.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-slate-500">{u.rut}</TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                            ROL_PILL[u.rol]
                          )}
                        >
                          {ROL_LABELS[u.rol]}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {u.sucursal ? (
                          <div>
                            <p className="leading-tight">{u.sucursal.nombre}</p>
                            <p className="text-[10px] text-slate-400 font-mono">
                              {u.sucursal.codigo}
                            </p>
                          </div>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              "h-2 w-2 rounded-full shrink-0",
                              u.activo ? "bg-green-500" : "bg-slate-300"
                            )}
                          />
                          <span className="text-xs text-slate-600">
                            {u.activo ? "Activo" : "Inactivo"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-slate-400">
                        {formatRelativo(u.ultimoLogin)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem onClick={() => setEditItem(u as UsuarioParaEditar)}>
                              Editar
                            </DropdownMenuItem>
                            {u.rol === "TECNICO" && (
                              <DropdownMenuItem onClick={() => setResetPinItem(u)}>
                                <KeyRound className="h-3.5 w-3.5 mr-2" />
                                Reset PIN
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => setStatsItem(u)}>
                              <Activity className="h-3.5 w-3.5 mr-2" />
                              Ver actividad
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => toggleActivo(u)}
                              disabled={u.id === userId}
                              className={
                                u.activo
                                  ? "text-amber-600 focus:text-amber-700"
                                  : "text-green-600 focus:text-green-700"
                              }
                            >
                              {u.activo ? (
                                <>
                                  <UserX className="h-3.5 w-3.5 mr-2" /> Desactivar
                                </>
                              ) : (
                                <>
                                  <UserCheck className="h-3.5 w-3.5 mr-2" /> Activar
                                </>
                              )}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">
              {total} {total === 1 ? "usuario" : "usuarios"} · página {pagina} de {totalPaginas}
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

      {/* Create dialog */}
      {createOpen && (
        <DialogUsuario
          callerRol={rol}
          callerSucursalId={sucursalId}
          callerId={userId}
          sucursales={sucursales}
          onClose={() => setCreateOpen(false)}
          onSaved={() => {
            setCreateOpen(false);
            fetchUsuarios();
          }}
        />
      )}

      {/* Edit dialog */}
      {editItem && (
        <DialogUsuario
          usuario={editItem}
          callerRol={rol}
          callerSucursalId={sucursalId}
          callerId={userId}
          sucursales={sucursales}
          onClose={() => setEditItem(null)}
          onSaved={() => {
            setEditItem(null);
            fetchUsuarios();
          }}
        />
      )}

      {/* Stats dialog */}
      {statsItem && <StatsDialog usuario={statsItem} onClose={() => setStatsItem(null)} />}

      {/* Reset PIN dialog */}
      {resetPinItem && (
        <ResetPinDialog
          usuario={resetPinItem}
          onClose={() => setResetPinItem(null)}
          onReset={() => setResetPinItem(null)}
        />
      )}
    </div>
  );
}

// ── StatsDialog ───────────────────────────────────────────────────────────────

function StatsDialog({ usuario, onClose }: { usuario: Usuario; onClose: () => void }) {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/configuracion/usuarios/${usuario.id}`)
      .then((r) => r.json())
      .then((j) => setStats(j.estadisticas))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [usuario.id]);

  const fmtFecha = (iso: string) =>
    new Date(iso).toLocaleString("es-CL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            Actividad — {usuario.nombre} {usuario.apellido}
          </DialogTitle>
        </DialogHeader>
        <div className="mt-2 space-y-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback
                style={{ backgroundColor: usuario.color }}
                className="text-white text-sm font-semibold"
              >
                {usuario.iniciales}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-medium text-slate-800">{usuario.email}</p>
              <p className="text-xs text-slate-400">{ROL_LABELS[usuario.rol]}</p>
            </div>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-10 rounded" />
              ))}
            </div>
          ) : stats ? (
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Total marcajes" value={stats.totalMarcajes} />
              <StatCard label="HH este mes" value={`${stats.hhTotalMes.toFixed(1)} h`} />
              <StatCard label="Productividad mes" value={`${stats.productividadMes}%`} />
              <StatCard
                label="Último marcaje"
                value={stats.ultimoMarcaje ? fmtFecha(stats.ultimoMarcaje.horaInicio) : "—"}
                sub={stats.ultimoMarcaje?.actividad}
              />
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-4">Sin datos disponibles</p>
          )}
        </div>
        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-slate-50 border rounded-lg p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-base font-semibold text-slate-800 mt-0.5 truncate">{value}</p>
      {sub && <p className="text-xs text-slate-400 truncate">{sub}</p>}
    </div>
  );
}

// ── ResetPinDialog ────────────────────────────────────────────────────────────

function ResetPinDialog({
  usuario,
  onClose,
  onReset,
}: {
  usuario: Usuario;
  onClose: () => void;
  onReset: () => void;
}) {
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/configuracion/usuarios/${usuario.id}/reset-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nuevoPin: pin }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Error al resetear PIN");
        return;
      }
      toast.success("PIN actualizado correctamente");
      onReset();
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>
            Resetear PIN
            <span className="block text-sm font-normal text-slate-500 mt-0.5">
              {usuario.nombre} {usuario.apellido}
            </span>
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 mt-2">
          <div>
            <label className="text-xs font-medium text-slate-600">Nuevo PIN (4 dígitos) *</label>
            <Input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              required
              maxLength={4}
              placeholder="0000"
              className="mt-1 font-mono text-center text-xl tracking-[0.5em]"
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving || pin.length !== 4}
              className="bg-[#006FA0] hover:bg-[#005a82] text-white"
            >
              {saving ? "Guardando..." : "Guardar PIN"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
