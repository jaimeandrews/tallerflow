"use client";

import { useState, useEffect } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROL_LABELS } from "@/lib/utils/constants";
import { COLORES_PALETA } from "@/lib/services/configuracion-usuarios-service";

// ── Types ─────────────────────────────────────────────────────────────────────

type Rol =
  | "ADMIN"
  | "GERENTE_SUCURSAL"
  | "JEFE_TALLER"
  | "COORDINADOR"
  | "TECNICO"
  | "CONTROL_GESTION";

const TODOS_LOS_ROLES: Rol[] = [
  "ADMIN",
  "GERENTE_SUCURSAL",
  "JEFE_TALLER",
  "COORDINADOR",
  "TECNICO",
  "CONTROL_GESTION",
];

interface Especialidad {
  id: string;
  nombre: string;
}

export interface UsuarioParaEditar {
  id: string;
  email: string;
  nombre: string;
  apellido: string;
  rut: string | null;
  iniciales: string;
  rol: Rol;
  sucursalId: string;
  color: string;
  especialidades: { especialidad: Especialidad }[];
}

interface Props {
  usuario?: UsuarioParaEditar;
  callerRol: RolUsuario;
  callerSucursalId: string;
  callerId: string;
  sucursales: { id: string; nombre: string; codigo: string }[];
  onClose: () => void;
  onSaved: () => void;
}

// ── Utils ─────────────────────────────────────────────────────────────────────

/** Formatea RUT mientras escribe: 12345678-9 → 12.345.678-9 */
function formatRut(raw: string): string {
  const clean = raw.replace(/[^0-9kK]/g, "").toUpperCase();
  if (clean.length <= 1) return clean;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  const fmt = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${fmt}-${dv}`;
}

/** Algoritmo módulo 11 para verificar RUT chileno */
function validarRut(rut: string): boolean {
  const clean = rut.replace(/\./g, "").replace(/-/g, "").trim().toUpperCase();
  if (!/^\d{7,9}[0-9K]$/.test(clean)) return false;
  const body = clean.slice(0, -1);
  const dvIngresado = clean.slice(-1);
  let suma = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    suma += parseInt(body[i]) * mul;
    mul = mul < 7 ? mul + 1 : 2;
  }
  const r = 11 - (suma % 11);
  const dvCalc = r === 11 ? "0" : r === 10 ? "K" : String(r);
  return dvIngresado === dvCalc;
}

function rolesDisponibles(callerRol: RolUsuario): Rol[] {
  if (callerRol === "ADMIN") return TODOS_LOS_ROLES;
  if (callerRol === "JEFE_TALLER") return ["COORDINADOR", "TECNICO"];
  return [];
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FieldError({ error }: { error?: string }) {
  if (!error) return null;
  return <p className="text-xs text-red-500 mt-0.5">{error}</p>;
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-600">{label}</label>
      <div className="mt-1">{children}</div>
      <FieldError error={error} />
    </div>
  );
}

function errCls(error?: string) {
  return error ? "border-red-400 focus-visible:ring-red-300" : "";
}

// ── Main component ────────────────────────────────────────────────────────────

export function DialogUsuario({
  usuario,
  callerRol,
  callerSucursalId,
  callerId,
  sucursales,
  onClose,
  onSaved,
}: Props) {
  const editing = !!usuario;
  const isOwn = usuario?.id === callerId;
  const allowedRoles = rolesDisponibles(callerRol);

  const defaultSucursalId =
    callerRol === "JEFE_TALLER" ? callerSucursalId : (sucursales[0]?.id ?? "");

  const [form, setForm] = useState({
    nombre: usuario?.nombre ?? "",
    apellido: usuario?.apellido ?? "",
    email: usuario?.email ?? "",
    rut: usuario?.rut ?? "",
    rol: (usuario?.rol ?? allowedRoles[0] ?? "TECNICO") as Rol,
    sucursalId: usuario?.sucursalId ?? defaultSucursalId,
    password: "",
    pin: "",
    color: usuario?.color ?? COLORES_PALETA[0],
  });

  const [especialidades, setEspecialidades] = useState<Especialidad[]>([]);
  const [selectedEsp, setSelectedEsp] = useState<Set<string>>(
    new Set(usuario?.especialidades.map((e) => e.especialidad.id) ?? [])
  );

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPwd, setShowPwd] = useState(false);
  const [changePwd, setChangePwd] = useState(false);

  useEffect(() => {
    fetch("/api/configuracion/especialidades")
      .then((r) => r.json())
      .then((j) => setEspecialidades(j.data ?? []))
      .catch(() => {});
  }, []);

  const isTecnico = form.rol === "TECNICO";

  // Rol select logic: show current rol even if outside allowed (for edit)
  const rolOpciones: Rol[] =
    editing && !allowedRoles.includes(form.rol) ? [form.rol, ...allowedRoles] : allowedRoles;
  const rolDisabled = isOwn || (editing && !allowedRoles.includes(form.rol));

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [field]: e.target.value }));

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.nombre.trim()) errs.nombre = "Requerido";
    if (!form.apellido.trim()) errs.apellido = "Requerido";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = "Email inválido";
    if (form.rut.trim() && !validarRut(form.rut)) {
      errs.rut = "RUT inválido (verifica el dígito verificador)";
    }
    if (!editing && form.password.length < 6) errs.password = "Mínimo 6 caracteres";
    if (editing && changePwd && form.password.length < 6) errs.password = "Mínimo 6 caracteres";
    if (isTecnico && form.pin && !/^\d{4}$/.test(form.pin)) {
      errs.pin = "Debe tener exactamente 4 dígitos";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        nombre: form.nombre.trim(),
        apellido: form.apellido.trim(),
        email: form.email.trim(),
        ...(form.rut.trim() ? { rut: form.rut.trim() } : {}),
        color: form.color,
      };
      if (!editing) {
        body.rol = form.rol;
        body.sucursalId = form.sucursalId;
        body.password = form.password;
      } else {
        if (!rolDisabled) body.rol = form.rol;
        if (callerRol === "ADMIN") body.sucursalId = form.sucursalId;
        if (changePwd) body.password = form.password;
      }
      if (isTecnico && form.pin) body.pin = form.pin;
      if (isTecnico) body.especialidadIds = Array.from(selectedEsp);

      const url = editing
        ? `/api/configuracion/usuarios/${usuario!.id}`
        : "/api/configuracion/usuarios";

      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        if (data.issues) {
          const fe: Record<string, string> = {};
          for (const iss of data.issues) {
            if (iss.path?.[0]) fe[iss.path[0]] = iss.message;
          }
          setErrors(fe);
        }
        toast.error(data.error ?? "Error al guardar");
        return;
      }
      toast.success(editing ? "Usuario actualizado" : "Usuario creado correctamente");
      onSaved();
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  const previewInitials = (form.nombre.charAt(0) + form.apellido.charAt(0)).toUpperCase() || "??";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            {editing ? `Editar usuario — ${usuario!.nombre} ${usuario!.apellido}` : "Nuevo usuario"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-1">
          {/* Nombre + Apellido */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre *" error={errors.nombre}>
              <Input
                value={form.nombre}
                onChange={set("nombre")}
                required
                className={errCls(errors.nombre)}
              />
            </Field>
            <Field label="Apellido *" error={errors.apellido}>
              <Input
                value={form.apellido}
                onChange={set("apellido")}
                required
                className={errCls(errors.apellido)}
              />
            </Field>
          </div>

          {/* Email */}
          <Field label="Email *" error={errors.email}>
            <Input
              type="email"
              value={form.email}
              onChange={set("email")}
              required
              className={errCls(errors.email)}
            />
          </Field>

          {/* RUT */}
          <Field label="RUT" error={errors.rut}>
            <Input
              value={form.rut}
              onChange={(e) => setForm((p) => ({ ...p, rut: formatRut(e.target.value) }))}
              placeholder="12.345.678-9"
              className={errCls(errors.rut)}
            />
          </Field>

          {/* Rol + Sucursal */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600">Rol *</label>
              <Select
                value={form.rol}
                onValueChange={(v) => setForm((p) => ({ ...p, rol: v as Rol }))}
                disabled={rolDisabled}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {rolOpciones.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROL_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isOwn && (
                <p className="text-[10px] text-slate-400 mt-0.5">No puedes cambiar tu propio rol</p>
              )}
              {!isOwn && rolDisabled && (
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Sin permisos para cambiar este rol
                </p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Sucursal *</label>
              <Select
                value={form.sucursalId}
                onValueChange={(v) => setForm((p) => ({ ...p, sucursalId: v }))}
                disabled={callerRol !== "ADMIN"}
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
          </div>

          {/* Contraseña */}
          {!editing ? (
            <Field label="Contraseña *" error={errors.password}>
              <div className="relative">
                <Input
                  type={showPwd ? "text" : "password"}
                  value={form.password}
                  onChange={set("password")}
                  required
                  placeholder="Mínimo 6 caracteres"
                  className={cn("pr-9", errCls(errors.password))}
                />
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  onClick={() => setShowPwd((v) => !v)}
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
          ) : !changePwd ? (
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setChangePwd(true)}
                className="text-xs"
              >
                Cambiar contraseña
              </Button>
            </div>
          ) : (
            <Field label="Nueva contraseña *" error={errors.password}>
              <div className="relative">
                <Input
                  type={showPwd ? "text" : "password"}
                  value={form.password}
                  onChange={set("password")}
                  placeholder="Mínimo 6 caracteres"
                  className={cn("pr-9", errCls(errors.password))}
                />
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  onClick={() => setShowPwd((v) => !v)}
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <button
                type="button"
                className="text-[10px] text-slate-400 hover:text-slate-600 mt-1"
                onClick={() => {
                  setChangePwd(false);
                  setForm((p) => ({ ...p, password: "" }));
                }}
              >
                Cancelar cambio de contraseña
              </button>
            </Field>
          )}

          {/* PIN — solo TECNICO */}
          {isTecnico && (
            <Field
              label={editing ? "Nuevo PIN kiosco (4 dígitos)" : "PIN kiosco (opcional)"}
              error={errors.pin}
            >
              <Input
                value={form.pin}
                onChange={(e) =>
                  setForm((p) => ({ ...p, pin: e.target.value.replace(/\D/g, "").slice(0, 4) }))
                }
                placeholder="    "
                maxLength={4}
                className={cn(
                  "font-mono text-center text-lg tracking-[0.5em] max-w-[120px]",
                  errCls(errors.pin)
                )}
              />
              {editing && (
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Dejar vacío para no cambiar el PIN actual
                </p>
              )}
            </Field>
          )}

          {/* Color de avatar */}
          <div>
            <label className="text-xs font-medium text-slate-600">Color de avatar</label>
            <div className="flex gap-2 flex-wrap mt-1.5">
              {COLORES_PALETA.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={cn(
                    "h-7 w-7 rounded-full border-2 transition-all",
                    form.color === c
                      ? "border-slate-800 scale-110 shadow-md"
                      : "border-white shadow-sm hover:scale-105"
                  )}
                  style={{ backgroundColor: c }}
                  onClick={() => setForm((p) => ({ ...p, color: c }))}
                  title={c}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span
                className="inline-flex h-8 w-8 rounded-full items-center justify-center text-white text-xs font-bold select-none"
                style={{ backgroundColor: form.color }}
              >
                {previewInitials}
              </span>
              <span className="text-xs text-slate-400">Vista previa</span>
            </div>
          </div>

          {/* Especialidades — solo TECNICO */}
          {isTecnico && especialidades.length > 0 && (
            <div>
              <label className="text-xs font-medium text-slate-600">
                Especialidades
                {selectedEsp.size > 0 && (
                  <span className="ml-1.5 text-[10px] text-[#006FA0]">
                    ({selectedEsp.size} seleccionadas)
                  </span>
                )}
              </label>
              <div className="mt-1.5 border rounded-md p-2.5 space-y-1.5 max-h-36 overflow-y-auto bg-slate-50">
                {especialidades.map((e) => (
                  <label key={e.id} className="flex items-center gap-2 cursor-pointer group">
                    <Checkbox
                      checked={selectedEsp.has(e.id)}
                      onCheckedChange={() => {
                        setSelectedEsp((prev) => {
                          const next = new Set(prev);
                          next.has(e.id) ? next.delete(e.id) : next.add(e.id);
                          return next;
                        });
                      }}
                    />
                    <span className="text-sm text-slate-700 group-hover:text-slate-900">
                      {e.nombre}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <DialogFooter className="mt-4 pt-3 border-t gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-[#006FA0] hover:bg-[#005a82] text-white"
            >
              {saving
                ? editing
                  ? "Guardando..."
                  : "Creando..."
                : editing
                  ? "Guardar cambios"
                  : "Crear usuario"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
