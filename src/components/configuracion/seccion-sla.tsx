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
import { PlusCircle, Pencil, Copy, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type Condicion = "tecnico_detenido" | "of_sobre_sla" | "tecnico_pausa_larga" | "kiosco_inactivo";

type NivelAlerta = "info" | "warning" | "critico";

interface ReglaSLA {
  id: string;
  nombre: string;
  descripcion: string | null;
  condicion: unknown;
  umbralMinutos: number;
  nivelAlerta: NivelAlerta;
  activa: boolean;
  alertasMes: number;
  totalAlertas: number;
  sucursal: { id: string; nombre: string; codigo: string };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CONDICION_LABELS: Record<Condicion, string> = {
  tecnico_detenido: "Técnico detenido",
  of_sobre_sla: "OF sobre SLA",
  tecnico_pausa_larga: "Pausa prolongada",
  kiosco_inactivo: "Kiosco inactivo",
};

const CONDICION_HINTS: Record<Condicion, string> = {
  tecnico_detenido: "Técnico sin marcaje activo por más de X minutos",
  of_sobre_sla: "Orden de trabajo que supera su fecha límite de entrega",
  tecnico_pausa_larga: "Técnico en pausa por más de X minutos",
  kiosco_inactivo: "Kiosco sin actividad registrada por más de X minutos",
};

const CONDICIONES: Condicion[] = [
  "tecnico_detenido",
  "of_sobre_sla",
  "tecnico_pausa_larga",
  "kiosco_inactivo",
];

const NIVEL_CONFIG: Record<NivelAlerta, { label: string; pill: string; dot: string }> = {
  info: {
    label: "Info",
    pill: "bg-blue-100 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
  },
  warning: {
    label: "Advertencia",
    pill: "bg-amber-100 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
  },
  critico: {
    label: "Crítica",
    pill: "bg-red-100 text-red-700 border-red-200",
    dot: "bg-red-500",
  },
};

// ── Utils ─────────────────────────────────────────────────────────────────────

function getTipo(condicion: unknown): Condicion {
  if (typeof condicion === "object" && condicion !== null && "tipo" in condicion) {
    return (condicion as { tipo: Condicion }).tipo;
  }
  return condicion as Condicion;
}

function fmtUmbral(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} h` : `${h}h ${m}m`;
}

function requiereUmbral(tipo: Condicion): boolean {
  return tipo !== "of_sobre_sla";
}

// ── Toggle switch ─────────────────────────────────────────────────────────────

function ToggleSwitch({
  checked,
  onChange,
  title,
}: {
  checked: boolean;
  onChange: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={title}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#006FA0] focus-visible:ring-offset-1",
        checked ? "bg-[#006FA0]" : "bg-slate-200"
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

// ── Nivel pill ────────────────────────────────────────────────────────────────

function NivelPill({ nivel }: { nivel: NivelAlerta }) {
  const cfg = NIVEL_CONFIG[nivel];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        cfg.pill
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
      {cfg.label}
    </span>
  );
}

// ── Regla card ────────────────────────────────────────────────────────────────

function ReglaCard({
  regla,
  onEdit,
  onDuplicate,
  onToggle,
}: {
  regla: ReglaSLA;
  onEdit: (r: ReglaSLA) => void;
  onDuplicate: (r: ReglaSLA) => void;
  onToggle: (r: ReglaSLA) => void;
}) {
  const tipo = getTipo(regla.condicion);
  const tieneUmbral = requiereUmbral(tipo);

  return (
    <div
      className={cn(
        "bg-white border rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-3",
        !regla.activa && "opacity-60"
      )}
    >
      {/* Top: nivel pill + toggle */}
      <div className="flex items-center justify-between gap-2">
        <NivelPill nivel={regla.nivelAlerta} />
        <ToggleSwitch
          checked={regla.activa}
          onChange={() => onToggle(regla)}
          title={regla.activa ? "Desactivar regla" : "Activar regla"}
        />
      </div>

      {/* Nombre + descripción */}
      <div>
        <h3 className="font-semibold text-slate-800 leading-tight">{regla.nombre}</h3>
        {regla.descripcion && (
          <p className="text-xs text-slate-500 mt-1 line-clamp-2">{regla.descripcion}</p>
        )}
      </div>

      {/* Configuración visible */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="text-slate-400">Tipo:</span>
        <span className="font-medium text-slate-700">{CONDICION_LABELS[tipo] ?? tipo}</span>
        {tieneUmbral && (
          <>
            <span className="text-slate-200">·</span>
            <span className="text-slate-400">Umbral:</span>
            <span className="font-medium text-slate-700">{fmtUmbral(regla.umbralMinutos)}</span>
          </>
        )}
        <span className="text-slate-200 ml-auto">·</span>
        <span className="text-slate-400">{regla.sucursal.nombre}</span>
      </div>

      {/* Footer: stats + actions */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-50">
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <ShieldAlert className="h-3.5 w-3.5" />
          <span>
            <span className="font-medium text-slate-600">{regla.alertasMes}</span> alertas este mes
          </span>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-slate-500 hover:text-slate-800"
            onClick={() => onEdit(regla)}
          >
            <Pencil className="h-3 w-3 mr-1" />
            Editar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-slate-500 hover:text-slate-800"
            onClick={() => onDuplicate(regla)}
          >
            <Copy className="h-3 w-3 mr-1" />
            Duplicar
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  rol: RolUsuario;
  sucursalId: string;
  sucursales: { id: string; nombre: string; codigo: string }[];
}

// ── Main component ────────────────────────────────────────────────────────────

export function SeccionSLA({ rol, sucursalId, sucursales }: Props) {
  const [reglas, setReglas] = useState<ReglaSLA[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filtroSucursal, setFiltroSucursal] = useState(rol === "ADMIN" ? "__all__" : sucursalId);
  const [filtroNivel, setFiltroNivel] = useState<string>("__all__");
  const [incluirInactivas, setIncluirInactivas] = useState(false);

  // Dialogs
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<ReglaSLA | null>(null);
  const [duplicateFrom, setDuplicateFrom] = useState<ReglaSLA | null>(null);

  const fetchReglas = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filtroSucursal !== "__all__") params.set("sucursalId", filtroSucursal);
      if (incluirInactivas) params.set("incluirInactivas", "true");
      const res = await fetch(`/api/configuracion/sla?${params}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setReglas(json.data);
    } catch {
      setError("No se pudieron cargar las reglas SLA");
    } finally {
      setLoading(false);
    }
  }, [filtroSucursal, incluirInactivas]);

  useEffect(() => {
    fetchReglas();
  }, [fetchReglas]);

  const toggleActiva = async (r: ReglaSLA) => {
    const res = await fetch(`/api/configuracion/sla/${r.id}/toggle-activa`, { method: "PATCH" });
    if (!res.ok) {
      const data = await res.json();
      toast.error(data.error ?? "Error cambiando estado");
      return;
    }
    toast.success(r.activa ? "Regla desactivada" : "Regla activada");
    fetchReglas();
  };

  const handleDuplicate = (r: ReglaSLA) => {
    setDuplicateFrom(r);
    setEditItem(null);
    setDialogOpen(true);
  };

  const handleEdit = (r: ReglaSLA) => {
    setEditItem(r);
    setDuplicateFrom(null);
    setDialogOpen(true);
  };

  const handleNew = () => {
    setEditItem(null);
    setDuplicateFrom(null);
    setDialogOpen(true);
  };

  // Filtered rules
  const reglasFiltradas = reglas.filter((r) => {
    if (filtroNivel !== "__all__" && r.nivelAlerta !== filtroNivel) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Reglas de alerta y SLA</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Configura las condiciones que generan alertas en el centro de control
          </p>
        </div>
        <Button
          size="sm"
          onClick={handleNew}
          className="gap-2 bg-[#006FA0] hover:bg-[#005a82] text-white shrink-0"
        >
          <PlusCircle className="h-4 w-4" />
          Nueva regla
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        {rol === "ADMIN" && (
          <Select value={filtroSucursal} onValueChange={setFiltroSucursal}>
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
        <Select value={filtroNivel} onValueChange={setFiltroNivel}>
          <SelectTrigger className="w-36 h-8 text-sm">
            <SelectValue placeholder="Todos los niveles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos los niveles</SelectItem>
            <SelectItem value="critico">Crítica</SelectItem>
            <SelectItem value="warning">Advertencia</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={incluirInactivas}
            onChange={(e) => setIncluirInactivas(e.target.checked)}
            className="rounded border-slate-300"
          />
          Mostrar inactivas
        </label>
        <span className="ml-auto text-xs text-slate-400">
          {reglasFiltradas.length} {reglasFiltradas.length === 1 ? "regla" : "reglas"}
        </span>
      </div>

      {/* Content */}
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : reglasFiltradas.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <ShieldAlert className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Sin reglas SLA para los filtros aplicados</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {reglasFiltradas.map((r) => (
            <ReglaCard
              key={r.id}
              regla={r}
              onEdit={handleEdit}
              onDuplicate={handleDuplicate}
              onToggle={toggleActiva}
            />
          ))}
        </div>
      )}

      {/* Dialog */}
      {dialogOpen && (
        <DialogSLA
          rol={rol}
          sucursalId={sucursalId}
          sucursales={sucursales}
          regla={editItem}
          duplicateFrom={duplicateFrom}
          onClose={() => {
            setDialogOpen(false);
            setEditItem(null);
            setDuplicateFrom(null);
          }}
          onSaved={() => {
            setDialogOpen(false);
            setEditItem(null);
            setDuplicateFrom(null);
            fetchReglas();
          }}
        />
      )}
    </div>
  );
}

// ── Dialog ────────────────────────────────────────────────────────────────────

interface DialogSLAProps {
  rol: RolUsuario;
  sucursalId: string;
  sucursales: { id: string; nombre: string; codigo: string }[];
  regla: ReglaSLA | null;
  duplicateFrom: ReglaSLA | null;
  onClose: () => void;
  onSaved: () => void;
}

function DialogSLA({
  rol,
  sucursalId,
  sucursales,
  regla,
  duplicateFrom,
  onClose,
  onSaved,
}: DialogSLAProps) {
  const editing = !!regla;
  const source = regla ?? duplicateFrom;

  const [form, setForm] = useState({
    nombre: source ? (duplicateFrom ? `Copia de ${source.nombre}` : source.nombre) : "",
    descripcion: source?.descripcion ?? "",
    condicion: source ? getTipo(source.condicion) : ("tecnico_detenido" as Condicion),
    umbralMinutos: source?.umbralMinutos ?? 30,
    nivelAlerta: (source?.nivelAlerta ?? "warning") as NivelAlerta,
    sucursalId: source?.sucursal?.id ?? (rol === "ADMIN" ? (sucursales[0]?.id ?? "") : sucursalId),
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tieneUmbral = requiereUmbral(form.condicion);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim()) {
      setError("El nombre es requerido");
      return;
    }
    if (!form.sucursalId) {
      setError("Debes seleccionar una sucursal");
      return;
    }
    if (tieneUmbral && form.umbralMinutos < 1) {
      setError("El umbral debe ser mayor a 0");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      let url: string;
      let method: string;
      let body: Record<string, unknown>;

      if (editing) {
        url = `/api/configuracion/sla/${regla!.id}`;
        method = "PUT";
        body = {
          nombre: form.nombre.trim(),
          descripcion: form.descripcion.trim() || null,
          condicion: form.condicion,
          umbralMinutos: form.umbralMinutos,
          nivelAlerta: form.nivelAlerta,
        };
      } else {
        // Create (new or duplicate)
        url = "/api/configuracion/sla";
        method = "POST";
        const condicionObj: Record<string, unknown> = { tipo: form.condicion };
        if (tieneUmbral) condicionObj.umbralMinutos = form.umbralMinutos;
        body = {
          sucursalId: form.sucursalId,
          nombre: form.nombre.trim(),
          descripcion: form.descripcion.trim() || undefined,
          condicion: condicionObj,
          umbralMinutos: form.umbralMinutos,
          nivelAlerta: form.nivelAlerta,
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

      toast.success(
        editing
          ? "Regla actualizada"
          : duplicateFrom
            ? "Regla duplicada correctamente"
            : "Regla creada correctamente"
      );
      onSaved();
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  const dialogTitle = editing
    ? `Editar regla — ${regla!.nombre}`
    : duplicateFrom
      ? `Duplicar regla — ${duplicateFrom.nombre}`
      : "Nueva regla SLA";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{dialogTitle}</DialogTitle>
          {!editing && (
            <p className="text-xs text-slate-500 mt-1">
              Configura las condiciones que generan alertas en el centro de control
            </p>
          )}
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-1">
          {/* Nombre */}
          <div>
            <label className="text-xs font-medium text-slate-600">Nombre *</label>
            <Input
              value={form.nombre}
              onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))}
              required
              className="mt-1"
            />
          </div>

          {/* Descripción */}
          <div>
            <label className="text-xs font-medium text-slate-600">Descripción</label>
            <textarea
              value={form.descripcion}
              onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))}
              rows={2}
              placeholder="Opcional — explica cuándo debe activarse esta alerta"
              maxLength={500}
              className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
            />
          </div>

          {/* Tipo de condición */}
          <div>
            <label className="text-xs font-medium text-slate-600">Tipo de condición *</label>
            <div className="grid grid-cols-1 gap-1.5 mt-1.5">
              {CONDICIONES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, condicion: c }))}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-2.5 text-left transition-all",
                    form.condicion === c
                      ? "border-[#006FA0] bg-[#006FA0]/5"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center",
                      form.condicion === c ? "border-[#006FA0]" : "border-slate-300"
                    )}
                  >
                    {form.condicion === c && <span className="h-2 w-2 rounded-full bg-[#006FA0]" />}
                  </span>
                  <div>
                    <p
                      className={cn(
                        "text-sm font-medium leading-tight",
                        form.condicion === c ? "text-[#006FA0]" : "text-slate-700"
                      )}
                    >
                      {CONDICION_LABELS[c]}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">{CONDICION_HINTS[c]}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Umbral — condicional */}
          {tieneUmbral && (
            <div>
              <label className="text-xs font-medium text-slate-600">Umbral (minutos) *</label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  type="number"
                  min={1}
                  max={1440}
                  value={form.umbralMinutos}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, umbralMinutos: Math.max(1, Number(e.target.value)) }))
                  }
                  className="w-28"
                  required
                />
                <span className="text-xs text-slate-400">= {fmtUmbral(form.umbralMinutos)}</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Tiempo mínimo antes de disparar la alerta
              </p>
            </div>
          )}

          {/* Nivel de alerta */}
          <div>
            <label className="text-xs font-medium text-slate-600">Nivel de alerta *</label>
            <div className="flex gap-2 mt-1.5">
              {(["info", "warning", "critico"] as NivelAlerta[]).map((n) => {
                const cfg = NIVEL_CONFIG[n];
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, nivelAlerta: n }))}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 rounded-lg border py-2 text-sm font-medium transition-all",
                      form.nivelAlerta === n
                        ? cn(cfg.pill, "border-current")
                        : "border-slate-200 text-slate-500 hover:bg-slate-50"
                    )}
                  >
                    <span className={cn("h-2 w-2 rounded-full", cfg.dot)} />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sucursal */}
          {!editing && (
            <div>
              <label className="text-xs font-medium text-slate-600">Sucursal *</label>
              {rol === "ADMIN" ? (
                <Select
                  value={form.sucursalId}
                  onValueChange={(v) => setForm((p) => ({ ...p, sucursalId: v }))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Selecciona una sucursal" />
                  </SelectTrigger>
                  <SelectContent>
                    {sucursales.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-slate-600 mt-1">
                  {sucursales.find((s) => s.id === sucursalId)?.nombre ?? "Tu sucursal"}
                </p>
              )}
            </div>
          )}
          {editing && (
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 border px-3 py-2 text-xs text-slate-500">
              <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
              Sucursal: <strong>{regla!.sucursal.nombre}</strong>
              <span className="text-slate-300">·</span>
              No se puede cambiar al editar
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

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
                ? "Guardando..."
                : editing
                  ? "Guardar cambios"
                  : duplicateFrom
                    ? "Crear copia"
                    : "Crear regla"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
