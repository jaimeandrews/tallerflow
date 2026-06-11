# Bundle Analysis — TallerFlow

> Generado: 2026-05-21  
> Build: Next.js 16.2.6 (webpack)  
> Herramienta: `@next/bundle-analyzer`  
> Reporte visual interactivo: `.next/analyze/client.html`

## Cómo reproducir

```bash
npm run analyze
# genera .next/analyze/client.html — abrir en el navegador
```

---

## 1. Tamaño total del bundle cliente

| Métrica                  | Valor        |
| ------------------------ | ------------ |
| **JS total (raw)**       | **2 189 KB** |
| **JS total (gzip ~30%)** | **~657 KB**  |
| Número de chunks         | ~60          |
| Tiempo de build          | 17.4 s       |

> **Contexto**: 657 KB gzip para una SaaS con:
>
> - Dashboard operacional en tiempo real (Socket.io)
> - Kiosco PWA offline (Serwist + IndexedDB)
> - Kanban con drag & drop (dnd-kit)
> - Gráficos de productividad (Recharts)
> - Sistema de reportes con export PDF (server-only)
>
> Es un tamaño razonable para la funcionalidad ofrecida. El kiosco (`/marcaje`) pesa solo **16 KB** en su chunk de ruta gracias al code-splitting por App Router.

---

## 2. Top 5 dependencias más pesadas (client bundle)

> Metodología: fingerprinting de strings de librería en los chunks generados.

| #   | Dependencia                           | Peso raw     | Gzip est. | Chunks                     | Notas                            |
| --- | ------------------------------------- | ------------ | --------- | -------------------------- | -------------------------------- |
| 1   | **Recharts** (+ D3 interno)           | **~424 KB**  | ~127 KB   | 3121, 6012, 6990           | ⚠️ 61 refs en el chunk principal |
| 2   | **React + React-DOM**                 | **~185 KB**  | ~55 KB    | framework-711ef29bc66f648c | Standard; no optimizable         |
| 3   | **Radix UI** (shadcn/ui primitives)   | **~164 KB**  | ~49 KB    | 10+ chunks                 | Bien tree-shaken por webpack     |
| 4   | **Serwist** (registro SW client-side) | **~50 KB\*** | ~15 KB    | main, 5838                 | Solo el cliente; el SW es aparte |
| 5   | **DnD-kit** (@dnd-kit/core)           | **~42 KB**   | ~13 KB    | 8183                       | Kanban + Asignación              |

_\*El chunk 5838 (222 KB) y el 4bd1b696 (195 KB) son mezclas de dependencias no identificadas individualmente en el análisis de strings; probablemente Next.js RSC internals + otras utilidades._

### Dependencias menores identificadas

| Dependencia         | Peso raw | Gzip est. |
| ------------------- | -------- | --------- |
| Socket.io-client    | ~40 KB   | ~12 KB    |
| Lucide-react        | ~34 KB   | ~10 KB    |
| date-fns            | ~24 KB   | ~7 KB     |
| IDB (offline store) | < 10 KB  | < 3 KB    |

---

## 3. Tamaño por ruta (page chunks)

Los chunks de ruta son **adicionales** a los shared chunks (framework, radix, etc.) que ya están en caché del usuario.

| Ruta                | Chunk de ruta | Notas                                  |
| ------------------- | ------------- | -------------------------------------- |
| `/configuracion`    | **87 KB**     | Todos los formularios de configuración |
| `/reportes`         | **59 KB**     | Tablas de productividad + gráficos     |
| `/ordenes`          | **47 KB**     | Tabla + KanbanOrdenes lazy-loaded ✓    |
| `/centro-control`   | **42 KB**     | Grid live + ribbon + alertas           |
| `/asignacion`       | **37 KB**     | DnD pool + GanttDiario lazy-loaded ✓   |
| `/dashboard`        | **27 KB**     | GraficoProductividad lazy-loaded ✓     |
| `/marcaje` (kiosco) | **16 KB**     | ✅ Lean — ruta crítica offline         |
| `/login`            | **10 KB**     | Formulario estático                    |
| `/tecnico`          | **6 KB**      | ✅ Minimal                             |

> Los dynamic imports aplicados (`GraficoProductividad`, `KanbanOrdenes`, `GanttDiario`) funcionan correctamente: el dashboard chunk bajó de lo que sería ~100 KB+ a solo **27 KB**.

---

## 4. Análisis y recomendaciones

### ✅ Bien

| Item                    | Estado                                                                        |
| ----------------------- | ----------------------------------------------------------------------------- |
| `@react-pdf/renderer`   | **Server-only** — 0 hits en bundle cliente. Solo en `/api/reportes/exportar`. |
| Code-splitting por ruta | App Router hace splitting automático. Confirmado por tamaños de chunks.       |
| Dynamic imports         | GraficoProductividad, KanbanOrdenes, GanttDiario son lazy-loaded.             |
| Radix UI tree-shaking   | 164 KB total pero bien fragmentado en ~10 chunks pequeños.                    |
| Kiosco (/marcaje)       | 16 KB de chunk propio — mínimo, ideal para offline.                           |

---

### ⚠️ Optimización posible: Recharts (~424 KB)

**Problema:** Recharts incluye D3.js internamente (`d3` aparece 61 veces en el chunk principal). Para el AreaChart de productividad, solo se usan 8 de los ~50 componentes de Recharts.

**Impacto actual:** Mitigado por lazy-loading (`dynamic(() => import(...))`). El usuario no descarga Recharts hasta que el Dashboard renderiza.

**Alternativas a evaluar:**

| Alternativa                           | Peso estimado | Trade-off                                                                                                                          |
| ------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Importación selectiva de Recharts** | ~200 KB       | Solo importar `AreaChart, Area, XAxis, YAxis…` en lugar de la lib completa (ya se hace, pero webpack no tree-shakes Recharts bien) |
| **uPlot**                             | ~30 KB raw    | Muy liviano pero API de bajo nivel; requiere más código manual                                                                     |
| **Chart.js + react-chartjs-2**        | ~80 KB        | Más ligero que Recharts; curva de aprendizaje media                                                                                |
| **SVG custom**                        | ~0 KB         | Para el AreaChart simple de productividad, ~50 líneas de SVG eliminan la dependencia completa                                      |

**Recomendación (Fase 5):** Para el gráfico de productividad (un solo AreaChart sencillo), considerar reimplementación en SVG puro. El Gantt ya es SVG/CSS custom con 0 dependencias de charting.

---

### ⚠️ Optimización posible: date-fns (~24 KB)

**Problema:** Se importa `date-fns` completo en algunos lugares.

**Recomendación:** Verificar que todos los imports sean selectivos:

```typescript
// ✅ Correcto
import { format, parseISO } from "date-fns";

// ❌ Evitar
import * as dateFns from "date-fns";
```

El proyecto usa mayormente imports selectivos — verificar que no haya ningún import de barrel.

---

### ℹ️ Nota: Radix UI (164 KB)

Es el componente principal de `shadcn/ui`. Webpack lo split en ~10 chunks pequeños (7–26 KB cada uno) que se cargan a demanda según qué componentes usa cada ruta. Este es el comportamiento correcto — no requiere acción.

---

### ℹ️ Nota: Socket.io-client (40 KB)

Necesario para el Centro de Control en tiempo real. No hay alternativa más liviana que mantenga la misma funcionalidad bidireccional. Las alternativas (SSE/EventSource) son unidireccionales — no aplican para el caso de uso actual.

---

## 5. Acciones ya implementadas

| Optimización                           | Reducción estimada                    | Estado           |
| -------------------------------------- | ------------------------------------- | ---------------- |
| Dynamic import `GraficoProductividad`  | ~420 KB fuera del bundle inicial      | ✅ En producción |
| Dynamic import `KanbanOrdenes`         | ~40 KB fuera del bundle de órdenes    | ✅ En producción |
| Dynamic import `GanttDiario`           | ~50 KB fuera del bundle de asignación | ✅ En producción |
| `React.memo` en TecCardLive/TecRowLive | Elimina re-renders innecesarios       | ✅ En producción |
| `@react-pdf` server-only               | 0 impacto en bundle cliente           | ✅ Confirmado    |
| Radix UI tree-shaking                  | Chunks pequeños por componente        | ✅ Automático    |

---

## 6. Próximos pasos recomendados

1. **Abrir el reporte visual** en `.next/analyze/client.html` para ver el treemap interactivo y confirmar qué está en los chunks no identificados (5838, 4bd1b696).

2. **Evaluar migrar el AreaChart** a SVG nativo en la Fase 5 para eliminar 424 KB de Recharts del bundle diferido.

3. **Auditar imports de date-fns** con `npm run analyze` y el treemap para confirmar tree-shaking correcto.

4. **Considerar `@tanstack/react-virtual`** si la tabla de configuración de usuarios supera 100 filas (actualmente la paginación lo previene).
