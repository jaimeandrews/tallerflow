"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
import { toast } from "sonner";
import { Plus, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface Especialidad {
  id: string;
  nombre: string;
  totalTecnicos: number;
}

export function SeccionEspecialidades() {
  const [especialidades, setEspecialidades] = useState<Especialidad[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteItem, setDeleteItem] = useState<Especialidad | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Inline add form
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchEspecialidades = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/configuracion/especialidades");
      if (!res.ok) throw new Error();
      const json = await res.json();
      setEspecialidades(json.data);
    } catch {
      setError("No se pudieron cargar las especialidades");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEspecialidades();
  }, [fetchEspecialidades]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const nombre = nuevoNombre.trim();
    if (!nombre) return;
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch("/api/configuracion/especialidades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre }),
      });
      if (!res.ok) {
        const data = await res.json();
        setAddError(data.error ?? "Error al agregar");
        return;
      }
      toast.success(`Especialidad "${nombre}" creada`);
      setNuevoNombre("");
      inputRef.current?.focus();
      fetchEspecialidades();
    } catch {
      setAddError("Error de conexión");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/configuracion/especialidades/${deleteItem.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Error al eliminar");
        return;
      }
      toast.success(`Especialidad "${deleteItem.nombre}" eliminada`);
      setDeleteItem(null);
      fetchEspecialidades();
    } catch {
      toast.error("Error de conexión");
    } finally {
      setDeleting(false);
    }
  };

  const conTecnicos = especialidades.filter((e) => e.totalTecnicos > 0).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Especialidades</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          {especialidades.length > 0
            ? `${especialidades.length} especialidades · ${conTecnicos} con técnicos asignados`
            : "Clasificaciones de habilidades asignables a técnicos"}
        </p>
      </div>

      {/* List card */}
      <div className="bg-white border rounded-xl overflow-hidden max-w-lg">
        {/* Items */}
        {loading ? (
          <div className="p-3 space-y-1.5">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-11 rounded-lg" />
            ))}
          </div>
        ) : error ? (
          <p className="text-sm text-red-600 p-4">{error}</p>
        ) : especialidades.length === 0 ? (
          <div className="py-10 text-center text-slate-400">
            <Users className="h-7 w-7 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Sin especialidades registradas</p>
            <p className="text-xs mt-0.5">Agrega la primera con el formulario de abajo</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-50">
            {especialidades.map((e) => (
              <li
                key={e.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/60 transition-colors"
              >
                {/* Nombre */}
                <span className="flex-1 text-sm font-medium text-slate-800 truncate">
                  {e.nombre}
                </span>

                {/* Técnicos count */}
                <div
                  className={cn(
                    "flex items-center gap-1 text-xs shrink-0",
                    e.totalTecnicos > 0 ? "text-slate-500" : "text-slate-300"
                  )}
                >
                  <Users className="h-3.5 w-3.5" />
                  <span>
                    {e.totalTecnicos} {e.totalTecnicos === 1 ? "técnico" : "técnicos"}
                  </span>
                </div>

                {/* Delete button */}
                <button
                  type="button"
                  onClick={() => setDeleteItem(e)}
                  disabled={e.totalTecnicos > 0}
                  title={
                    e.totalTecnicos > 0
                      ? `No se puede eliminar: ${e.totalTecnicos} técnico${e.totalTecnicos === 1 ? "" : "s"} asignado${e.totalTecnicos === 1 ? "" : "s"}`
                      : "Eliminar especialidad"
                  }
                  className={cn(
                    "h-7 w-7 flex items-center justify-center rounded-md transition-colors shrink-0",
                    e.totalTecnicos === 0
                      ? "text-slate-300 hover:bg-red-50 hover:text-red-500"
                      : "text-slate-150 cursor-not-allowed opacity-30"
                  )}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Inline add form */}
        <div
          className={cn(
            "px-4 py-3 bg-slate-50/60",
            especialidades.length > 0 && "border-t border-slate-100"
          )}
        >
          <form onSubmit={handleAdd} className="flex gap-2">
            <Input
              ref={inputRef}
              value={nuevoNombre}
              onChange={(e) => {
                setNuevoNombre(e.target.value);
                setAddError(null);
              }}
              placeholder="Ej: Electricidad, Mecánica, Hidráulica..."
              className="h-8 text-sm flex-1 bg-white"
              maxLength={100}
              disabled={adding}
            />
            <Button
              type="submit"
              size="sm"
              disabled={adding || !nuevoNombre.trim()}
              className="gap-1.5 bg-[#006FA0] hover:bg-[#005a82] text-white h-8 px-3 shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              {adding ? "Agregando..." : "Agregar"}
            </Button>
          </form>
          {addError && <p className="text-xs text-red-500 mt-1.5">{addError}</p>}
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {deleteItem && (
        <Dialog open onOpenChange={(open) => !open && setDeleteItem(null)}>
          <DialogContent className="sm:max-w-xs">
            <DialogHeader>
              <DialogTitle>Eliminar especialidad</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-slate-600 mt-2">
              ¿Eliminar <strong className="text-slate-800">{deleteItem.nombre}</strong>? Esta acción
              no se puede deshacer.
            </p>
            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => setDeleteItem(null)} disabled={deleting}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? "Eliminando..." : "Eliminar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
