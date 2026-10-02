import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api/client";
import { EstadoBadge } from "./EstadoBadge";
import { useFiltrosListado, BarraBuscadorDocumentos, filtrarLocal, sinPaginacion } from "./BuscadorDocumentos";
import { CLASE_THEAD, Resaltar } from "./FormatoDocumento";

// Una columna de la tabla del Reporteador Principal. "obtenerValor" es la
// única fuente de verdad: se usa tanto para pintar la celda (con el formato
// que corresponda) como para la fila que se manda a Excel — así nunca hay
// dos lugares por actualizar si cambia cómo se calcula un valor.
export interface ColumnaReporte<T> {
  clave: string;
  etiqueta: string;
  formato?: "texto" | "moneda" | "fecha" | "estado";
  obtenerValor: (fila: T) => string | number | null | undefined;
}

interface Props<T> {
  endpoint: string;
  columnas: ColumnaReporte<T>[];
  nombreArchivo: string;
  onVerDetalle?: (fila: T) => void;
  filaId: (fila: T) => number | string;
  // Cuando ambas están presentes, se dibuja una barra de "total por día"
  // arriba de la tabla — agrupando en el navegador las filas que YA se
  // cargaron para la tabla, sin pedir nada nuevo al backend.
  campoMonto?: (fila: T) => number;
  campoFechaGrafico?: (fila: T) => string;
}

interface PuntoGrafico {
  fecha: string; // "YYYY-MM-DD"
  total: number;
}

// "2026-07-15" -> "15/07", igual que en ReportesPage.tsx.
function aFechaCorta(fechaISO: string): string {
  const [, mes, dia] = fechaISO.split("-");
  return `${dia}/${mes}`;
}

// Mismo tooltip (una sola serie, sin leyenda) que ya usa ReportesPage.tsx
// para su gráfico de ventas por día — mismas variables CSS de tema.
function TooltipGrafico({ active, payload }: { active?: boolean; payload?: { payload: PuntoGrafico }[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const punto = payload[0].payload;
  const fecha = new Date(`${punto.fecha}T00:00:00`);
  return (
    <div
      className="rounded-md px-3 py-2 text-sm shadow-lg"
      style={{ background: "var(--chart-tooltip-bg)", border: "1px solid var(--chart-tooltip-border)", color: "var(--chart-tooltip-text)" }}
    >
      <p className="font-semibold">${punto.total.toFixed(2)}</p>
      <p className="text-xs opacity-70">{fecha.toLocaleDateString("es-EC", { weekday: "short", day: "numeric", month: "short" })}</p>
    </div>
  );
}

function formatearCelda(valor: string | number | null | undefined, formato: ColumnaReporte<unknown>["formato"], termino: string) {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (formato === "estado") return <EstadoBadge estado={String(valor)} />;
  if (formato === "moneda") return <span className="font-mono tabular-nums">{Number(valor).toFixed(2)}</span>;
  if (formato === "fecha") return <span className="font-mono text-xs">{new Date(valor).toLocaleDateString("es-EC")}</span>;
  return <Resaltar texto={String(valor)} termino={termino} />;
}

// Primer día del mes actual → hoy, como fecha por defecto al abrir cada
// pestaña — mismo criterio ya usado en ReportesPage.tsx. El usuario puede
// ampliar el rango (o vaciarlo) libremente.
function primerDiaMes(): string {
  const hoy = new Date();
  return new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
}
function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ReporteadorTabla<T>({
  endpoint,
  columnas,
  nombreArchivo,
  onVerDetalle,
  filaId,
  campoMonto,
  campoFechaGrafico,
}: Props<T>) {
  // Buscador compartido de los listados: Desde/Hasta van al servidor (como
  // antes, arrancando en "primer día del mes → hoy"); el texto (en todas
  // las columnas) y el estado filtran en el navegador lo que ya llegó.
  const filtros = useFiltrosListado(sinPaginacion, { desde: primerDiaMes(), hasta: hoyISO() });
  const { desde, hasta } = filtros;

  const { data: filas, isLoading } = useQuery({
    queryKey: ["reporteador", endpoint, desde, hasta],
    queryFn: async () =>
      (await api.get<T[]>(endpoint, { params: { desde: desde || undefined, hasta: hasta || undefined } })).data,
  });

  const columnaEstado = columnas.find((c) => c.formato === "estado");
  const filasOrdenadas =
    filtrarLocal(filas, filtros, {
      textos: (fila) => columnas.filter((c) => c.formato !== "moneda").map((c) => c.obtenerValor(fila)),
      estado: columnaEstado ? (fila) => String(columnaEstado.obtenerValor(fila) ?? "") : undefined,
    }) ?? [];
  // Estados que realmente aparecen en el período (para el filtro).
  const opcionesEstado =
    columnaEstado && filas
      ? Array.from(new Set(filas.map((f) => String(columnaEstado.obtenerValor(f) ?? "")).filter(Boolean)))
          .sort()
          .map((v) => ({ valor: v, etiqueta: v.charAt(0) + v.slice(1).toLowerCase() }))
      : undefined;
  const totalMonto = campoMonto ? filasOrdenadas.reduce((acumulado, fila) => acumulado + campoMonto(fila), 0) : null;

  const datosGrafico = useMemo(() => {
    if (!campoMonto || !campoFechaGrafico) return null;
    const totalesPorDia = new Map<string, number>();
    for (const fila of filasOrdenadas) {
      const fecha = campoFechaGrafico(fila).slice(0, 10);
      totalesPorDia.set(fecha, (totalesPorDia.get(fecha) ?? 0) + campoMonto(fila));
    }
    return Array.from(totalesPorDia.entries())
      .map(([fecha, total]) => ({ fecha, total }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [filasOrdenadas, campoMonto, campoFechaGrafico]);

  function exportarExcel() {
    const datosHoja = filasOrdenadas.map((fila) =>
      Object.fromEntries(columnas.map((c) => [c.etiqueta, c.obtenerValor(fila) ?? ""]))
    );
    const hoja = XLSX.utils.json_to_sheet(datosHoja);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Reporte");
    XLSX.writeFile(libro, `${nombreArchivo}_${desde || "inicio"}_a_${hasta || "hoy"}.xlsx`);
  }

  return (
    <div className="space-y-4">
      {datosGrafico && datosGrafico.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-sm border border-stone-300 dark:border-gray-700 p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-gray-600 dark:text-gray-300 mb-2">Total por día</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={datosGrafico} barCategoryGap={2} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="fecha" tickFormatter={aFechaCorta} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
              <Tooltip content={<TooltipGrafico />} cursor={{ fill: "var(--chart-grid)" }} />
              <Bar dataKey="total" fill="var(--chart-series-1)" radius={[1, 1, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-sm border border-stone-300 dark:border-gray-700">
        <BarraBuscadorDocumentos
          filtros={filtros}
          etiquetaBusqueda="Buscar en el reporte · cualquier columna"
          placeholder="Ej: número, cliente, producto..."
          opcionesEstado={opcionesEstado}
          mostrarPago={false}
          autoFocus
          extras={
            <button
              type="button"
              onClick={exportarExcel}
              disabled={filasOrdenadas.length === 0}
              className="bg-brand-700 text-white px-3 py-1.5 rounded-sm text-xs font-semibold hover:bg-brand-800 disabled:opacity-40"
            >
              Exportar a Excel
            </button>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className={CLASE_THEAD}>
              <tr>
                {columnas.map((c) => (
                  <th key={c.clave} className={`px-4 py-2 whitespace-nowrap ${c.formato === "moneda" ? "text-right" : ""}`}>
                    {c.etiqueta}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={columnas.length} className="px-4 py-6 text-center text-gray-400 dark:text-gray-500">
                    Cargando...
                  </td>
                </tr>
              )}
              {!isLoading && filasOrdenadas.length === 0 && (
                <tr>
                  <td colSpan={columnas.length} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">
                    {filas?.length ? "Ningún registro coincide con la búsqueda." : "Sin resultados en este rango de fechas"}
                  </td>
                </tr>
              )}
              {filasOrdenadas.map((fila) => (
                <tr
                  key={filaId(fila)}
                  onClick={() => onVerDetalle?.(fila)}
                  className={`border-t border-stone-100 dark:border-gray-700 ${
                    onVerDetalle ? "cursor-pointer hover:bg-stone-50 dark:hover:bg-gray-700/40" : ""
                  }`}
                >
                  {columnas.map((c) => (
                    <td key={c.clave} className={`px-4 py-2 whitespace-nowrap ${c.formato === "moneda" ? "text-right" : ""}`}>
                      {formatearCelda(c.obtenerValor(fila), c.formato, filtros.busquedaAplicada)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 px-4 py-2.5 border-t-2 border-gray-900 dark:border-gray-200">
          <span className="font-mono text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {filasOrdenadas.length} registro{filasOrdenadas.length === 1 ? "" : "s"}
            {filtros.hayFiltros ? " · según filtro" : ""}
          </span>
          {totalMonto !== null && (
            <span className="text-sm font-bold text-gray-900 dark:text-gray-50">
              TOTAL USD <span className="font-mono tabular-nums ml-2">{totalMonto.toFixed(2)}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
