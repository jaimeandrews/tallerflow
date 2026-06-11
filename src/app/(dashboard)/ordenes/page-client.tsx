"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Download, LayoutGrid, ListFilter, Loader2, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import type { EstadoOF, RolUsuario } from "@/generated/prisma";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { ESTADO_OF_LABELS, ESTADO_OF_ORDER, ESTADO_OF_PILL_COLORS } from "@/lib/utils/constants";
import { puedeGestionarOF } from "@/lib/services/ordenes-service";
import { useSucursalActiva } from "@/contexts/sucursal-context";
import { useOrdenes } from "@/hooks/useOrdenes";
import { TablaOrdenes } from "@/components/ordenes/tabla-ordenes";
import { DialogOrden } from "@/components/ordenes/dialog-orden";

// KanbanOrdenes bundles dnd-kit + all card components — heavy upfront cost.
// Load only when the user switches to the Kanban tab (not the default Table view).
const KanbanOrdenes = dynamic(
  () => import("@/components/ordenes/kanban-ordenes").then((m) => m.KanbanOrdenes),
  {
    loading: () => (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="min-w-[272px] h-[400px] rounded-xl" />
        ))}
      </div>
    ),
    ssr: false, // dnd-kit relies on pointer events and DOM layout
  }
);
import { SheetFiltrosAvanzados } from "@/components/ordenes/sheet-filtros-avanzados";
import { SheetDetalleOF } from "@/components/ordenes/sheet-detalle-of";
import type { OrdenarOFPor, OrdenTrabajoListItem, SucursalInfo } from "@/types/ordenes";

interface Props {
  rol: RolUsuario;
  sucursales: SucursalInfo[];
  sucursalActivaId: string;
  sucursalActivaNombre: string;
  initialBusqueda?: string;
}

export function OrdenesPageClient({
  rol,
  sucursales: _sucursales,
  sucursalActivaId: _initialId,
  sucursalActivaNombre: _initialNombre,
  initialBusqueda,
}: Props) {
  const { sucursalActivaId, sucursalActiva, sucursales } = useSucursalActiva();
  const sucursalActivaNombre = sucursalActiva.nombre;
  const canManage = puedeGestionarOF(rol);
  const canSelectSucursal = rol === "ADMIN";

  const {
    filtros,
    setFiltros,
    resetFiltros,
    busquedaInput,
    setBusquedaInput,
    vista,
    setVista,
    data,
    total,
    totalPaginas,
    loading,
    stats,
    statsLoading,
    mutating,
    refetch,
    refetchStats,
    cambiarEstado,
  } = useOrdenes(initialBusqueda ? { busqueda: initialBusqueda } : undefined);

  const [filtrosOpen, setFiltrosOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOrden, setEditingOrden] = useState<OrdenTrabajoListItem | null>(null);
  const [detalleOpen, setDetalleOpen] = useState(false);
  const [detalleOrden, setDetalleOrden] = useState<OrdenTrabajoListItem | null>(null);

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleCambiarEstado(orden: OrdenTrabajoListItem, estado: EstadoOF) {
    const { ok, error } = await cambiarEstado(orden.id, estado);
    if (ok) toast.success(`${orden.numero} → ${ESTADO_OF_LABELS[estado]}`);
    else toast.error(error ?? "Error al cambiar estado");
  }

  function handleSort(campo: OrdenarOFPor) {
    setFiltros({
      ordenarPor: campo,
      direccion: filtros.ordenarPor === campo && filtros.direccion === "asc" ? "desc" : "asc",
    });
  }

  function handleRowClick(orden: OrdenTrabajoListItem) {
    setDetalleOrden(orden);
    setDetalleOpen(true);
  }

  function handleEdit(orden: OrdenTrabajoListItem) {
    setDetalleOpen(false);
    setEditingOrden(orden);
    setDialogOpen(true);
  }

  function handleCreate() {
    setEditingOrden(null);
    setDialogOpen(true);
  }

  function handleAsignar(_orden: OrdenTrabajoListItem) {
    toast.info("Asignación de técnicos — disponible en Fase 2");
  }

  function handleExportar() {
    // Rango: desde el 1° del mes hasta hoy (máx 90 días permitidos por el API)
    const hoy = new Date();
    const hasta = hoy.toISOString().slice(0, 10);
    const desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);

    const params = new URLSearchParams({
      tipo: "ordenes",
      formato: "csv",
      desde,
      hasta,
    });
    if (filtros.sucursalId) params.set("sucursalId", filtros.sucursalId);
    else if (sucursalActivaId) params.set("sucursalId", sucursalActivaId);

    const url = `/api/reportes/exportar?${params}`;
    const a = document.createElement("a");
    a.href = url;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    toast.info(`Generando CSV · ${desde} → ${hasta}`);
  }

  // ── Pills de estado ───────────────────────────────────────────────────────

  const pills = useMemo(
    () => [
      { key: "todas" as const, label: "Todas", count: stats.total, estado: undefined },
      ...ESTADO_OF_ORDER.map((e) => ({
        key: e,
        label: ESTADO_OF_LABELS[e],
        count:
          e === "PENDIENTE"
            ? stats.pendientes
            : e === "EN_PROCESO"
              ? stats.enProceso
              : e === "PAUSADA"
                ? stats.pausadas
                : e === "ESPERA_REPUESTO"
                  ? stats.esperaRepuesto
                  : stats.finalizadas,
        estado: e,
      })),
    ],
    [stats]
  );

  const hayFiltrosActivos = !!(
    filtros.sucursalId ||
    filtros.tecnicoId ||
    filtros.prioridad ||
    filtros.busqueda
  );

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Órdenes de trabajo</h1>
          <p className="text-sm text-slate-500">
            Sucursal {sucursalActivaNombre} ·{" "}
            <span className="font-mono">{statsLoading ? "…" : total.toLocaleString("es-CL")}</span>{" "}
            resultado{total === 1 ? "" : "s"}
            {stats.criticas > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-red-600">
                · {stats.criticas} crítica{stats.criticas === 1 ? "" : "s"}
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setFiltrosOpen(true)}>
            <ListFilter className="size-4" />
            Filtros avanzados
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportar}
            title="Exportar órdenes del mes actual a CSV"
          >
            <Download className="size-4" />
            Exportar CSV
          </Button>
          {canManage && (
            <Button size="sm" onClick={handleCreate} disabled={mutating}>
              <Plus className="size-4" />
              Nueva OF
            </Button>
          )}
        </div>
      </div>

      {/* ── Búsqueda + pills ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" />
            <Input
              value={busquedaInput}
              onChange={(e) => setBusquedaInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setBusquedaInput("");
                }
              }}
              placeholder="Buscar OF, proyecto, cliente, equipo… (300 ms)"
              className="pl-9 pr-9"
            />
            {busquedaInput && (
              <button
                type="button"
                onClick={() => setBusquedaInput("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          {loading && <Loader2 className="size-4 animate-spin text-slate-400" />}
        </div>

        <div className="flex flex-wrap gap-2">
          {pills.map((p) => {
            const isActive =
              p.estado === undefined ? filtros.estado === undefined : filtros.estado === p.estado;
            const colors = p.estado ? ESTADO_OF_PILL_COLORS[p.estado] : null;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setFiltros({ estado: p.estado })}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all border",
                  colors
                    ? isActive
                      ? cn(colors.active, "border-2 shadow-sm")
                      : colors.base
                    : isActive
                      ? "border-2 border-slate-700 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                )}
              >
                {p.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0 text-[10px] font-mono",
                    colors
                      ? "bg-white/70 text-slate-700"
                      : isActive
                        ? "bg-white text-slate-900"
                        : "bg-slate-100 text-slate-700"
                  )}
                >
                  {statsLoading ? "…" : p.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Vista toggle + contenido ── */}
      <Tabs value={vista} onValueChange={(v) => setVista(v as typeof vista)}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="tabla">
              <ListFilter className="size-4" />
              Tabla
            </TabsTrigger>
            <TabsTrigger value="kanban">
              <LayoutGrid className="size-4" />
              Kanban
            </TabsTrigger>
          </TabsList>

          {hayFiltrosActivos && (
            <Button variant="ghost" size="sm" onClick={resetFiltros}>
              <X className="size-4" />
              Limpiar filtros
            </Button>
          )}
        </div>

        <TabsContent value="tabla" className="mt-4">
          <TablaOrdenes
            ordenes={data}
            loading={loading}
            total={total}
            totalPaginas={totalPaginas}
            filtros={filtros}
            onSort={handleSort}
            onPagina={(p) => setFiltros({ pagina: p })}
            onPorPagina={(n) => setFiltros({ porPagina: n })}
            onRowClick={handleRowClick}
            onEdit={canManage ? handleEdit : undefined}
            onCambiarEstado={canManage ? handleCambiarEstado : undefined}
            onAsignar={canManage ? handleAsignar : undefined}
            canManage={canManage}
          />
        </TabsContent>

        <TabsContent value="kanban" className="mt-4">
          <KanbanOrdenes
            ordenes={data}
            loading={loading}
            onEstadoChange={() => {
              void refetch();
              void refetchStats();
            }}
          />
        </TabsContent>
      </Tabs>

      {/* ── Dialogs / Sheets ── */}

      <DialogOrden
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        orden={editingOrden}
        sucursales={sucursales}
        sucursalIdDefault={sucursalActivaId}
        canSelectSucursal={canSelectSucursal}
        onSuccess={() => {
          void refetch();
          void refetchStats();
        }}
      />

      <SheetDetalleOF
        open={detalleOpen}
        onOpenChange={setDetalleOpen}
        ordenBase={detalleOrden}
        onEdit={canManage ? handleEdit : undefined}
      />

      <SheetFiltrosAvanzados
        open={filtrosOpen}
        onOpenChange={setFiltrosOpen}
        filtros={filtros}
        onApply={setFiltros}
        onReset={resetFiltros}
        sucursales={sucursales}
        canSelectSucursal={canSelectSucursal}
      />
    </div>
  );
}
