/**
 * Templates de PDF para el módulo de reportes.
 *
 * Usa @react-pdf/renderer que genera PDFs server-side (sin DOM/canvas).
 * Se llama desde /api/reportes/exportar con renderToBuffer().
 */

import React from "react";
import { Document, Font, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type {
  OFProductividad,
  SucursalProductividad,
  TecnicoProductividad,
} from "@/types/reportes";
import { fechaCorta, r1, r0 } from "@/lib/services/reportes-service";

// ── Estilos ───────────────────────────────────────────────────────────────

const C = {
  tallerflow: "#006FA0",
  gris: "#64748B",
  grisClaro: "#F1F5F9",
  borde: "#E2E8F0",
  negro: "#1E293B",
  blanco: "#FFFFFF",
  rojo: "#DC2626",
  verde: "#16A34A",
};

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 8,
    paddingTop: 40,
    paddingBottom: 40,
    paddingHorizontal: 36,
    color: C.negro,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: C.tallerflow,
  },
  headerLeft: { flex: 1 },
  marca: { fontSize: 16, fontFamily: "Helvetica-Bold", color: C.tallerflow },
  subtitulo: { fontSize: 9, color: C.gris, marginTop: 2 },
  headerRight: { textAlign: "right" },
  metaDato: { fontSize: 8, color: C.gris, marginTop: 2 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: C.tallerflow,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  thCell: {
    fontFamily: "Helvetica-Bold",
    color: C.blanco,
    fontSize: 7,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.borde,
  },
  tableRowAlt: { backgroundColor: C.grisClaro },
  tdCell: { fontSize: 7, color: C.negro },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: C.borde,
    paddingTop: 6,
  },
  footerText: { fontSize: 6, color: C.gris },
});

// ── Header & Footer compartidos ───────────────────────────────────────────

interface PDFHeaderProps {
  titulo: string;
  desde: string;
  hasta: string;
  sucursal: string;
}

function PDFHeader({ titulo, desde, hasta, sucursal }: PDFHeaderProps) {
  return (
    <View style={s.header}>
      <View style={s.headerLeft}>
        <Text style={s.marca}>TallerFlow</Text>
        <Text style={[s.subtitulo, { fontFamily: "Helvetica-Bold" }]}>{titulo}</Text>
      </View>
      <View style={s.headerRight}>
        <Text style={s.metaDato}>Sucursal: {sucursal}</Text>
        <Text style={s.metaDato}>
          Periodo: {fechaCorta(desde)} – {fechaCorta(hasta)}
        </Text>
      </View>
    </View>
  );
}

function PDFFooter({ usuarioNombre }: { usuarioNombre: string }) {
  const hoy = new Date().toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>
        Generado el {hoy} por {usuarioNombre}
      </Text>
      <Text
        style={s.footerText}
        render={({ pageNumber, totalPages }) => `Página ${pageNumber} / ${totalPages}`}
      />
    </View>
  );
}

// ── Tabla genérica ────────────────────────────────────────────────────────

interface ColDef<T> {
  header: string;
  width: number | string;
  render: (row: T) => string;
  align?: "left" | "right" | "center";
}

function PDFTable<T>({ columns, rows }: { columns: ColDef<T>[]; rows: T[] }) {
  const style = (w: number | string) => ({
    flex: typeof w === "number" ? w : undefined,
    width: typeof w === "string" ? w : undefined,
  });

  return (
    <View>
      {/* Header */}
      <View style={s.tableHeader}>
        {columns.map((c, i) => (
          <Text key={i} style={[s.thCell, style(c.width), { textAlign: c.align ?? "left" }]}>
            {c.header}
          </Text>
        ))}
      </View>
      {/* Rows */}
      {rows.map((row, ri) => (
        <View key={ri} style={[s.tableRow, ri % 2 === 1 ? s.tableRowAlt : {}]}>
          {columns.map((c, ci) => (
            <Text key={ci} style={[s.tdCell, style(c.width), { textAlign: c.align ?? "left" }]}>
              {c.render(row)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

// ── PDF Técnicos ──────────────────────────────────────────────────────────

const COLS_TECNICOS: ColDef<TecnicoProductividad>[] = [
  { header: "Técnico", width: 2, render: (r) => r.nombre },
  { header: "HH Prod.", width: 1, render: (r) => `${r1(r.hhProductivas)}h`, align: "right" },
  { header: "HH No Prod.", width: 1, render: (r) => `${r1(r.hhNoProductivas)}h`, align: "right" },
  { header: "HH Total", width: 1, render: (r) => `${r1(r.hhTotal)}h`, align: "right" },
  { header: "Productividad", width: 1, render: (r) => `${r0(r.productividad)}%`, align: "right" },
  { header: "Días Trab.", width: 1, render: (r) => String(r.diasTrabajados), align: "right" },
  { header: "Prom. HH/día", width: 1, render: (r) => `${r1(r.promedioHHDia)}h`, align: "right" },
  { header: "Act. Principal", width: 2, render: (r) => r.actividadPrincipal },
  { header: "OF", width: 0.8, render: (r) => String(r.ofAtendidas), align: "right" },
];

// ── PDF OF ────────────────────────────────────────────────────────────────

const COLS_OF: ColDef<OFProductividad>[] = [
  { header: "OF", width: 1, render: (r) => r.numero },
  { header: "Cliente", width: 2, render: (r) => r.cliente },
  { header: "Estado", width: 1, render: (r) => r.estado },
  { header: "HH Est.", width: 1, render: (r) => `${r1(r.hhEstimadas)}h`, align: "right" },
  { header: "HH Cons.", width: 1, render: (r) => `${r1(r.hhConsumidas)}h`, align: "right" },
  { header: "Desv. %", width: 1, render: (r) => `${r0(r.desviacionPorcentaje)}%`, align: "right" },
  { header: "Efic. %", width: 1, render: (r) => `${r0(r.eficiencia)}%`, align: "right" },
  { header: "SLA", width: 1, render: (r) => r.slaStatus },
  { header: "Técnicos", width: 1, render: (r) => String(r.tecnicosInvolucrados), align: "right" },
];

// ── PDF Sucursales ────────────────────────────────────────────────────────

const COLS_SUCURSALES: ColDef<SucursalProductividad>[] = [
  { header: "Sucursal", width: 2, render: (r) => r.nombre },
  { header: "Técnicos", width: 1, render: (r) => String(r.tecnicosActivos), align: "right" },
  { header: "OF Total", width: 1, render: (r) => String(r.ofTotal), align: "right" },
  { header: "OF Final.", width: 1, render: (r) => String(r.ofFinalizadas), align: "right" },
  { header: "HH Prod.", width: 1, render: (r) => `${r1(r.hhProductivas)}h`, align: "right" },
  { header: "Productiv.", width: 1, render: (r) => `${r0(r.productividad)}%`, align: "right" },
  { header: "Utiliz.", width: 1, render: (r) => `${r0(r.utilizacion)}%`, align: "right" },
  { header: "MTTR", width: 1, render: (r) => `${r1(r.mttr)}h`, align: "right" },
  { header: "SLA %", width: 1, render: (r) => `${r0(r.slaCumplimiento)}%`, align: "right" },
];

// ── Props del documento principal ─────────────────────────────────────────

interface ReportePDFProps {
  tipo: "tecnicos" | "ordenes" | "sucursales";
  titulo: string;
  desde: string;
  hasta: string;
  sucursal: string;
  usuarioNombre: string;
  dataTecnicos?: TecnicoProductividad[];
  dataOF?: OFProductividad[];
  dataSucursales?: SucursalProductividad[];
}

export function ReportePDF({
  tipo,
  titulo,
  desde,
  hasta,
  sucursal,
  usuarioNombre,
  dataTecnicos = [],
  dataOF = [],
  dataSucursales = [],
}: ReportePDFProps) {
  return (
    <Document title={titulo} author="TallerFlow" creator="TallerFlow">
      <Page size="A4" orientation="landscape" style={s.page}>
        <PDFHeader titulo={titulo} desde={desde} hasta={hasta} sucursal={sucursal} />

        {tipo === "tecnicos" && <PDFTable columns={COLS_TECNICOS} rows={dataTecnicos} />}
        {tipo === "ordenes" && <PDFTable columns={COLS_OF} rows={dataOF} />}
        {tipo === "sucursales" && <PDFTable columns={COLS_SUCURSALES} rows={dataSucursales} />}

        <PDFFooter usuarioNombre={usuarioNombre} />
      </Page>
    </Document>
  );
}

// Previene que el módulo sea evaluado en modo SSR antes de tiempo
// (React PDF usa APIs de canvas internamente en algunas versiones).
ReportePDF.displayName = "ReportePDF";
