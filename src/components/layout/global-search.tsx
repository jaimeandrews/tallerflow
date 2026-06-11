"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Minimal result type (only fields we display) ───────────────────────────────

interface OFResult {
  id: string;
  numero: string;
  nombre: string;
  cliente: string;
  estado: string;
}

const ESTADO_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  PENDIENTE: { bg: "bg-slate-100", text: "text-slate-600", label: "Pendiente" },
  EN_PROCESO: { bg: "bg-blue-100", text: "text-blue-700", label: "En proceso" },
  PAUSADA: { bg: "bg-yellow-100", text: "text-yellow-700", label: "Pausada" },
  ESPERA_REPUESTO: { bg: "bg-orange-100", text: "text-orange-700", label: "Espera repuesto" },
  FINALIZADA: { bg: "bg-green-100", text: "text-green-700", label: "Finalizada" },
};

// ── Component ──────────────────────────────────────────────────────────────────

export function GlobalSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OFResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1); // keyboard nav index

  // ── API search (debounced 250 ms) ────────────────────────────────────────────

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setOpen(false);
      return;
    }

    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/ordenes?busqueda=${encodeURIComponent(q)}&porPagina=6`);
        if (!res.ok) return;
        const json = (await res.json()) as { data: OFResult[] };
        setResults(json.data ?? []);
        setOpen(true);
        setCursor(-1);
      } catch {
        // network error — keep current results
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(t);
  }, [query]);

  // ── Keyboard shortcut ⌘K / Ctrl+K ───────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Keyboard navigation in results ────────────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (cursor >= 0 && results[cursor]) {
        navigate(results[cursor].numero);
      } else if (query.trim()) {
        navigateAll();
      }
    } else if (e.key === "Escape") {
      close();
    }
  };

  // ── Navigation helpers ────────────────────────────────────────────────────────

  const navigate = useCallback(
    (numero: string) => {
      router.push(`/ordenes?busqueda=${encodeURIComponent(numero)}`);
      close();
    },
    [router]
  );  

  const navigateAll = useCallback(() => {
    if (!query.trim()) return;
    router.push(`/ordenes?busqueda=${encodeURIComponent(query.trim())}`);
    close();
  }, [query, router]);  

  const close = () => {
    setOpen(false);
    setCursor(-1);
    setQuery("");
    inputRef.current?.blur();
  };

  // ── Click-outside close ───────────────────────────────────────────────────────

  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div ref={containerRef} className="relative hidden md:block w-56 lg:w-72">
      {/* Input */}
      <div
        className={cn(
          "flex items-center gap-2 rounded-md border px-3 py-1.5 transition-colors",
          "bg-[var(--muted)] border-[var(--border)]",
          open && "ring-2 ring-[#006FA0]/30 border-[#006FA0]/40"
        )}
      >
        <Search className="h-3.5 w-3.5 text-[var(--muted-foreground)] flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0) setOpen(true);
          }}
          placeholder="Buscar OF…"
          autoComplete="off"
          className={cn(
            "flex-1 bg-transparent text-xs text-[var(--foreground)]",
            "placeholder:text-[var(--muted-foreground)]",
            "focus:outline-none min-w-0"
          )}
        />
        {query ? (
          <button
            type="button"
            onClick={close}
            className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            aria-label="Limpiar búsqueda"
          >
            <X className="h-3 w-3" />
          </button>
        ) : (
          <kbd className="hidden lg:inline-flex items-center gap-0.5 rounded border border-[var(--border)] bg-[var(--background)] px-1 text-[10px] text-[var(--muted-foreground)] font-mono">
            <span>⌘</span>K
          </kbd>
        )}
      </div>

      {/* Results dropdown */}
      {open && (
        <div
          className={cn(
            "absolute top-full left-0 right-0 mt-1.5 z-50",
            "rounded-xl border border-[var(--border)] bg-[var(--popover)]",
            "shadow-lg overflow-hidden"
          )}
        >
          {loading && results.length === 0 ? (
            <div className="flex items-center justify-center py-6">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-[#006FA0]" />
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-5 text-center text-xs text-[var(--muted-foreground)]">
              Sin resultados para &ldquo;{query}&rdquo;
            </div>
          ) : (
            <>
              <ul ref={listRef} role="listbox" className="py-1 max-h-72 overflow-y-auto">
                {results.map((of, i) => {
                  const estado = ESTADO_STYLE[of.estado] ?? ESTADO_STYLE.PENDIENTE;
                  return (
                    <li
                      key={of.id}
                      role="option"
                      aria-selected={i === cursor}
                      onMouseEnter={() => setCursor(i)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        navigate(of.numero);
                      }}
                      className={cn(
                        "flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors",
                        i === cursor ? "bg-[var(--accent)]" : "hover:bg-[var(--accent)]"
                      )}
                    >
                      <FileText className="h-4 w-4 mt-0.5 flex-shrink-0 text-[#006FA0]" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-[#006FA0]">
                            {of.numero}
                          </span>
                          <span
                            className={cn(
                              "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                              estado.bg,
                              estado.text
                            )}
                          >
                            {estado.label}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--foreground)] truncate mt-0.5 font-medium">
                          {of.nombre}
                        </p>
                        <p className="text-[11px] text-[var(--muted-foreground)] truncate">
                          {of.cliente}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* Footer — ver todos */}
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  navigateAll();
                }}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 text-xs",
                  "border-t border-[var(--border)]",
                  "text-[var(--muted-foreground)] hover:text-[#006FA0] hover:bg-[var(--accent)]",
                  "transition-colors"
                )}
              >
                <span>Ver todos los resultados para &ldquo;{query}&rdquo;</span>
                <Search className="h-3 w-3" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
