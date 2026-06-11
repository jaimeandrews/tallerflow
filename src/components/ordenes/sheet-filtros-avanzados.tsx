"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import type { EstadoOF, PrioridadOF } from "@/generated/prisma";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiClient } from "@/lib/api-client";
import {
  ESTADO_OF_LABELS,
  ESTADO_OF_ORDER,
  PRIORIDAD_OF_LABELS,
  PRIORIDAD_OF_ORDER,
} from "@/lib/utils/constants";
import type { FiltrosOrdenes, OrdenarOFPor, SucursalInfo } from "@/types/ordenes";

interface TecnicoMini {
  id: string;
  nombre: string;
  apellido: string;
  iniciales: string;
  sucursalId: string;
}

interface SheetFiltrosProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filtros: FiltrosOrdenes;
  onApply: (updates: Partial<FiltrosOrdenes>) => void;
  onReset: () => void;
  sucursales: SucursalInfo[];
  canSelectSucursal: boolean;
}

const ORDENAR_LABELS: Record<OrdenarOFPor, string> = {
  numero: "Número",
  prioridad: "Prioridad",
  estado: "Estado",
  hhConsumidas: "HH consumidas",
  slaVencimiento: "Vencimiento SLA",
  createdAt: "Fecha de creación",
};

const NONE_VALUE = "__none__";

export function SheetFiltrosAvanzados({
  open,
  onOpenChange,
  filtros,
  onApply,
  onReset,
  sucursales,
  canSelectSucursal,
}: SheetFiltrosProps) {
  const [draft, setDraft] = useState<FiltrosOrdenes>(filtros);
  const [tecnicos, setTecnicos] = useState<TecnicoMini[]>([]);
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(filtros);
  }

  useEffect(() => {
    if (!open) return;
    const sucursalParam = draft.sucursalId ? `?sucursalId=${draft.sucursalId}` : "";
    apiClient
      .get<{ tecnicos: TecnicoMini[] }>(`/api/usuarios/tecnicos${sucursalParam}`)
      .then((res) => setTecnicos(res.tecnicos))
      .catch(() => {
        // toast already handled
      });
  }, [open, draft.sucursalId]);

  function update<K extends keyof FiltrosOrdenes>(key: K, value: FiltrosOrdenes[K] | undefined) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function aplicar() {
    onApply({
      estado: draft.estado,
      prioridad: draft.prioridad,
      sucursalId: draft.sucursalId,
      tecnicoId: draft.tecnicoId,
      ordenarPor: draft.ordenarPor,
      direccion: draft.direccion,
      porPagina: draft.porPagina,
    });
    onOpenChange(false);
  }

  function limpiar() {
    onReset();
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Filtros avanzados</SheetTitle>
          <SheetDescription>
            Refina la búsqueda y el orden de las órdenes mostradas.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 px-4 space-y-5">
          {canSelectSucursal && (
            <FilterField label="Sucursal">
              <Select
                value={draft.sucursalId ?? NONE_VALUE}
                onValueChange={(v) => update("sucursalId", v === NONE_VALUE ? undefined : v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>Todas las sucursales</SelectItem>
                  {sucursales.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
          )}

          <FilterField label="Estado">
            <Select
              value={draft.estado ?? NONE_VALUE}
              onValueChange={(v) =>
                update("estado", v === NONE_VALUE ? undefined : (v as EstadoOF))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>Todos</SelectItem>
                {ESTADO_OF_ORDER.map((e) => (
                  <SelectItem key={e} value={e}>
                    {ESTADO_OF_LABELS[e]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Prioridad">
            <Select
              value={draft.prioridad ?? NONE_VALUE}
              onValueChange={(v) =>
                update("prioridad", v === NONE_VALUE ? undefined : (v as PrioridadOF))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>Todas</SelectItem>
                {PRIORIDAD_OF_ORDER.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PRIORIDAD_OF_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <FilterField label="Técnico asignado">
            <Select
              value={draft.tecnicoId ?? NONE_VALUE}
              onValueChange={(v) => update("tecnicoId", v === NONE_VALUE ? undefined : v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Cualquiera" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>Cualquiera</SelectItem>
                {tecnicos.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.nombre} {t.apellido}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>

          <div className="border-t border-slate-200 pt-4 space-y-3">
            <FilterField label="Ordenar por">
              <Select
                value={draft.ordenarPor}
                onValueChange={(v) => update("ordenarPor", v as OrdenarOFPor)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ORDENAR_LABELS) as OrdenarOFPor[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {ORDENAR_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>

            <FilterField label="Dirección">
              <Select
                value={draft.direccion}
                onValueChange={(v) => update("direccion", v as "asc" | "desc")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Ascendente</SelectItem>
                  <SelectItem value="desc">Descendente</SelectItem>
                </SelectContent>
              </Select>
            </FilterField>

            <FilterField label="Resultados por página">
              <Select
                value={String(draft.porPagina)}
                onValueChange={(v) => update("porPagina", Number(v))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[20, 50, 100].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
          </div>
        </div>

        <SheetFooter className="flex-row sm:justify-between gap-2 border-t border-slate-200">
          <Button variant="ghost" onClick={limpiar}>
            <RotateCcw className="size-4" />
            Restablecer
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={aplicar}>Aplicar</Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-slate-600">{label}</label>
      {children}
    </div>
  );
}
