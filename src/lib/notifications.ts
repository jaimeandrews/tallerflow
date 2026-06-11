/**
 * Notificaciones del navegador para alertas críticas.
 *
 * Comportamiento:
 *  - `requestNotificationPermission()` solicita permiso si está en "default".
 *  - `showAlertaCritica()` muestra notificación SOLO si:
 *      a) `Notification` está disponible,
 *      b) el permiso está `granted`,
 *      c) la pestaña NO está visible (`document.hidden`).
 *    Reproduce un beep sutil (Web Audio API) en paralelo.
 *
 * Notas:
 *  - El beep usa Web Audio API en vez de mp3 → cero archivos extra, cero
 *    request HTTP, control total sobre frecuencia/duración.
 *  - Algunas políticas de autoplay de los navegadores requieren que haya
 *    habido al menos una interacción del usuario antes de permitir audio.
 *    Si la pestaña nunca recibió click/keydown, `playBeep` falla
 *    silenciosamente — la notificación visual sigue funcionando.
 *  - `Notification` no existe en SSR ni en navegadores muy antiguos →
 *    todas las funciones hacen guard.
 */

const ICONO_TALLERFLOW = "/icons/icon-192.png";

// ── Permission ─────────────────────────────────────────────────────────────

export type PermisoNotificacion = "default" | "granted" | "denied" | "unsupported";

function permisoActual(): PermisoNotificacion {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return "unsupported";
  }
  return Notification.permission as PermisoNotificacion;
}

let permissionRequestInFlight: Promise<PermisoNotificacion> | null = null;

export async function requestNotificationPermission(): Promise<PermisoNotificacion> {
  const actual = permisoActual();
  if (actual === "unsupported" || actual === "granted" || actual === "denied") {
    return actual;
  }
  // Evitar promesas concurrentes (puede pasar si dos componentes piden a la vez).
  if (permissionRequestInFlight) return permissionRequestInFlight;

  permissionRequestInFlight = Notification.requestPermission().then(
    (p) => p as PermisoNotificacion
  );
  try {
    return await permissionRequestInFlight;
  } finally {
    permissionRequestInFlight = null;
  }
}

// ── Beep (Web Audio API) ───────────────────────────────────────────────────

let audioCtx: AudioContext | null = null;

function obtenerAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioCtx) return audioCtx;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    audioCtx = new Ctor();
  } catch {
    audioCtx = null;
  }
  return audioCtx;
}

/**
 * Beep corto de 200ms con envolvente de salida suave (evita el "click"
 * de cortar abruptamente la onda).
 */
function playBeep(): void {
  const ctx = obtenerAudioCtx();
  if (!ctx) return;
  try {
    // Resume en caso de que el contexto esté suspendido por autoplay policy.
    if (ctx.state === "suspended") void ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880; // A5
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.22);
  } catch {
    // Silenciar — la notificación visual ya cumple su rol.
  }
}

// ── Notificación de alerta crítica ─────────────────────────────────────────

interface AlertaCriticaInput {
  id: string;
  titulo: string;
  descripcion: string;
}

export interface ShowAlertaResult {
  shown: boolean;
  motivo?: "unsupported" | "denied" | "default" | "visible";
}

/**
 * Muestra una notificación nativa para una alerta crítica.
 *
 * - Solo si la pestaña NO está visible (`document.hidden`).
 * - Reproduce el beep en paralelo (también solo si hidden).
 * - Si el usuario hace click → trae la pestaña al foco.
 */
export function showAlertaCritica(alerta: AlertaCriticaInput): ShowAlertaResult {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return { shown: false, motivo: "unsupported" };
  }
  if (Notification.permission === "denied") {
    return { shown: false, motivo: "denied" };
  }
  if (Notification.permission === "default") {
    return { shown: false, motivo: "default" };
  }
  if (typeof document !== "undefined" && !document.hidden) {
    return { shown: false, motivo: "visible" };
  }

  try {
    const n = new Notification(alerta.titulo, {
      body: alerta.descripcion,
      icon: ICONO_TALLERFLOW,
      tag: `tallerflow-alerta-${alerta.id}`, // colapsa notificaciones repetidas
      requireInteraction: false,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // En modos restringidos algunas implementaciones tiran — silenciar.
  }

  playBeep();
  return { shown: true };
}
