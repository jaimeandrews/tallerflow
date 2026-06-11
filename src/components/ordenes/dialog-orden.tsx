"use client";

import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { AlertCircle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { PRIORIDAD_OF_LABELS, PRIORIDAD_OF_ORDER } from "@/lib/utils/constants";
import type { PrioridadOF } from "@/generated/prisma";
import type {
  ActualizarOFPayload,
  CrearOFPayload,
  OrdenTrabajoListItem,
  SucursalInfo,
} from "@/types/ordenes";

// ── Zod schema ─────────────────────────────────────────────────────────────

const schema = z.object({
  numero: z.string().min(1, "El número de OF es requerido").max(20, "Máximo 20 caracteres"),
  proyecto: z.string().min(1, "El proyecto es requerido").max(200, "Máximo 200 caracteres"),
  nombre: z.string().min(1, "El nombre es requerido").max(200, "Máximo 200 caracteres"),
  cliente: z.string().min(1, "El cliente es requerido").max(200, "Máximo 200 caracteres"),
  equipo: z.string().min(1, "El equipo es requerido").max(200, "Máximo 200 caracteres"),
  sucursalId: z.string().min(1, "Debe seleccionar una sucursal"),
  prioridad: z.enum(["CRITICA", "ALTA", "MEDIA", "BAJA"]),
  hhEstimadas: z.coerce.number().positive("Debe ser mayor a 0").max(999, "Máximo 999 HH"),
  tecnicosRequeridos: z.coerce
    .number()
    .int("Debe ser entero")
    .min(1, "Mínimo 1 técnico")
    .max(10, "Máximo 10 técnicos"),
  slaVencimiento: z.string().optional(),
  critica: z.boolean(),
});

type FormSchema = z.infer<typeof schema>;
type FieldErrors = Partial<Record<keyof FormSchema, string>>;

// ── Estado inicial ─────────────────────────────────────────────────────────

function initialValues(
  orden: OrdenTrabajoListItem | null | undefined,
  sucursalIdDefault: string
): FormSchema {
  return {
    numero: orden?.numero ?? "",
    proyecto: orden?.proyecto ?? "",
    nombre: orden?.nombre ?? "",
    cliente: orden?.cliente ?? "",
    equipo: orden?.equipo ?? "",
    sucursalId: orden?.sucursalId ?? sucursalIdDefault,
    prioridad: orden?.prioridad ?? "MEDIA",
    hhEstimadas: orden?.hhEstimadas ?? (0 as number),
    tecnicosRequeridos: orden?.tecnicosRequeridos ?? 1,
    slaVencimiento: orden?.slaVencimiento ? orden.slaVencimiento.slice(0, 16) : "",
    critica: orden?.critica ?? false,
  };
}

// ── Props ──────────────────────────────────────────────────────────────────

interface DialogOrdenProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orden?: OrdenTrabajoListItem | null;
  sucursales: SucursalInfo[];
  sucursalIdDefault?: string;
  canSelectSucursal: boolean;
  onSuccess?: () => void;
}

// ── Componente principal ───────────────────────────────────────────────────

export function DialogOrden({
  open,
  onOpenChange,
  orden,
  sucursales,
  sucursalIdDefault = "",
  canSelectSucursal,
  onSuccess,
}: DialogOrdenProps) {
  const editing = !!orden;

  const [form, setForm] = useState<FormSchema>(() => initialValues(orden, sucursalIdDefault));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  // Reset on open/orden change
  const [snapshotKey, setSnapshotKey] = useState(`${open}|${orden?.id ?? ""}`);
  const currentKey = `${open}|${orden?.id ?? ""}`;
  if (currentKey !== snapshotKey) {
    setSnapshotKey(currentKey);
    if (open) {
      setForm(initialValues(orden, sucursalIdDefault));
      setErrors({});
    }
  }

  function set<K extends keyof FormSchema>(key: K, value: FormSchema[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function validateField<K extends keyof FormSchema>(key: K) {
    const partial = schema.shape[key].safeParse(form[key]);
    if (!partial.success) {
      setErrors((e) => ({ ...e, [key]: partial.error.issues[0]?.message }));
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;

    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormSchema;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    const data = parsed.data;
    const slaIso = data.slaVencimiento ? new Date(data.slaVencimiento).toISOString() : undefined;

    setSaving(true);
    try {
      if (editing && orden) {
        const payload: ActualizarOFPayload = {
          numero: data.numero,
          proyecto: data.proyecto,
          nombre: data.nombre,
          cliente: data.cliente,
          equipo: data.equipo,
          prioridad: data.prioridad,
          hhEstimadas: data.hhEstimadas,
          tecnicosRequeridos: data.tecnicosRequeridos,
          slaVencimiento: slaIso,
          critica: data.critica,
        };
        const res = await fetch(`/api/ordenes/${orden.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? `Error ${res.status}`);
        }
        toast.success(`OF ${data.numero} actualizada`);
      } else {
        const payload: CrearOFPayload = {
          numero: data.numero,
          proyecto: data.proyecto,
          nombre: data.nombre,
          cliente: data.cliente,
          equipo: data.equipo,
          sucursalId: data.sucursalId,
          hhEstimadas: data.hhEstimadas,
          prioridad: data.prioridad,
          tecnicosRequeridos: data.tecnicosRequeridos,
          slaVencimiento: slaIso,
          critica: data.critica,
        };
        const res = await fetch("/api/ordenes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? `Error ${res.status}`);
        }
        toast.success(`OF ${data.numero} creada`);
      }
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  const hasErrors = Object.values(errors).some(Boolean);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing ? `Editar OF ${orden?.numero}` : "Nueva orden de trabajo"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Modifica los datos de la orden. Los campos marcados con * son obligatorios."
              : "Completa los datos para registrar una nueva OF. Los campos marcados con * son obligatorios."}
          </DialogDescription>
        </DialogHeader>

        {hasErrors && (
          <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertCircle className="size-3.5 shrink-0" />
            Hay campos con errores. Corrígelos antes de continuar.
          </div>
        )}

        <form onSubmit={submit} id="form-of" className="space-y-4 py-1">
          {/* Fila 1: Número + Proyecto */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Número de OF *" error={errors.numero}>
              <Input
                value={form.numero}
                onChange={(e) => set("numero", e.target.value)}
                onBlur={() => validateField("numero")}
                placeholder="OF-2026-0001"
                maxLength={20}
                aria-invalid={!!errors.numero}
              />
              <Counter current={form.numero.length} max={20} />
            </Field>
            <Field label="Proyecto *" error={errors.proyecto}>
              <Input
                value={form.proyecto}
                onChange={(e) => set("proyecto", e.target.value)}
                onBlur={() => validateField("proyecto")}
                placeholder="Código o nombre del proyecto"
                aria-invalid={!!errors.proyecto}
              />
            </Field>
          </div>

          {/* Nombre completo */}
          <Field label="Nombre / descripción *" error={errors.nombre}>
            <Input
              value={form.nombre}
              onChange={(e) => set("nombre", e.target.value)}
              onBlur={() => validateField("nombre")}
              placeholder="Reparación motor principal línea 3"
              aria-invalid={!!errors.nombre}
            />
          </Field>

          {/* Cliente + Equipo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Cliente *" error={errors.cliente}>
              <Input
                value={form.cliente}
                onChange={(e) => set("cliente", e.target.value)}
                onBlur={() => validateField("cliente")}
                aria-invalid={!!errors.cliente}
              />
            </Field>
            <Field label="Equipo *" error={errors.equipo}>
              <Input
                value={form.equipo}
                onChange={(e) => set("equipo", e.target.value)}
                onBlur={() => validateField("equipo")}
                placeholder="Motor / Bomba / Compresor…"
                aria-invalid={!!errors.equipo}
              />
            </Field>
          </div>

          {/* Sucursal + Prioridad + Técnicos */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Sucursal *" error={errors.sucursalId}>
              <Select
                value={form.sucursalId}
                onValueChange={(v) => set("sucursalId", v)}
                disabled={editing || !canSelectSucursal}
              >
                <SelectTrigger className={cn("w-full", errors.sucursalId && "border-destructive")}>
                  <SelectValue placeholder="Seleccionar…" />
                </SelectTrigger>
                <SelectContent>
                  {sucursales.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Prioridad *" error={errors.prioridad}>
              <Select
                value={form.prioridad}
                onValueChange={(v) => {
                  set("prioridad", v as PrioridadOF);
                  if (v === "CRITICA") set("critica", true);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORIDAD_OF_ORDER.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORIDAD_OF_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Técnicos requeridos *" error={errors.tecnicosRequeridos}>
              <Input
                type="number"
                min={1}
                max={10}
                value={form.tecnicosRequeridos}
                onChange={(e) => set("tecnicosRequeridos", Number(e.target.value))}
                onBlur={() => validateField("tecnicosRequeridos")}
                aria-invalid={!!errors.tecnicosRequeridos}
              />
            </Field>
          </div>

          {/* HH Estimadas + SLA */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="HH estimadas *" error={errors.hhEstimadas} hint="Máximo 999 · Paso 0.5">
              <Input
                type="number"
                step={0.5}
                min={0.5}
                max={999}
                value={form.hhEstimadas || ""}
                onChange={(e) => set("hhEstimadas", Number(e.target.value))}
                onBlur={() => validateField("hhEstimadas")}
                placeholder="8"
                aria-invalid={!!errors.hhEstimadas}
              />
            </Field>
            <Field label="SLA vencimiento" hint="Opcional">
              <Input
                type="datetime-local"
                value={form.slaVencimiento ?? ""}
                onChange={(e) => set("slaVencimiento", e.target.value)}
              />
            </Field>
          </div>

          {/* Crítica */}
          <label className="flex items-start gap-3 cursor-pointer rounded-md border border-slate-200 p-3 hover:bg-slate-50 transition-colors">
            <Checkbox
              checked={form.critica}
              onCheckedChange={(v) => set("critica", !!v)}
              className="mt-0.5"
            />
            <div>
              <span className="text-sm font-medium text-slate-800">Marcar como crítica</span>
              <p className="text-xs text-slate-500 mt-0.5">
                Las OF críticas se resaltan en tableros y aparecen primero en los reportes.
              </p>
            </div>
          </label>
        </form>

        <DialogFooter className="gap-2 pt-2 border-t border-slate-100">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button type="submit" form="form-of" disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {editing ? "Guardar cambios" : "Crear orden"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Field wrapper ──────────────────────────────────────────────────────────

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-slate-600">{label}</label>
      {children}
      {error ? (
        <p className="flex items-center gap-1 text-xs text-red-600">
          <AlertCircle className="size-3 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <p className="text-[11px] text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}

function Counter({ current, max }: { current: number; max: number }) {
  return (
    <p
      className={cn(
        "text-[10px] text-right font-mono -mt-0.5",
        current > max * 0.85 ? "text-amber-600" : "text-slate-400"
      )}
    >
      {current}/{max}
    </p>
  );
}
