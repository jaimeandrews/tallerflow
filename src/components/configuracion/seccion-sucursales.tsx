"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Pencil, HardHat, ClipboardList, ClipboardCheck, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Sucursal {
  id: string;
  nombre: string;
  codigo: string;
  activa: boolean;
  totalUsuarios: number;
  totalOF: number;
  totalOFActivas: number;
  totalTecnicos: number;
}

// ── Stat chip ─────────────────────────────────────────────────────────────────

function Stat({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 py-2">
      <div className={cn("flex items-center gap-1", accent ? "text-[#006FA0]" : "text-slate-500")}>
        <Icon className="h-3.5 w-3.5" />
        <span
          className={cn(
            "text-lg font-bold leading-none",
            accent ? "text-[#006FA0]" : "text-slate-800"
          )}
        >
          {value}
        </span>
      </div>
      <span className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</span>
    </div>
  );
}

// ── Sucursal card ─────────────────────────────────────────────────────────────

function SucursalCard({ sucursal, onEdit }: { sucursal: Sucursal; onEdit: (s: Sucursal) => void }) {
  return (
    <div
      className={cn(
        "bg-white border rounded-xl p-4 flex flex-col gap-3 shadow-sm transition-shadow hover:shadow-md",
        !sucursal.activa && "opacity-70"
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-slate-800 leading-tight">{sucursal.nombre}</h3>
            <span className="font-mono text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
              {sucursal.codigo}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span
              className={cn(
                "h-2 w-2 rounded-full shrink-0",
                sucursal.activa ? "bg-green-500" : "bg-slate-300"
              )}
            />
            <span className="text-xs text-slate-500">
              {sucursal.activa ? "Activa" : "Inactiva"}
            </span>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-slate-400 hover:text-slate-700"
          onClick={() => onEdit(sucursal)}
          title="Editar sucursal"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Divider */}
      <div className="border-t border-slate-100" />

      {/* Stats */}
      <div className="grid grid-cols-3 divide-x divide-slate-100">
        <Stat icon={HardHat} label="Técnicos" value={sucursal.totalTecnicos} accent />
        <Stat icon={ClipboardCheck} label="OF activas" value={sucursal.totalOFActivas} />
        <Stat icon={ClipboardList} label="OF totales" value={sucursal.totalOF} />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SeccionSucursales() {
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<Sucursal | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const fetchSucursales = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/configuracion/sucursales");
      if (!res.ok) throw new Error();
      const json = await res.json();
      setSucursales(json.data);
    } catch {
      setError("No se pudieron cargar las sucursales");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSucursales();
  }, [fetchSucursales]);

  const activas = sucursales.filter((s) => s.activa).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Sucursales</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {sucursales.length} sucursales · {activas} activas
          </p>
        </div>
        <Button
          size="sm"
          className="bg-[#006FA0] hover:bg-[#005a82] text-white shrink-0"
          onClick={() => setShowCreate(true)}
        >
          <Plus className="h-4 w-4 mr-1" />
          Nueva sucursal
        </Button>
      </div>

      {/* Content */}
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : sucursales.length === 0 ? (
        <p className="text-sm text-slate-400 py-8 text-center">Sin sucursales registradas</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sucursales.map((s) => (
            <SucursalCard key={s.id} sucursal={s} onEdit={setEditItem} />
          ))}
        </div>
      )}

      {/* Create dialog */}
      {showCreate && (
        <DialogCrearSucursal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            fetchSucursales();
          }}
        />
      )}

      {/* Edit dialog */}
      {editItem && (
        <DialogEditarSucursal
          sucursal={editItem}
          onClose={() => setEditItem(null)}
          onUpdated={() => {
            setEditItem(null);
            fetchSucursales();
          }}
        />
      )}
    </div>
  );
}

// ── Create dialog ─────────────────────────────────────────────────────────────

interface DialogCrearProps {
  onClose: () => void;
  onCreated: () => void;
}

function DialogCrearSucursal({ onClose, onCreated }: DialogCrearProps) {
  const [form, setForm] = useState({ nombre: "", codigo: "", activa: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/configuracion/sucursales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: form.nombre.trim(),
          codigo: form.codigo.trim().toUpperCase(),
          activa: form.activa,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Error al crear");
        return;
      }
      toast.success("Sucursal creada");
      onCreated();
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
          <DialogTitle>Nueva sucursal</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-1">
          <div>
            <label className="text-xs font-medium text-slate-600">Nombre *</label>
            <Input
              value={form.nombre}
              onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))}
              required
              className="mt-1"
              placeholder="Ej: Puerto Montt"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Código *</label>
            <Input
              value={form.codigo}
              onChange={(e) =>
                setForm((p) => ({ ...p, codigo: e.target.value.toUpperCase().slice(0, 10) }))
              }
              required
              maxLength={10}
              className="mt-1 font-mono uppercase"
              placeholder="Ej: PMO"
            />
          </div>
          <div className="flex items-start gap-3 py-1">
            <Checkbox
              id="crear-activa"
              checked={form.activa}
              onCheckedChange={(v) => setForm((p) => ({ ...p, activa: !!v }))}
              className="mt-0.5"
            />
            <div>
              <label
                htmlFor="crear-activa"
                className="text-sm text-slate-700 font-medium cursor-pointer"
              >
                Sucursal activa
              </label>
              <p className="text-xs text-slate-400 mt-0.5">
                Las sucursales inactivas no aparecen en la selección de nuevos usuarios.
              </p>
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <DialogFooter className="mt-2 pt-3 border-t">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-[#006FA0] hover:bg-[#005a82] text-white"
            >
              {saving ? "Creando..." : "Crear sucursal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit dialog ───────────────────────────────────────────────────────────────

interface DialogEditarProps {
  sucursal: Sucursal;
  onClose: () => void;
  onUpdated: () => void;
}

function DialogEditarSucursal({ sucursal, onClose, onUpdated }: DialogEditarProps) {
  const [form, setForm] = useState({
    nombre: sucursal.nombre,
    codigo: sucursal.codigo,
    activa: sucursal.activa,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const canDelete = sucursal.totalUsuarios === 0 && sucursal.totalOF === 0;

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/configuracion/sucursales/${sucursal.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Error al eliminar");
        setConfirmDelete(false);
        return;
      }
      toast.success("Sucursal eliminada");
      onUpdated();
    } catch {
      setError("Error de conexión");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setWarnings([]);
    try {
      const body: Record<string, unknown> = {};
      if (form.nombre !== sucursal.nombre) body.nombre = form.nombre.trim();
      if (form.codigo !== sucursal.codigo) body.codigo = form.codigo.trim().toUpperCase();
      if (form.activa !== sucursal.activa) body.activa = form.activa;
      if (Object.keys(body).length === 0) {
        onClose();
        return;
      }

      const res = await fetch(`/api/configuracion/sucursales/${sucursal.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Error al actualizar");
        return;
      }
      const data = await res.json();
      if (data.warnings?.length > 0) {
        setWarnings(data.warnings);
        toast.warning("Sucursal actualizada con advertencias");
      } else {
        toast.success("Sucursal actualizada");
      }
      onUpdated();
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  const willDeactivate = !form.activa && sucursal.activa;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            Editar sucursal
            <span className="block text-sm font-normal text-slate-500 mt-0.5">
              {sucursal.nombre} ({sucursal.codigo})
            </span>
          </DialogTitle>
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

          {/* Código */}
          <div>
            <label className="text-xs font-medium text-slate-600">Código *</label>
            <Input
              value={form.codigo}
              onChange={(e) =>
                setForm((p) => ({ ...p, codigo: e.target.value.toUpperCase().slice(0, 10) }))
              }
              required
              maxLength={10}
              className="mt-1 font-mono uppercase"
              placeholder="Ej: ANT"
            />
          </div>

          {/* Activa toggle */}
          <div className="flex items-start gap-3 py-1">
            <Checkbox
              id="activa"
              checked={form.activa}
              onCheckedChange={(v) => setForm((p) => ({ ...p, activa: !!v }))}
              className="mt-0.5"
            />
            <div>
              <label htmlFor="activa" className="text-sm text-slate-700 font-medium cursor-pointer">
                Sucursal activa
              </label>
              <p className="text-xs text-slate-400 mt-0.5">
                Las sucursales inactivas no aparecen en la selección de nuevos usuarios.
              </p>
            </div>
          </div>

          {/* Deactivation warning */}
          {willDeactivate && (
            <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <span className="text-amber-500 shrink-0 mt-0.5">⚠</span>
              <div className="text-xs text-amber-800 space-y-0.5">
                <p className="font-medium">Al desactivar esta sucursal:</p>
                <ul className="list-disc list-inside space-y-0.5 text-amber-700">
                  <li>{sucursal.totalTecnicos} técnicos quedarán sin sucursal activa</li>
                  {sucursal.totalOFActivas > 0 && (
                    <li>{sucursal.totalOFActivas} órdenes activas sin sucursal activa</li>
                  )}
                </ul>
              </div>
            </div>
          )}

          {/* API warnings */}
          {warnings.length > 0 && (
            <ul className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-0.5">
              {warnings.map((w, i) => (
                <li key={i}>• {w}</li>
              ))}
            </ul>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}

          <DialogFooter className="mt-2 pt-3 border-t flex-col gap-2 sm:flex-row sm:justify-between">
            {/* Delete section */}
            {!confirmDelete ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving || deleting || !canDelete}
                title={
                  !canDelete
                    ? `No se puede eliminar: tiene ${sucursal.totalUsuarios > 0 ? `${sucursal.totalUsuarios} usuario(s)` : ""}${sucursal.totalUsuarios > 0 && sucursal.totalOF > 0 ? " y " : ""}${sucursal.totalOF > 0 ? `${sucursal.totalOF} OF` : ""} asociados`
                    : "Eliminar sucursal"
                }
                className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Eliminar
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-700 font-medium">¿Confirmar eliminación?</span>
                <Button
                  type="button"
                  size="sm"
                  disabled={deleting}
                  className="bg-red-600 hover:bg-red-700 text-white h-7 text-xs"
                  onClick={handleDelete}
                >
                  {deleting ? "Eliminando..." : "Sí, eliminar"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={deleting}
                  className="h-7 text-xs"
                  onClick={() => setConfirmDelete(false)}
                >
                  No
                </Button>
              </div>
            )}

            {/* Save / Cancel */}
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={saving || deleting}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saving || deleting}
                className="bg-[#006FA0] hover:bg-[#005a82] text-white"
              >
                {saving ? "Guardando..." : "Guardar cambios"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
