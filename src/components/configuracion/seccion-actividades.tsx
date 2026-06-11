"use client";

import { useState, useEffect, useCallback } from "react";
import type { RolUsuario } from "@/generated/prisma";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { toast } from "sonner";
import {
  PlusCircle,
  Pencil,
  Wrench,
  Activity,
  Flag,
  Package,
  Coffee,
  Users,
  Timer,
  Zap,
  Clock,
  HardHat,
  Layers,
  Gauge,
  Hammer,
  Truck,
  Pause,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { COLORES_PALETA } from "@/lib/services/configuracion-usuarios-service";

// ── Icons registry ────────────────────────────────────────────────────────────

type IconId =
  | "wrench"
  | "activity"
  | "flag"
  | "package"
  | "coffee"
  | "users"
  | "timer"
  | "zap"
  | "clock"
  | "hard-hat"
  | "layers"
  | "gauge"
  | "hammer"
  | "truck"
  | "pause";

const ICONOS: { id: IconId; label: string; Icon: React.ElementType }[] = [
  { id: "wrench", label: "Herramienta", Icon: Wrench },
  { id: "hammer", label: "Martillo", Icon: Hammer },
  { id: "activity", label: "Actividad", Icon: Activity },
  { id: "gauge", label: "Medición", Icon: Gauge },
  { id: "layers", label: "Proceso", Icon: Layers },
  { id: "hard-hat", label: "Taller", Icon: HardHat },
  { id: "package", label: "Repuesto", Icon: Package },
  { id: "truck", label: "Despacho", Icon: Truck },
  { id: "coffee", label: "Descanso", Icon: Coffee },
  { id: "pause", label: "Pausa", Icon: Pause },
  { id: "users", label: "Reunión", Icon: Users },
  { id: "flag", label: "Revisión", Icon: Flag },
  { id: "zap", label: "Urgente", Icon: Zap },
  { id: "timer", label: "Tiempo", Icon: Timer },
  { id: "clock", label: "Reloj", Icon: Clock },
];

const ICONO_MAP = Object.fromEntries(ICONOS.map(({ id, Icon }) => [id, Icon])) as Record<
  string,
  React.ElementType
>;

function ActividadIcon({ id, className }: { id: string | null; className?: string }) {
  const Icon = id ? (ICONO_MAP[id] ?? Wrench) : Wrench;
  return <Icon className={className ?? "h-4 w-4"} />;
}

// ── Toggle switch ─────────────────────────────────────────────────────────────

function ToggleSwitch({
  checked,
  onChange,
  disabled,
  title,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={title}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#006FA0] focus-visible:ring-offset-1",
        checked ? "bg-[#006FA0]" : "bg-slate-200",
        disabled && "opacity-40 cursor-not-allowed"
      )}
    >
      <span
        className={cn(
          "inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-200",
          checked ? "translate-x-[18px]" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Actividad {
  id: string;
  nombre: string;
  icono: string | null;
  color: string;
  productiva: boolean;
  activa: boolean;
  sucursalId: string | null;
  alcance: "global" | "sucursal";
  marcajesMes: number;
  hhTotalMes: number;
}

interface Props {
  rol: RolUsuario;
  sucursalId: string;
  sucursales: { id: string; nombre: string; codigo: string }[];
}

// ── Group header ──────────────────────────────────────────────────────────────

function GroupHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 px-1 py-0.5 mb-1">
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
      <span className="text-xs text-slate-400">({count})</span>
      <div className="flex-1 border-t border-slate-100" />
    </div>
  );
}

// ── Activity row ──────────────────────────────────────────────────────────────

function ActividadFila({
  actividad,
  onEdit,
  onToggle,
}: {
  actividad: Actividad;
  onEdit: (a: Actividad) => void;
  onToggle: (a: Actividad) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-white px-4 py-3 transition-opacity",
        !actividad.activa && "opacity-55"
      )}
    >
      {/* Color dot */}
      <span
        className="h-3 w-3 rounded-full shrink-0"
        style={{ backgroundColor: actividad.color }}
      />

      {/* Icon */}
      <span className="shrink-0 text-slate-500" style={{ color: actividad.color }}>
        <ActividadIcon id={actividad.icono} className="h-4 w-4" />
      </span>

      {/* Nombre */}
      <span className="flex-1 min-w-0 text-sm font-medium text-slate-800 truncate">
        {actividad.nombre}
      </span>

      {/* Alcance pill */}
      {actividad.alcance === "global" && (
        <span className="hidden sm:inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-600">
          Global
        </span>
      )}

      {/* Marcajes mes */}
      <span className="hidden md:block text-xs text-slate-400 whitespace-nowrap">
        {actividad.marcajesMes} marcajes/mes
      </span>

      {/* Toggle switch */}
      <ToggleSwitch
        checked={actividad.activa}
        onChange={() => onToggle(actividad)}
        title={actividad.activa ? "Desactivar actividad" : "Activar actividad"}
      />

      {/* Edit button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={() => onEdit(actividad)}
        title="Editar actividad"
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SeccionActividades({ rol, sucursalId, sucursales }: Props) {
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [incluirInactivas, setIncluirInactivas] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editItem, setEditItem] = useState<Actividad | null>(null);

  const fetchActividades = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (incluirInactivas) params.set("incluirInactivas", "true");
      const res = await fetch(`/api/configuracion/actividades?${params}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setActividades(json.data);
    } catch {
      setError("No se pudieron cargar las actividades");
    } finally {
      setLoading(false);
    }
  }, [incluirInactivas]);

  useEffect(() => {
    fetchActividades();
  }, [fetchActividades]);

  const toggleActiva = async (a: Actividad) => {
    const res = await fetch(`/api/configuracion/actividades/${a.id}/toggle-activa`, {
      method: "PATCH",
    });
    if (!res.ok) {
      const data = await res.json();
      toast.error(data.error ?? "Error cambiando estado");
      return;
    }
    const data = await res.json();
    toast.success(data.activa ? "Actividad activada" : "Actividad desactivada");
    fetchActividades();
  };

  const productivas = actividades.filter((a) => a.productiva);
  const noProductivas = actividades.filter((a) => !a.productiva);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Catálogo de actividades</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {productivas.length} productivas · {noProductivas.length} no productivas
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={incluirInactivas}
              onChange={(e) => setIncluirInactivas(e.target.checked)}
              className="rounded border-slate-300"
            />
            Mostrar inactivas
          </label>
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
            className="gap-2 bg-[#006FA0] hover:bg-[#005a82] text-white"
          >
            <PlusCircle className="h-4 w-4" />
            Nueva actividad
          </Button>
        </div>
      </div>

      {/* Content */}
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : actividades.length === 0 ? (
        <p className="text-sm text-slate-400 py-8 text-center">Sin actividades registradas</p>
      ) : (
        <div className="space-y-6">
          {/* Productivas */}
          {productivas.length > 0 && (
            <div className="space-y-1.5">
              <GroupHeader label="Productivas" count={productivas.length} />
              {productivas.map((a) => (
                <ActividadFila
                  key={a.id}
                  actividad={a}
                  onEdit={setEditItem}
                  onToggle={toggleActiva}
                />
              ))}
            </div>
          )}

          {/* No productivas */}
          {noProductivas.length > 0 && (
            <div className="space-y-1.5">
              <GroupHeader label="No productivas" count={noProductivas.length} />
              {noProductivas.map((a) => (
                <ActividadFila
                  key={a.id}
                  actividad={a}
                  onEdit={setEditItem}
                  onToggle={toggleActiva}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Dialogs */}
      {createOpen && (
        <DialogActividad
          rol={rol}
          sucursalId={sucursalId}
          sucursales={sucursales}
          actividad={null}
          onClose={() => setCreateOpen(false)}
          onSaved={() => {
            setCreateOpen(false);
            fetchActividades();
          }}
        />
      )}

      {editItem && (
        <DialogActividad
          rol={rol}
          sucursalId={sucursalId}
          sucursales={sucursales}
          actividad={editItem}
          onClose={() => setEditItem(null)}
          onSaved={() => {
            setEditItem(null);
            fetchActividades();
          }}
        />
      )}
    </div>
  );
}

// ── Dialog crear / editar ─────────────────────────────────────────────────────

interface DialogActividadProps {
  rol: RolUsuario;
  sucursalId: string;
  sucursales: { id: string; nombre: string; codigo: string }[];
  actividad: Actividad | null;
  onClose: () => void;
  onSaved: () => void;
}

function DialogActividad({
  rol,
  sucursalId,
  sucursales,
  actividad,
  onClose,
  onSaved,
}: DialogActividadProps) {
  const editing = !!actividad;

  const [form, setForm] = useState({
    nombre: actividad?.nombre ?? "",
    color: actividad?.color ?? COLORES_PALETA[0],
    icono: (actividad?.icono ?? "wrench") as IconId,
    productiva: actividad?.productiva ?? true,
    sucursalId: actividad?.sucursalId ?? (rol === "ADMIN" ? "__global__" : sucursalId),
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim()) {
      setError("El nombre es requerido");
      return;
    }
    setSaving(true);
    setError(null);
    setWarnings([]);
    try {
      let url: string;
      let method: string;
      let body: Record<string, unknown>;

      if (editing) {
        url = `/api/configuracion/actividades/${actividad!.id}`;
        method = "PUT";
        body = {};
        if (form.nombre !== actividad!.nombre) body.nombre = form.nombre.trim();
        if (form.color !== actividad!.color) body.color = form.color;
        if (form.icono !== actividad!.icono) body.icono = form.icono;
        if (form.productiva !== actividad!.productiva) body.productiva = form.productiva;
        if (Object.keys(body).length === 0) {
          onClose();
          return;
        }
      } else {
        url = "/api/configuracion/actividades";
        method = "POST";
        body = {
          nombre: form.nombre.trim(),
          color: form.color,
          icono: form.icono,
          productiva: form.productiva,
          sucursalId: form.sucursalId === "__global__" ? null : form.sucursalId,
        };
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Error al guardar");
        return;
      }

      const data = await res.json();
      if (data.warnings?.length > 0) {
        setWarnings(data.warnings);
        toast.warning("Actividad actualizada con advertencias");
      } else {
        toast.success(editing ? "Actividad actualizada" : "Actividad creada");
      }
      onSaved();
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  const previewIcon = ICONO_MAP[form.icono] as React.ElementType | undefined;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing ? `Editar actividad — ${actividad!.nombre}` : "Nueva actividad"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-1">
          {/* Nombre */}
          <div>
            <label className="text-xs font-medium text-slate-600">Nombre *</label>
            <Input
              value={form.nombre}
              onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))}
              required
              className="mt-1"
              placeholder="Ej: Mantenimiento preventivo"
            />
          </div>

          {/* Color */}
          <div>
            <label className="text-xs font-medium text-slate-600">Color *</label>
            <div className="flex gap-2 flex-wrap mt-1.5">
              {COLORES_PALETA.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={cn(
                    "h-7 w-7 rounded-full border-2 transition-all",
                    form.color === c
                      ? "border-slate-800 scale-110 shadow-md"
                      : "border-white shadow-sm hover:scale-105"
                  )}
                  style={{ backgroundColor: c }}
                  onClick={() => setForm((p) => ({ ...p, color: c }))}
                />
              ))}
            </div>
          </div>

          {/* Icono */}
          <div>
            <label className="text-xs font-medium text-slate-600">Icono</label>
            <div className="grid grid-cols-5 gap-1.5 mt-1.5">
              {ICONOS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  title={label}
                  onClick={() => setForm((p) => ({ ...p, icono: id }))}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border p-2 text-[10px] transition-all",
                    form.icono === id
                      ? "border-[#006FA0] bg-[#006FA0]/5 text-[#006FA0]"
                      : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="leading-tight">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2.5 border">
            <span
              className="h-3 w-3 rounded-full shrink-0"
              style={{ backgroundColor: form.color }}
            />
            {previewIcon && (
              <span style={{ color: form.color }}>
                {(() => {
                  const I = previewIcon;
                  return <I className="h-4 w-4" />;
                })()}
              </span>
            )}
            <span className="text-sm font-medium text-slate-700">
              {form.nombre || <span className="text-slate-400 italic">Nombre de actividad</span>}
            </span>
            <span
              className={cn(
                "ml-auto text-xs font-medium px-2 py-0.5 rounded-full",
                form.productiva ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
              )}
            >
              {form.productiva ? "Productiva" : "No productiva"}
            </span>
          </div>

          {/* Productiva toggle */}
          <div>
            <label className="text-xs font-medium text-slate-600">Tipo de actividad</label>
            <div className="flex gap-2 mt-1.5">
              <Button
                type="button"
                size="sm"
                variant={form.productiva ? "default" : "outline"}
                onClick={() => setForm((p) => ({ ...p, productiva: true }))}
                className={cn(
                  "transition-colors",
                  form.productiva
                    ? "bg-green-600 hover:bg-green-700 text-white border-green-600"
                    : ""
                )}
              >
                Productiva
              </Button>
              <Button
                type="button"
                size="sm"
                variant={!form.productiva ? "default" : "outline"}
                onClick={() => setForm((p) => ({ ...p, productiva: false }))}
                className={cn(
                  "transition-colors",
                  !form.productiva
                    ? "bg-slate-600 hover:bg-slate-700 text-white border-slate-600"
                    : ""
                )}
              >
                No productiva
              </Button>
            </div>
            {editing && form.productiva !== actividad!.productiva && (
              <p className="text-xs text-amber-600 mt-1.5">
                ⚠ Cambiar este campo afectará el cálculo de productividad histórica.
              </p>
            )}
          </div>

          {/* Sucursal — solo en creación */}
          {!editing && (
            <div>
              <label className="text-xs font-medium text-slate-600">Ámbito</label>
              {rol === "ADMIN" ? (
                <Select
                  value={form.sucursalId}
                  onValueChange={(v) => setForm((p) => ({ ...p, sucursalId: v }))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__global__">Todas las sucursales (global)</SelectItem>
                    {sucursales.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-slate-500 mt-1">
                  {sucursales.find((s) => s.id === sucursalId)?.nombre ?? "Tu sucursal"}
                </p>
              )}
            </div>
          )}

          {/* Warnings from API */}
          {warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-0.5">
              {warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-700">
                  ⚠ {w}
                </p>
              ))}
            </div>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}

          <DialogFooter className="pt-3 border-t">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-[#006FA0] hover:bg-[#005a82] text-white"
            >
              {saving
                ? editing
                  ? "Guardando..."
                  : "Creando..."
                : editing
                  ? "Guardar cambios"
                  : "Crear actividad"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
