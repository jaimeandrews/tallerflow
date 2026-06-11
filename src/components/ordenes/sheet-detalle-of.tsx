"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Building2,
  Calendar,
  Clock,
  Edit2,
  Hash,
  Loader2,
  Timer,
  User,
  Wrench,
} from "lucide-react";
import type { EstadoOF } from "@/generated/prisma";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  formatDate,
  formatDateTime,
  formatHorasHombre,
  formatMinutesToText,
} from "@/lib/utils/formatters";
import {
  ESTADO_OF_COLORS,
  ESTADO_OF_LABELS,
  PRIORIDAD_OF_COLORS,
  PRIORIDAD_OF_LABELS,
} from "@/lib/utils/constants";
import { EstadoBadge, PrioridadBadge } from "./of-badges";
import type {
  DetalleOrdenResponse,
  HistorialEntry,
  HistorialResponse,
  OrdenTrabajoListItem,
} from "@/types/ordenes";

// ── Acciones de auditoría legibles ─────────────────────────────────────────

const ACCION_LABELS: Record<string, string> = {
  CREAR_OF: "OF creada",
  ACTUALIZAR_OF: "Datos actualizados",
  CAMBIAR_ESTADO_OF: "Cambio de estado",
  ELIMINAR_OF: "OF eliminada",
};

// ── Helpers ────────────────────────────────────────────────────────────────

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// ── Props ──────────────────────────────────────────────────────────────────

interface SheetDetalleOFProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ordenBase: OrdenTrabajoListItem | null;
  onEdit?: (orden: OrdenTrabajoListItem) => void;
}

// ── Sub-componentes de sección ─────────────────────────────────────────────

function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h3>
      {children}
    </section>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <p className="text-[11px] text-slate-400">{label}</p>
        <p className="text-sm text-slate-800">{value}</p>
      </div>
    </div>
  );
}

// ── Barra de progreso HH grande ────────────────────────────────────────────

function BarraHHGrande({
  consumidas,
  estimadas,
  productivas,
  noProductivas,
}: {
  consumidas: number;
  estimadas: number;
  productivas: number;
  noProductivas: number;
}) {
  const pct = estimadas > 0 ? (consumidas / estimadas) * 100 : 0;
  const display = Math.min(100, pct);
  const overrun = pct > 100;
  const barColor = overrun ? "bg-red-500" : pct >= 80 ? "bg-yellow-500" : "bg-emerald-500";

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs text-slate-600">
        <span>
          <strong className="text-slate-900">{consumidas.toFixed(1)}</strong> HH consumidas
        </span>
        <span
          className={cn("font-mono font-semibold", overrun ? "text-red-600" : "text-slate-700")}
        >
          {pct.toFixed(1)}% de {estimadas.toFixed(1)} HH
        </span>
      </div>
      <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${display}%` }}
        />
      </div>
      <div className="grid grid-cols-2 gap-2 pt-1">
        <div className="flex items-center gap-2 rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2">
          <span className="size-2 rounded-full bg-emerald-500" />
          <div>
            <p className="text-[11px] text-emerald-700">Productivas</p>
            <p className="text-sm font-semibold text-emerald-800">{productivas.toFixed(1)} HH</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-md bg-slate-50 border border-slate-200 px-3 py-2">
          <span className="size-2 rounded-full bg-slate-400" />
          <div>
            <p className="text-[11px] text-slate-600">No productivas</p>
            <p className="text-sm font-semibold text-slate-700">{noProductivas.toFixed(1)} HH</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Timeline de marcajes ───────────────────────────────────────────────────

function TimelineMarcajes({
  marcajes,
}: {
  marcajes: DetalleOrdenResponse["ordenTrabajo"]["marcajes"];
}) {
  if (marcajes.length === 0) {
    return <p className="text-xs text-slate-400 italic">Sin marcajes registrados.</p>;
  }

  return (
    <ol className="relative border-l border-slate-200 space-y-4 pl-5">
      {marcajes.map((m) => (
        <li key={m.id} className="relative">
          <span
            className="absolute -left-[21px] flex size-4 items-center justify-center rounded-full border-2 border-white"
            style={{ backgroundColor: m.actividad.color }}
          />
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-slate-800">{m.actividad.nombre}</span>
              {m.duracionMinutos !== null && (
                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-600">
                  {formatMinutesToText(m.duracionMinutos)}
                </span>
              )}
              {m.horaFin === null && (
                <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 animate-pulse">
                  En curso
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <span>{formatDateTime(m.horaInicio)}</span>
              {m.horaFin && <span>→ {formatDateTime(m.horaFin)}</span>}
            </div>
            <div className="flex items-center gap-1.5">
              <Avatar size="sm">
                <AvatarFallback
                  style={{ backgroundColor: m.usuario.color }}
                  className="text-white text-[10px] font-bold"
                >
                  {m.usuario.iniciales}
                </AvatarFallback>
              </Avatar>
              <span className="text-[11px] text-slate-600">
                {m.usuario.nombre} {m.usuario.apellido ?? ""}
              </span>
            </div>
            {m.notas && (
              <p className="mt-0.5 text-[11px] text-slate-500 italic">&quot;{m.notas}&quot;</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

// ── Historial de estados ───────────────────────────────────────────────────

function HistorialEstados({ historial }: { historial: HistorialEntry[] }) {
  if (historial.length === 0) {
    return <p className="text-xs text-slate-400 italic">Sin historial disponible.</p>;
  }

  return (
    <ol className="space-y-3">
      {historial.map((entry) => {
        const anterior = parseJson<{ estado?: EstadoOF }>(entry.datosAnteriores);
        const nuevo = parseJson<{ estado?: EstadoOF }>(entry.datosNuevos);
        const esEstado = entry.accion === "CAMBIAR_ESTADO_OF";

        return (
          <li key={entry.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "mt-1 size-2 rounded-full shrink-0",
                  entry.accion === "CREAR_OF"
                    ? "bg-emerald-500"
                    : entry.accion === "ELIMINAR_OF"
                      ? "bg-red-500"
                      : entry.accion === "CAMBIAR_ESTADO_OF"
                        ? "bg-blue-500"
                        : "bg-slate-400"
                )}
              />
            </div>
            <div className="flex-1 min-w-0 pb-3 border-b border-slate-100 last:border-0 last:pb-0">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-800">
                    {ACCION_LABELS[entry.accion] ?? entry.accion}
                  </p>
                  {esEstado && anterior?.estado && nuevo?.estado && (
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 font-medium",
                          ESTADO_OF_COLORS[anterior.estado]
                        )}
                      >
                        {ESTADO_OF_LABELS[anterior.estado]}
                      </span>
                      <span className="text-slate-400">→</span>
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 font-medium",
                          ESTADO_OF_COLORS[nuevo.estado]
                        )}
                      >
                        {ESTADO_OF_LABELS[nuevo.estado]}
                      </span>
                    </div>
                  )}
                  {entry.usuario && (
                    <div className="flex items-center gap-1.5">
                      <Avatar size="sm">
                        <AvatarFallback
                          style={{ backgroundColor: entry.usuario.color }}
                          className="text-white text-[10px] font-bold"
                        >
                          {entry.usuario.iniciales}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-[11px] text-slate-500">
                        {entry.usuario.nombre} {entry.usuario.apellido}
                      </span>
                    </div>
                  )}
                </div>
                <time className="shrink-0 text-[11px] text-slate-400 whitespace-nowrap">
                  {formatDateTime(entry.createdAt)}
                </time>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ── Skeleton de carga ──────────────────────────────────────────────────────

function DetalleLoading() {
  return (
    <div className="space-y-6 p-5">
      <div className="space-y-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-3 w-48" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="size-4 rounded-full" />
            <div className="space-y-1.5 flex-1">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3.5 w-36" />
            </div>
          </div>
        ))}
      </div>
      <Skeleton className="h-20 w-full rounded-lg" />
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────

export function SheetDetalleOF({ open, onOpenChange, ordenBase, onEdit }: SheetDetalleOFProps) {
  const [detalle, setDetalle] = useState<DetalleOrdenResponse | null>(null);
  const [historial, setHistorial] = useState<HistorialEntry[]>([]);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [loadingHistorial, setLoadingHistorial] = useState(false);

  // Reset when sheet closes or orden changes — during render (React 19 pattern)
  const [snap, setSnap] = useState({ open, id: ordenBase?.id ?? null });
  const currentSnap = { open, id: ordenBase?.id ?? null };
  if (snap.open !== currentSnap.open || snap.id !== currentSnap.id) {
    setSnap(currentSnap);
    if (!currentSnap.open) {
      setDetalle(null);
      setHistorial([]);
    }
  }

  const fetchDetalle = useCallback(async (id: string) => {
    setLoadingDetalle(true);
    try {
      const res = await fetch(`/api/ordenes/${id}`);
      if (!res.ok) return;
      const data = (await res.json()) as DetalleOrdenResponse;
      setDetalle(data);
    } catch {
      // silently ignore
    } finally {
      setLoadingDetalle(false);
    }
  }, []);

  const fetchHistorial = useCallback(async (id: string) => {
    setLoadingHistorial(true);
    try {
      const res = await fetch(`/api/ordenes/${id}/historial`);
      if (!res.ok) return;
      const data = (await res.json()) as HistorialResponse;
      setHistorial(data.historial);
    } catch {
      // silently ignore
    } finally {
      setLoadingHistorial(false);
    }
  }, []);

  // Fetch when the sheet opens or the orden changes
  useEffect(() => {
    if (!open || !ordenBase) return;
    const id = setTimeout(() => {
      void fetchDetalle(ordenBase.id);
      void fetchHistorial(ordenBase.id);
    }, 0);
    return () => clearTimeout(id);
  }, [open, ordenBase, fetchDetalle, fetchHistorial]);

  const of = detalle?.ordenTrabajo ?? ordenBase;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[480px] flex flex-col p-0 gap-0 overflow-hidden"
      >
        {/* ── Header sticky ── */}
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-slate-200 bg-white flex-shrink-0">
          <div className="flex items-start justify-between gap-3 pr-6">
            <div className="space-y-2 min-w-0">
              <SheetTitle className="font-mono text-lg text-blue-600 leading-none">
                {of?.numero ?? "—"}
              </SheetTitle>
              <div className="flex flex-wrap items-center gap-1.5">
                {of?.estado && <EstadoBadge estado={of.estado} />}
                {of?.prioridad && <PrioridadBadge prioridad={of.prioridad} />}
                {of?.critica && of.estado !== "FINALIZADA" && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                    <AlertTriangle className="size-2.5" />
                    Crítica
                  </span>
                )}
              </div>
            </div>
            {onEdit && ordenBase && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onEdit(ordenBase)}
                className="shrink-0"
              >
                <Edit2 className="size-4" />
                Editar
              </Button>
            )}
          </div>
        </SheetHeader>

        {/* ── Body scrollable ── */}
        <div className="flex-1 overflow-y-auto">
          {loadingDetalle && !detalle ? (
            <DetalleLoading />
          ) : !of ? (
            <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
              Sin datos
            </div>
          ) : (
            <div className="space-y-0 divide-y divide-slate-100">
              {/* Datos generales */}
              <div className="px-5 py-5">
                <Section title="Datos generales">
                  <div className="grid grid-cols-1 gap-3">
                    <InfoRow icon={Hash} label="N.º OF" value={of.numero} />
                    <InfoRow
                      icon={Wrench}
                      label="Proyecto"
                      value={<span className="font-mono">{of.proyecto}</span>}
                    />
                    <InfoRow icon={Wrench} label="Nombre" value={of.nombre} />
                    <InfoRow icon={User} label="Cliente" value={of.cliente} />
                    <InfoRow icon={Wrench} label="Equipo" value={of.equipo} />
                    <InfoRow icon={Building2} label="Sucursal" value={of.sucursal.nombre} />
                    <InfoRow icon={Calendar} label="Creada" value={formatDateTime(of.createdAt)} />
                    {of.slaVencimiento && (
                      <InfoRow
                        icon={Timer}
                        label="SLA vencimiento"
                        value={
                          <span
                            className={cn(
                              new Date(of.slaVencimiento) < new Date() && of.estado !== "FINALIZADA"
                                ? "text-red-600 font-semibold"
                                : ""
                            )}
                          >
                            {formatDate(of.slaVencimiento)}
                            {new Date(of.slaVencimiento) < new Date() &&
                              of.estado !== "FINALIZADA" && (
                                <span className="ml-1 text-red-500 text-xs">(vencido)</span>
                              )}
                          </span>
                        }
                      />
                    )}
                  </div>
                </Section>
              </div>

              {/* HH */}
              <div className="px-5 py-5">
                <Section title="Horas hombre">
                  {detalle ? (
                    <BarraHHGrande
                      consumidas={of.hhConsumidas}
                      estimadas={of.hhEstimadas}
                      productivas={detalle.hhProductivas}
                      noProductivas={detalle.hhNoProductivas}
                    />
                  ) : (
                    <div className="space-y-2">
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-12 w-full rounded-lg" />
                    </div>
                  )}
                </Section>
              </div>

              {/* Técnicos asignados */}
              <div className="px-5 py-5">
                <Section
                  title={`Técnicos asignados (${of.asignaciones.length} / ${of.tecnicosRequeridos})`}
                >
                  {of.asignaciones.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">Sin técnicos asignados.</p>
                  ) : (
                    <ul className="space-y-3">
                      {of.asignaciones.map((a) => {
                        const hhConsumidas = detalle?.hhPorTecnico[a.usuario.id] ?? 0;
                        const pct =
                          a.hhPlanificadas > 0 ? (hhConsumidas / a.hhPlanificadas) * 100 : 0;
                        return (
                          <li key={a.id} className="flex items-center gap-3">
                            <Avatar>
                              <AvatarFallback
                                style={{ backgroundColor: a.usuario.color }}
                                className="text-white text-xs font-bold"
                              >
                                {a.usuario.iniciales}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0 space-y-1">
                              <p className="text-sm font-medium text-slate-800">
                                {a.usuario.nombre}{" "}
                                {a.usuario.apellido && <span>{a.usuario.apellido}</span>}
                              </p>
                              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                                <span>
                                  {formatHorasHombre(hhConsumidas)} /{" "}
                                  {formatHorasHombre(a.hhPlanificadas)} planificadas
                                </span>
                              </div>
                              {a.hhPlanificadas > 0 && (
                                <div className="flex items-center gap-2">
                                  <div className="h-1 flex-1 rounded-full bg-slate-100">
                                    <div
                                      className={cn(
                                        "h-full rounded-full",
                                        pct > 100
                                          ? "bg-red-500"
                                          : pct >= 80
                                            ? "bg-yellow-500"
                                            : "bg-emerald-500"
                                      )}
                                      style={{ width: `${Math.min(100, pct)}%` }}
                                    />
                                  </div>
                                  <span className="text-[10px] font-mono text-slate-400 w-8 text-right">
                                    {pct.toFixed(0)}%
                                  </span>
                                </div>
                              )}
                              {a.fechaAsignacion && (
                                <p className="text-[10px] text-slate-400">
                                  Asignado {formatDate(a.fechaAsignacion)}
                                </p>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Section>
              </div>

              {/* Últimos marcajes */}
              <div className="px-5 py-5">
                <Section title="Últimos marcajes">
                  {loadingDetalle ? (
                    <div className="space-y-3">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : (
                    <TimelineMarcajes marcajes={detalle?.ordenTrabajo.marcajes ?? []} />
                  )}
                </Section>
              </div>

              {/* Historial de estados */}
              <div className="px-5 py-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Historial de cambios
                  </h3>
                  {loadingHistorial && <Loader2 className="size-3.5 animate-spin text-slate-400" />}
                </div>
                {loadingHistorial && historial.length === 0 ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : (
                  <HistorialEstados historial={historial} />
                )}
              </div>

              {/* Bottom padding */}
              <div className="h-6" />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
