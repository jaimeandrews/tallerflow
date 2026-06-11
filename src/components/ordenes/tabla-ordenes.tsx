"use client";

import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ClipboardX,
  MoreHorizontal,
  Pencil,
  RefreshCcw,
  UserPlus,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from "@/components/ui/avatar";
import { formatDate } from "@/lib/utils/formatters";
import { ESTADO_OF_LABELS } from "@/lib/utils/constants";
import { cn } from "@/lib/utils";
import { EstadoBadge, PrioridadBadge } from "./of-badges";
import type { FiltrosOrdenes, OrdenarOFPor, OrdenTrabajoListItem } from "@/types/ordenes";
import type { EstadoOF } from "@/generated/prisma";

// ── Props ──────────────────────────────────────────────────────────────────

interface TablaOrdenesProps {
  ordenes: OrdenTrabajoListItem[];
  loading: boolean;
  total: number;
  totalPaginas: number;
  filtros: FiltrosOrdenes;
  onSort: (campo: OrdenarOFPor) => void;
  onPagina: (pagina: number) => void;
  onPorPagina: (n: number) => void;
  onRowClick?: (orden: OrdenTrabajoListItem) => void;
  onEdit?: (orden: OrdenTrabajoListItem) => void;
  onCambiarEstado?: (orden: OrdenTrabajoListItem, estado: EstadoOF) => void;
  onAsignar?: (orden: OrdenTrabajoListItem) => void;
  canManage: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function BarraHH({ consumidas, estimadas }: { consumidas: number; estimadas: number }) {
  const pct = estimadas > 0 ? (consumidas / estimadas) * 100 : 0;
  const display = Math.min(100, pct);
  const color = pct > 100 ? "bg-red-500" : pct >= 80 ? "bg-yellow-500" : "bg-emerald-500";

  return (
    <div className="flex flex-col gap-1 min-w-[120px]">
      <div className="h-1.5 w-full rounded-full bg-slate-100">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${display}%` }}
        />
      </div>
      <span
        className={cn(
          "text-xs font-mono",
          pct > 100 ? "text-red-600 font-semibold" : "text-slate-600"
        )}
      >
        {consumidas.toFixed(1)} / {estimadas.toFixed(1)} h
      </span>
    </div>
  );
}

function Tecnicos({
  asignaciones,
  tecnicosRequeridos,
}: Pick<OrdenTrabajoListItem, "asignaciones" | "tecnicosRequeridos">) {
  if (asignaciones.length === 0) {
    return <span className="text-xs text-slate-400 italic">Sin asignar</span>;
  }
  const shown = asignaciones.slice(0, 3);
  const extra = asignaciones.length - shown.length;
  return (
    <div className="flex items-center gap-2">
      <AvatarGroup>
        {shown.map((a) => (
          <Avatar key={a.id} size="sm">
            <AvatarFallback
              style={{ backgroundColor: a.usuario.color }}
              className="text-white text-[10px] font-bold"
            >
              {a.usuario.iniciales}
            </AvatarFallback>
          </Avatar>
        ))}
        {extra > 0 && <AvatarGroupCount className="text-[10px]">+{extra}</AvatarGroupCount>}
      </AvatarGroup>
      <span className="text-[11px] text-slate-400">
        {asignaciones.length}/{tecnicosRequeridos}
      </span>
    </div>
  );
}

interface ColHead {
  campo?: OrdenarOFPor;
  label: string;
  filtros: FiltrosOrdenes;
  onSort: (c: OrdenarOFPor) => void;
  className?: string;
}
function ColHead({ campo, label, filtros, onSort, className }: ColHead) {
  if (!campo) return <TableHead className={className}>{label}</TableHead>;
  const activo = filtros.ordenarPor === campo;
  const Icon = activo ? (filtros.direccion === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(campo)}
        className={cn(
          "inline-flex items-center gap-1 transition-colors hover:text-slate-900 whitespace-nowrap",
          activo ? "text-slate-900 font-semibold" : "text-slate-500 font-medium"
        )}
      >
        {label}
        <Icon className="size-3" />
      </button>
    </TableHead>
  );
}

// ── Skeleton rows ──────────────────────────────────────────────────────────

function SkeletonRows({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <TableRow key={i} className="hover:bg-transparent">
          <TableCell>
            <Skeleton className="size-4 rounded-sm" />
          </TableCell>
          <TableCell>
            <div className="space-y-1.5">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3 w-20" />
            </div>
          </TableCell>
          <TableCell>
            <Skeleton className="h-3.5 w-20" />
          </TableCell>
          <TableCell>
            <div className="space-y-1.5">
              <Skeleton className="h-3.5 w-36" />
              <Skeleton className="h-3 w-28" />
            </div>
          </TableCell>
          <TableCell>
            <Skeleton className="h-3.5 w-20" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-6 w-24 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-6 w-16 rounded-full" />
          </TableCell>
          <TableCell>
            <div className="space-y-1.5">
              <Skeleton className="h-2 w-28 rounded-full" />
              <Skeleton className="h-3 w-20" />
            </div>
          </TableCell>
          <TableCell>
            <Skeleton className="h-6 w-16" />
          </TableCell>
          {cols > 9 && (
            <TableCell>
              <Skeleton className="size-7 rounded-md" />
            </TableCell>
          )}
        </TableRow>
      ))}
    </>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={10}>
        <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
          <div className="flex size-16 items-center justify-center rounded-full bg-slate-100">
            <ClipboardX className="size-8 text-slate-400" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-700">
              No se encontraron órdenes de trabajo
            </p>
            <p className="text-xs text-slate-400">
              Prueba ajustando los filtros o crea una nueva OF.
            </p>
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

// ── Pagination ─────────────────────────────────────────────────────────────

function Paginacion({
  pagina,
  totalPaginas,
  total,
  porPagina,
  onPagina,
  onPorPagina,
}: {
  pagina: number;
  totalPaginas: number;
  total: number;
  porPagina: number;
  onPagina: (p: number) => void;
  onPorPagina: (n: number) => void;
}) {
  const desde = Math.min(total, (pagina - 1) * porPagina + 1);
  const hasta = Math.min(total, pagina * porPagina);

  return (
    <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
      <span className="text-slate-500">
        Mostrando{" "}
        <span className="font-medium text-slate-800">
          {desde}–{hasta}
        </span>{" "}
        de <span className="font-medium text-slate-800">{total.toLocaleString("es-CL")}</span>
      </span>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-slate-500">
          <span className="text-xs">Filas</span>
          <Select value={String(porPagina)} onValueChange={(v) => onPorPagina(Number(v))}>
            <SelectTrigger size="sm" className="h-7 w-16 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 20, 50].map((n) => (
                <SelectItem key={n} value={String(n)} className="text-xs">
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={pagina <= 1}
            onClick={() => onPagina(pagina - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-[60px] text-center text-xs text-slate-500">
            {pagina} / {totalPaginas}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={pagina >= totalPaginas}
            onClick={() => onPagina(pagina + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Menu de acciones ───────────────────────────────────────────────────────

function MenuAcciones({
  of,
  onEdit,
  onCambiarEstado,
  onAsignar,
  onRowClick,
}: {
  of: OrdenTrabajoListItem;
  onEdit?: (o: OrdenTrabajoListItem) => void;
  onCambiarEstado?: (o: OrdenTrabajoListItem, e: EstadoOF) => void;
  onAsignar?: (o: OrdenTrabajoListItem) => void;
  onRowClick?: (o: OrdenTrabajoListItem) => void;
}) {
  // Valid transitions from current state (same logic as API)
  const transiciones: Partial<Record<EstadoOF, EstadoOF[]>> = {
    PENDIENTE: ["EN_PROCESO", "PAUSADA"],
    EN_PROCESO: ["PAUSADA", "ESPERA_REPUESTO", "FINALIZADA"],
    PAUSADA: ["EN_PROCESO"],
    ESPERA_REPUESTO: ["EN_PROCESO", "PAUSADA"],
    FINALIZADA: [],
  };
  const posibles = transiciones[of.estado] ?? [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm">
          <MoreHorizontal className="size-4" />
          <span className="sr-only">Acciones</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="text-xs text-slate-500">{of.numero}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {onRowClick && (
          <DropdownMenuItem onSelect={() => onRowClick(of)}>Ver detalle</DropdownMenuItem>
        )}
        {onEdit && (
          <DropdownMenuItem onSelect={() => onEdit(of)}>
            <Pencil />
            Editar
          </DropdownMenuItem>
        )}
        {onCambiarEstado && posibles.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <RefreshCcw />
              Cambiar estado
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {posibles.map((e) => (
                <DropdownMenuItem key={e} onSelect={() => onCambiarEstado(of, e)}>
                  {ESTADO_OF_LABELS[e]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        {onAsignar && (
          <DropdownMenuItem onSelect={() => onAsignar(of)}>
            <UserPlus />
            Asignar técnicos
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Tabla principal ────────────────────────────────────────────────────────
//
// VIRTUAL LIST — MEJORA FUTURA
// Con el volumen actual por sucursal (≤ 30 OFs en el seed, ~50-100 en
// producción) la tabla paginada a 20 filas es suficientemente rápida.
// Si en el futuro se necesita mostrar 200+ filas sin paginar (p.ej. en
// reportes de auditoría o export preview), se recomienda:
//
//   import { useVirtualizer } from "@tanstack/react-virtual";
//   - Docs: https://tanstack.com/virtual/latest
//   - Integración: reemplazar el map() de TableBody por el virtualizer,
//     fijar height en el contenedor y pasar estimateSize={56} (alto de fila).
//
// La librería ya está disponible como @tanstack/react-virtual si se instala.

export function TablaOrdenes({
  ordenes,
  loading,
  total,
  totalPaginas,
  filtros,
  onSort,
  onPagina,
  onPorPagina,
  onRowClick,
  onEdit,
  onCambiarEstado,
  onAsignar,
  canManage,
}: TablaOrdenesProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggleAll() {
    setSelected((prev) =>
      prev.size === ordenes.length ? new Set() : new Set(ordenes.map((o) => o.id))
    );
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const allChecked = ordenes.length > 0 && selected.size === ordenes.length;
  const someChecked = selected.size > 0 && !allChecked;
  const colSpan = canManage ? 10 : 9;

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      {/* Selection toolbar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 border-b border-slate-200 bg-blue-50 px-4 py-2">
          <span className="text-xs font-medium text-blue-700">
            {selected.size} seleccionada{selected.size !== 1 ? "s" : ""}
          </span>
          <Button variant="ghost" size="xs" onClick={() => setSelected(new Set())}>
            Limpiar selección
          </Button>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50 hover:bg-slate-50">
            <TableHead className="w-10 px-4">
              <Checkbox
                checked={allChecked ? true : someChecked ? "indeterminate" : false}
                onCheckedChange={toggleAll}
                aria-label="Seleccionar todas"
              />
            </TableHead>
            <ColHead
              campo="numero"
              label="OF"
              filtros={filtros}
              onSort={onSort}
              className="min-w-[130px]"
            />
            <TableHead>Proyecto</TableHead>
            <TableHead className="min-w-[200px]">Cliente / Equipo</TableHead>
            <TableHead>Sucursal</TableHead>
            <ColHead campo="estado" label="Estado" filtros={filtros} onSort={onSort} />
            <ColHead campo="prioridad" label="Prioridad" filtros={filtros} onSort={onSort} />
            <ColHead
              campo="hhConsumidas"
              label="HH"
              filtros={filtros}
              onSort={onSort}
              className="min-w-[140px]"
            />
            <TableHead>Técnicos</TableHead>
            {canManage && <TableHead className="w-12" />}
          </TableRow>
        </TableHeader>

        <TableBody>
          {loading && <SkeletonRows cols={colSpan} />}
          {!loading && ordenes.length === 0 && <EmptyState />}
          {!loading &&
            ordenes.map((of) => {
              const slaVencido =
                of.slaVencimiento &&
                of.estado !== "FINALIZADA" &&
                new Date(of.slaVencimiento) < new Date();
              const isSel = selected.has(of.id);

              return (
                <TableRow
                  key={of.id}
                  className={cn(
                    "cursor-pointer transition-colors",
                    isSel && "bg-blue-50/60",
                    of.critica && of.estado !== "FINALIZADA" && !isSel && "bg-red-50/30"
                  )}
                  onClick={() => onRowClick?.(of)}
                >
                  {/* Checkbox */}
                  <TableCell className="px-4" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={isSel}
                      onCheckedChange={() => toggleOne(of.id)}
                      aria-label={`Seleccionar ${of.numero}`}
                    />
                  </TableCell>

                  {/* OF */}
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-sm font-semibold text-blue-600">
                        {of.numero}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        creada {formatDate(of.createdAt)}
                        {slaVencido && (
                          <span className="ml-1 text-red-500 font-medium">· SLA vencido</span>
                        )}
                      </span>
                    </div>
                  </TableCell>

                  {/* Proyecto */}
                  <TableCell>
                    <span className="font-mono text-xs text-slate-700">{of.proyecto}</span>
                  </TableCell>

                  {/* Cliente / Equipo */}
                  <TableCell>
                    <div className="flex flex-col gap-0.5 max-w-[240px]">
                      <span className="text-sm font-semibold text-slate-900 truncate">
                        {of.nombre}
                      </span>
                      <span className="text-[11px] text-slate-500 truncate">
                        {of.cliente} · {of.equipo}
                      </span>
                    </div>
                  </TableCell>

                  {/* Sucursal */}
                  <TableCell>
                    <span className="text-xs text-slate-600">{of.sucursal.nombre}</span>
                  </TableCell>

                  {/* Estado */}
                  <TableCell>
                    <EstadoBadge estado={of.estado} />
                  </TableCell>

                  {/* Prioridad */}
                  <TableCell>
                    <PrioridadBadge prioridad={of.prioridad} />
                  </TableCell>

                  {/* HH */}
                  <TableCell>
                    <BarraHH consumidas={of.hhConsumidas} estimadas={of.hhEstimadas} />
                  </TableCell>

                  {/* Técnicos */}
                  <TableCell>
                    <Tecnicos
                      asignaciones={of.asignaciones}
                      tecnicosRequeridos={of.tecnicosRequeridos}
                    />
                  </TableCell>

                  {/* Acciones */}
                  {canManage && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <MenuAcciones
                        of={of}
                        onRowClick={onRowClick}
                        onEdit={onEdit}
                        onCambiarEstado={onCambiarEstado}
                        onAsignar={onAsignar}
                      />
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
        </TableBody>
      </Table>

      {!loading && total > 0 && (
        <Paginacion
          pagina={filtros.pagina}
          totalPaginas={totalPaginas}
          total={total}
          porPagina={filtros.porPagina}
          onPagina={onPagina}
          onPorPagina={onPorPagina}
        />
      )}
    </div>
  );
}
