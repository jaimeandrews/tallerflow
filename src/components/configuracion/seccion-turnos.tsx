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
import { PlusCircle, Pencil, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Turno {
  id: string;
  nombre: string;
  horaInicio: string;
  horaFin: string;
  sucursalId: string;
  activo: boolean;
  totalMarcajes: number;
  tecnicosMes: number;
  sucursal: { id: string; nombre: string; codigo: string } | null;
}

interface Props {
  rol: RolUsuario;
  sucursalId: string;
  sucursales: { id: string; nombre: string; codigo: string }[];
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function duracion(ini: string, fin: string): string {
  const [h1, m1] = ini.split(":").map(Number);
  const [h2, m2] = fin.split(":").map(Number);
  const mins = h2 * 60 + m2 - (h1 * 60 + m1);
  if (mins <= 0) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} h` : `${h}h ${m}m`;
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

// ── Turno card ────────────────────────────────────────────────────────────────

function TurnoCard({
  turno,
  onEdit,
  onToggle,
}: {
  turno: Turno;
  onEdit: (t: Turno) => void;
  onToggle: (t: Turno) => void;
}) {
  const dur = duracion(turno.horaInicio, turno.horaFin);

  return (
    <div
      className={cn(
        "bg-white border rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-3",
        !turno.activo && "opacity-60"
      )}
    >
      {/* Top: nombre + toggle + edit */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-slate-800 leading-tight">{turno.nombre}</h3>
          <p className={cn("text-xs mt-0.5", turno.activo ? "text-green-600" : "text-slate-400")}>
            {turno.activo ? "Activo" : "Inactivo"}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <ToggleSwitch
            checked={turno.activo}
            onChange={() => onToggle(turno)}
            title={turno.activo ? "Desactivar turno" : "Activar turno"}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-slate-400 hover:text-slate-700"
            onClick={() => onEdit(turno)}
            title="Editar turno"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Time range visual */}
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-slate-300 shrink-0" />
        <span className="font-mono text-xl font-bold text-slate-800 tabular-nums">
          {turno.horaInicio}
        </span>
        <div className="flex-1 relative flex items-center">
          <div className="w-full border-t-2 border-dashed border-slate-200" />
          {dur && (
            <span className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-medium text-slate-400 bg-white px-1.5 leading-none">
              {dur}
            </span>
          )}
        </div>
        <span className="font-mono text-xl font-bold text-slate-800 tabular-nums">
          {turno.horaFin}
        </span>
      </div>

      {/* Stats footer */}
      <div className="flex items-center gap-2 pt-2 border-t border-slate-50 text-xs text-slate-400">
        <span>{turno.totalMarcajes} marcajes totales</span>
        <span className="text-slate-200">·</span>
        <span>{turno.tecnicosMes} técnicos este mes</span>
      </div>
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SucursalHeader({ nombre, count }: { nombre: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mt-2">
      <span className="text-sm font-semibold text-slate-600">{nombre}</span>
      <span className="text-xs text-slate-400">
        ({count} {count === 1 ? "turno" : "turnos"})
      </span>
      <div className="flex-1 border-t border-slate-200" />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SeccionTurnos({ rol, sucursalId, sucursales }: Props) {
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [filtroSucursal, setFiltroSucursal] = useState(rol === "ADMIN" ? "__all__" : sucursalId);
  const [incluirInactivos, setIncluirInactivos] = useState(false);

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [editItem, setEditItem] = useState<Turno | null>(null);

  // Default sucursalId for new turno when ADMIN has "all" selected
  const defaultNuevoSucursalId =
    filtroSucursal !== "__all__" ? filtroSucursal : (sucursales[0]?.id ?? "");

  const fetchTurnos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filtroSucursal !== "__all__") params.set("sucursalId", filtroSucursal);
      if (incluirInactivos) params.set("incluirInactivos", "true");
      const res = await fetch(`/api/configuracion/turnos?${params}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setTurnos(json.data);
    } catch {
      setError("No se pudieron cargar los turnos");
    } finally {
      setLoading(false);
    }
  }, [filtroSucursal, incluirInactivos]);

  useEffect(() => {
    fetchTurnos();
  }, [fetchTurnos]);

  const toggleActivo = async (t: Turno) => {
    const res = await fetch(`/api/configuracion/turnos/${t.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: !t.activo }),
    });
    if (!res.ok) {
      const data = await res.json();
      toast.error(data.error ?? "Error cambiando estado del turno");
      return;
    }
    toast.success(t.activo ? "Turno desactivado" : "Turno activado");
    fetchTurnos();
  };

  // Group by sucursal when showing all (ADMIN)
  const gruposMap = new Map<string, { nombre: string; turnos: Turno[] }>();
  for (const t of turnos) {
    const key = t.sucursalId;
    if (!gruposMap.has(key)) {
      gruposMap.set(key, {
        nombre: t.sucursal?.nombre ?? key,
        turnos: [],
      });
    }
    gruposMap.get(key)!.turnos.push(t);
  }
  const grupos = Array.from(gruposMap.values());
  const showGroups = filtroSucursal === "__all__" && grupos.length > 1;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Turnos</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {turnos.length} {turnos.length === 1 ? "turno configurado" : "turnos configurados"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={incluirInactivos}
              onChange={(e) => setIncluirInactivos(e.target.checked)}
              className="rounded border-slate-300"
            />
            Mostrar inactivos
          </label>
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
            className="gap-2 bg-[#006FA0] hover:bg-[#005a82] text-white"
          >
            <PlusCircle className="h-4 w-4" />
            Nuevo turno
          </Button>
        </div>
      </div>

      {/* Sucursal filter — ADMIN only */}
      {rol === "ADMIN" && (
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-500 shrink-0">Sucursal</label>
          <Select value={filtroSucursal} onValueChange={setFiltroSucursal}>
            <SelectTrigger className="w-52 h-8 text-sm">
              <SelectValue />
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
        </div>
      )}

      {/* Content */}
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : turnos.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <Clock className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Sin turnos configurados</p>
          {filtroSucursal !== "__all__" && <p className="text-xs mt-1">para esta sucursal</p>}
        </div>
      ) : showGroups ? (
        // All sucursales grouped
        <div className="space-y-5">
          {grupos.map((g) => (
            <div key={g.nombre} className="space-y-2">
              <SucursalHeader nombre={g.nombre} count={g.turnos.length} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {g.turnos.map((t) => (
                  <TurnoCard key={t.id} turno={t} onEdit={setEditItem} onToggle={toggleActivo} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Single sucursal (or only one group)
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {turnos.map((t) => (
            <TurnoCard key={t.id} turno={t} onEdit={setEditItem} onToggle={toggleActivo} />
          ))}
        </div>
      )}

      {/* Dialogs */}
      {createOpen && (
        <DialogTurno
          rol={rol}
          defaultSucursalId={defaultNuevoSucursalId}
          sucursales={sucursales}
          turno={null}
          onClose={() => setCreateOpen(false)}
          onSaved={() => {
            setCreateOpen(false);
            fetchTurnos();
          }}
        />
      )}

      {editItem && (
        <DialogTurno
          rol={rol}
          defaultSucursalId={editItem.sucursalId}
          sucursales={sucursales}
          turno={editItem}
          onClose={() => setEditItem(null)}
          onSaved={() => {
            setEditItem(null);
            fetchTurnos();
          }}
        />
      )}
    </div>
  );
}

// ── Dialog crear / editar ─────────────────────────────────────────────────────

interface DialogTurnoProps {
  rol: RolUsuario;
  defaultSucursalId: string;
  sucursales: { id: string; nombre: string; codigo: string }[];
  turno: Turno | null;
  onClose: () => void;
  onSaved: () => void;
}

function DialogTurno({
  rol,
  defaultSucursalId,
  sucursales,
  turno,
  onClose,
  onSaved,
}: DialogTurnoProps) {
  const editing = !!turno;

  const [form, setForm] = useState({
    nombre: turno?.nombre ?? "",
    horaInicio: turno?.horaInicio ?? "08:00",
    horaFin: turno?.horaFin ?? "17:00",
    sucursalId: turno?.sucursalId ?? defaultSucursalId,
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dur = duracion(form.horaInicio, form.horaFin);
  const durInvalid = form.horaInicio >= form.horaFin;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim()) {
      setError("El nombre es requerido");
      return;
    }
    if (durInvalid) {
      setError("La hora de inicio debe ser anterior a la hora de fin");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const url = editing ? `/api/configuracion/turnos/${turno!.id}` : "/api/configuracion/turnos";
      const method = editing ? "PUT" : "POST";

      const body: Record<string, unknown> = {
        nombre: form.nombre.trim(),
        horaInicio: form.horaInicio,
        horaFin: form.horaFin,
      };
      if (!editing) body.sucursalId = form.sucursalId;

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

      toast.success(editing ? "Turno actualizado" : "Turno creado");
      onSaved();
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{editing ? `Editar turno — ${turno!.nombre}` : "Nuevo turno"}</DialogTitle>
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
              placeholder="Ej: Turno mañana"
            />
          </div>

          {/* Hora inicio + fin */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600">Hora inicio *</label>
              <Input
                type="time"
                value={form.horaInicio}
                onChange={(e) => setForm((p) => ({ ...p, horaInicio: e.target.value }))}
                required
                className="mt-1 font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Hora fin *</label>
              <Input
                type="time"
                value={form.horaFin}
                onChange={(e) => setForm((p) => ({ ...p, horaFin: e.target.value }))}
                required
                className="mt-1 font-mono"
              />
            </div>
          </div>

          {/* Duration preview */}
          {!durInvalid && dur && (
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 border px-3 py-2.5">
              <Clock className="h-4 w-4 text-slate-400 shrink-0" />
              <span className="font-mono text-base font-bold text-slate-800">
                {form.horaInicio}
              </span>
              <div className="flex-1 border-t border-dashed border-slate-300" />
              <span className="text-xs text-slate-400">{dur}</span>
              <div className="flex-1 border-t border-dashed border-slate-300" />
              <span className="font-mono text-base font-bold text-slate-800">{form.horaFin}</span>
            </div>
          )}

          {/* Sucursal — solo en creación y solo ADMIN */}
          {!editing && rol === "ADMIN" && (
            <div>
              <label className="text-xs font-medium text-slate-600">Sucursal *</label>
              <Select
                value={form.sucursalId}
                onValueChange={(v) => setForm((p) => ({ ...p, sucursalId: v }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sucursales.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {!editing && rol !== "ADMIN" && (
            <div>
              <label className="text-xs font-medium text-slate-600">Sucursal</label>
              <p className="text-sm text-slate-600 mt-1">
                {sucursales.find((s) => s.id === defaultSucursalId)?.nombre ?? "Tu sucursal"}
              </p>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2.5 py-1.5">
              {error}
            </p>
          )}

          <DialogFooter className="pt-3 border-t">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving || durInvalid}
              className="bg-[#006FA0] hover:bg-[#005a82] text-white"
            >
              {saving
                ? editing
                  ? "Guardando..."
                  : "Creando..."
                : editing
                  ? "Guardar cambios"
                  : "Crear turno"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
