"use client";

import { useState, useMemo, useCallback } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useOFMarcajes } from "@/hooks/useOrdenesReporte";
import type { OFProductividad } from "@/types/reportes";
import type { FiltroReporte } from "@/types/reportes-ui";

// ── Types ──────────────────────────────────────────────────────────────────

type SortKey =
  | "numero"
  | "nombre"
  | "cliente"
  | "estado"
  | "hhEstimadas"
  | "hhConsumidas"
  | "desviacion"
  | "eficiencia"
  | "tecnicosInvolucrados"
  | "slaStatus";

interface Props {
  filtros: FiltroReporte;
  data: OFProductividad[];
  loading: boolean;
  error: string | null;
}

// ── Pills / inline renderers ───────────────────────────────────────────────

function PillSLA({ status }: { status: OFProductividad["slaStatus"] }) {
  const cfg = {
    cumplido: { bg: "bg-green-100 text-green-700", label: "Cumplido" },
    vencido: { bg: "bg-red-100 text-red-700", label: "Vencido" },
    sin_sla: { bg: "bg-slate-100 text-slate-500", label: "Sin SLA" },
  }[status];
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", cfg.bg)}>
      {cfg.label}
    </span>
  );
}

function CeldaDesviacion({ valor, pct }: { valor: number; pct: number }) {
  if (valor === 0) return <span className="text-xs text-slate-400">0</span>;
  const positiva = valor > 0;
  return (
    <span
      className={cn(
        "text-xs font-semibold tabular-nums",
        positiva ? "text-red-600" : "text-green-600"
      )}
    >
      {positiva ? "+" : ""}
      {valor.toFixed(1)}h
      <span className="ml-1 font-normal opacity-70">
        ({positiva ? "+" : ""}
        {pct}%)
      </span>
    </span>
  );
}

function CeldaEficiencia({ pct }: { pct: number }) {
  if (pct === 0) return <span className="text-xs text-slate-400">—</span>;
  const sobre = pct >= 100;
  return (
    <span
      className={cn(
        "text-xs font-semibold tabular-nums",
        sobre ? "text-green-600" : "text-red-600"
      )}
    >
      {pct}%
    </span>
  );
}

// ── Sort header ────────────────────────────────────────────────────────────

function SortTh({
  label,
  sortKey,
  currentKey,
  currentDir,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  currentDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const active = currentKey === sortKey;
  return (
    <th
      className={cn(
        "cursor-pointer select-none whitespace-nowrap px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700",
        className
      )}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          currentDir === "asc" ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-30" />
        )}
      </span>
    </th>
  );
}

// ── Panel de detalle (Sheet) ───────────────────────────────────────────────

function PanelDetalleOF({
  of,
  open,
  onClose,
  desde,
  hasta,
}: {
  of: OFProductividad | null;
  open: boolean;
  onClose: () => void;
  desde: string;
  hasta: string;
}) {
  const { segments, loading: loadingSegs } = useOFMarcajes({
    ofId: of?.ofId ?? null,
    desde,
    hasta,
    enabled: open && !!of,
  });

  if (!of) return null;

  const totalHH = of.desglosePorTecnico.reduce((a, t) => a + t.hh, 0);

  // Agrupar segmentos por fecha para el mini-timeline
  const segsByDia = useMemo(() => {
    const map = new Map<string, typeof segments>();
    for (const s of segments) {
      const fecha = s.inicio.slice(0, 10);
      if (!map.has(fecha)) map.set(fecha, []);
      map.get(fecha)!.push(s);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [segments]);

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="mb-4">
          <div className="space-y-0.5">
            <p className="text-xs font-mono text-slate-400">{of.numero}</p>
            <SheetTitle className="text-lg leading-tight">{of.nombre}</SheetTitle>
            <p className="text-xs text-slate-500">
              {of.cliente} · {of.equipo}
            </p>
          </div>
          {/* Stats strip */}
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600">
            <span>
              <span className="font-semibold text-slate-800">{of.hhEstimadas.toFixed(1)}h</span>{" "}
              estimadas
            </span>
            <span>
              <span className="font-semibold text-slate-800">{of.hhConsumidas.toFixed(1)}h</span>{" "}
              consumidas
            </span>
            <span>
              <span
                className={cn(
                  "font-semibold",
                  of.desviacion > 0 ? "text-red-600" : "text-green-600"
                )}
              >
                {of.desviacion > 0 ? "+" : ""}
                {of.desviacion.toFixed(1)}h
              </span>{" "}
              desviación
            </span>
            <span>
              <span className="font-semibold">{of.diasEnProceso}</span> días en proceso
            </span>
          </div>
        </SheetHeader>

        {/* Desglose por técnico */}
        <section className="mb-6">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            HH por técnico
          </h3>
          {of.desglosePorTecnico.length === 0 ? (
            <p className="text-xs text-slate-400">Sin técnicos involucrados.</p>
          ) : (
            <>
              {/* Stacked bar */}
              <div className="flex h-4 w-full overflow-hidden rounded-md bg-slate-100">
                {of.desglosePorTecnico.map((t) => (
                  <div
                    key={t.tecnicoId}
                    style={{
                      width: totalHH > 0 ? `${(t.hh / totalHH) * 100}%` : "0%",
                      backgroundColor: t.color,
                    }}
                    title={`${t.nombre}: ${t.hh.toFixed(1)}h`}
                    className="h-full"
                  />
                ))}
              </div>
              {/* Tabla */}
              <ul className="mt-3 space-y-2">
                {of.desglosePorTecnico.map((t) => (
                  <li key={t.tecnicoId} className="flex items-center gap-2">
                    <Avatar className="h-6 w-6 shrink-0">
                      <AvatarFallback
                        style={{ backgroundColor: t.color }}
                        className="text-[9px] font-semibold text-white"
                      >
                        {t.iniciales}
                      </AvatarFallback>
                    </Avatar>
                    <span className="flex-1 truncate text-xs text-slate-700">{t.nombre}</span>
                    <div className="w-24 overflow-hidden rounded-full bg-slate-100 h-1.5">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: totalHH > 0 ? `${Math.min((t.hh / totalHH) * 100, 100)}%` : "0%",
                          backgroundColor: t.color,
                        }}
                      />
                    </div>
                    <span className="w-14 text-right font-mono text-xs font-semibold tabular-nums text-slate-800">
                      {t.hh.toFixed(1)}h
                    </span>
                    <span className="w-8 text-right text-[10px] text-slate-400 tabular-nums">
                      {totalHH > 0 ? Math.round((t.hh / totalHH) * 100) : 0}%
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* Timeline por día */}
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Timeline de trabajo
          </h3>
          {loadingSegs ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : segsByDia.length === 0 ? (
            <p className="text-xs text-slate-400">Sin marcajes en el periodo.</p>
          ) : (
            <div className="space-y-2">
              {segsByDia.map(([fecha, segs]) => {
                // Calcular posición relativa dentro del día (07:00 a 18:00)
                const RANGE_START = 7 * 60; // minutos desde medianoche
                const RANGE_END = 18 * 60;
                const RANGE = RANGE_END - RANGE_START;

                return (
                  <div key={fecha} className="grid grid-cols-[64px_1fr] gap-2 items-center">
                    <span className="text-right text-[10px] font-mono text-slate-500">
                      {fecha.slice(5)} {/* MM-DD */}
                    </span>
                    <div className="relative h-6 overflow-hidden rounded bg-slate-50 ring-1 ring-slate-100">
                      {segs.map((s) => {
                        const inicio = new Date(s.inicio);
                        const fin = new Date(s.fin);
                        const iniMin = inicio.getHours() * 60 + inicio.getMinutes();
                        const finMin = fin.getHours() * 60 + fin.getMinutes();
                        const left = Math.max(0, ((iniMin - RANGE_START) / RANGE) * 100);
                        const width = Math.max(
                          1,
                          ((Math.min(finMin, RANGE_END) - Math.max(iniMin, RANGE_START)) / RANGE) *
                            100
                        );
                        return (
                          <span
                            key={s.id}
                            className="absolute top-0 h-full"
                            style={{
                              left: `${left}%`,
                              width: `${width}%`,
                              backgroundColor: s.color,
                            }}
                            title={`${s.tecnico.nombre} · ${s.actividad} · ${s.duracionMinutos}min`}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {/* Eje hora */}
              <div className="grid grid-cols-[64px_1fr] gap-2">
                <div />
                <div className="flex justify-between text-[9px] font-mono text-slate-400 px-0.5">
                  {["07h", "09h", "11h", "13h", "15h", "17h", "18h"].map((h) => (
                    <span key={h}>{h}</span>
                  ))}
                </div>
              </div>
              {/* Leyenda */}
              <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-slate-500">
                {[
                  { color: "#22C55E", label: "Trabajo" },
                  { color: "#F4A91A", label: "Pausa" },
                  { color: "#E82C2C", label: "Espera repuesto" },
                  { color: "#00AEEF", label: "Almuerzo" },
                ].map((l) => (
                  <span key={l.label} className="flex items-center gap-1">
                    <span
                      className="inline-block h-2 w-2 rounded-sm"
                      style={{ backgroundColor: l.color }}
                    />
                    {l.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      </SheetContent>
    </Sheet>
  );
}

// ── Componente principal ───────────────────────────────────────────────────

export function ReporteOrdenes({ filtros, data, loading, error }: Props) {
  const [sortBy, setSortBy] = useState<SortKey>("hhConsumidas");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleSort = useCallback((key: SortKey) => {
    setSortBy((prev) => {
      if (prev === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
      else setSortDir("desc");
      return key;
    });
  }, []);

  const sorted = useMemo(() => {
    const arr = [...data];
    arr.sort((a, b) => {
      const av = a[sortBy] as number | string;
      const bv = b[sortBy] as number | string;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [data, sortBy, sortDir]);

  const selected = data.find((o) => o.ofId === selectedId) ?? null;

  const SORT_PROPS = { currentKey: sortBy, currentDir: sortDir, onSort: handleSort };

  if (loading && data.length === 0) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (error && data.length === 0) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-8 text-center text-sm text-red-600">
        {error}
      </p>
    );
  }

  if (data.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-16 text-center text-sm text-slate-500">
        No hay órdenes de trabajo con marcajes en el periodo seleccionado.
      </p>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              <SortTh label="OF" sortKey="numero" className="pl-4" {...SORT_PROPS} />
              <SortTh label="Nombre" sortKey="nombre" {...SORT_PROPS} />
              <SortTh label="Cliente" sortKey="cliente" {...SORT_PROPS} />
              <SortTh label="Estado" sortKey="estado" {...SORT_PROPS} />
              <SortTh label="HH Est." sortKey="hhEstimadas" {...SORT_PROPS} />
              <SortTh label="HH Cons." sortKey="hhConsumidas" {...SORT_PROPS} />
              <SortTh label="Desviación" sortKey="desviacion" {...SORT_PROPS} />
              <SortTh label="Eficiencia" sortKey="eficiencia" {...SORT_PROPS} />
              <SortTh label="Técnicos" sortKey="tecnicosInvolucrados" {...SORT_PROPS} />
              <SortTh label="SLA" sortKey="slaStatus" {...SORT_PROPS} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((of) => (
              <tr
                key={of.ofId}
                onClick={() => setSelectedId(of.ofId)}
                className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors"
              >
                {/* OF */}
                <td className="py-2.5 pl-4 pr-3 align-middle">
                  <span className="font-mono text-xs font-bold text-slate-800">{of.numero}</span>
                </td>

                {/* Nombre */}
                <td className="max-w-[160px] truncate px-3 py-2.5 align-middle text-xs text-slate-700">
                  {of.nombre}
                </td>

                {/* Cliente */}
                <td className="max-w-[120px] truncate px-3 py-2.5 align-middle text-xs text-slate-600">
                  {of.cliente}
                </td>

                {/* Estado */}
                <td className="px-3 py-2.5 align-middle">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      {
                        PENDIENTE: "bg-slate-100 text-slate-600",
                        EN_PROCESO: "bg-blue-100 text-blue-700",
                        PAUSADA: "bg-yellow-100 text-yellow-700",
                        ESPERA_REPUESTO: "bg-orange-100 text-orange-700",
                        FINALIZADA: "bg-green-100 text-green-700",
                      }[of.estado]
                    )}
                  >
                    {of.estado.replace("_", " ")}
                  </span>
                </td>

                {/* HH Est */}
                <td className="px-3 py-2.5 align-middle font-mono text-xs tabular-nums text-slate-600">
                  {of.hhEstimadas.toFixed(1)}h
                </td>

                {/* HH Cons */}
                <td className="px-3 py-2.5 align-middle font-mono text-xs font-semibold tabular-nums text-slate-800">
                  {of.hhConsumidas.toFixed(1)}h
                </td>

                {/* Desviación */}
                <td className="px-3 py-2.5 align-middle">
                  <CeldaDesviacion valor={of.desviacion} pct={of.desviacionPorcentaje} />
                </td>

                {/* Eficiencia */}
                <td className="px-3 py-2.5 align-middle">
                  <CeldaEficiencia pct={of.eficiencia} />
                </td>

                {/* Técnicos */}
                <td className="px-3 py-2.5 align-middle text-center text-xs text-slate-600">
                  {of.tecnicosInvolucrados}
                </td>

                {/* SLA */}
                <td className="px-3 py-2.5 align-middle">
                  <PillSLA status={of.slaStatus} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        Click en una fila para ver el desglose por técnico y el timeline de trabajo.
      </p>

      <PanelDetalleOF
        of={selected}
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
        desde={filtros.desde}
        hasta={filtros.hasta}
      />
    </>
  );
}
