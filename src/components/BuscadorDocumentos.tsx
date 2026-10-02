import { useEffect, useRef, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { useDebounce } from "../hooks/useDebounce";
import { CLASE_CAMPO, CLASE_ETIQUETA } from "./FormatoDocumento";

// Buscador dinámico compartido por los listados de documentos (Facturas
// emitidas, Notas de venta...): texto libre con debounce + rango de fechas
// + estado + estado de pago, más filtros extra propios de cada pantalla.
// La búsqueda la hace el backend (parámetros q/desde/hasta/estado/
// estadoPago/...) para que funcione junto con la paginación.

export interface FiltrosListado {
  busqueda: string;
  setBusqueda: (v: string) => void;
  desde: string;
  setDesde: (v: string) => void;
  hasta: string;
  setHasta: (v: string) => void;
  estado: string;
  setEstado: (v: string) => void;
  pago: string;
  setPago: (v: string) => void;
  extra: Record<string, string>;
  setExtra: (clave: string, valor: string) => void;
  // Texto ya "asentado" (tras el debounce) — es el que se manda al backend
  // y el que se resalta en las filas.
  busquedaAplicada: string;
  refBusqueda: React.RefObject<HTMLInputElement | null>;
  hayFiltros: boolean;
  limpiar: () => void;
  // Listo para pasar como "params" a axios (solo lo que tiene valor).
  params: Record<string, string>;
  // Para la queryKey de react-query.
  clave: string[];
}

export function useFiltrosListado(
  setPagina: (pagina: number) => void,
  // Rango de fechas con el que arranca la pantalla (ej. el Reporteador abre
  // en "primer día del mes → hoy"); "Limpiar" igual lo deja vacío.
  iniciales?: { desde?: string; hasta?: string }
): FiltrosListado {
  const [busqueda, setBusqueda] = useState("");
  const [desde, setDesde] = useState(iniciales?.desde ?? "");
  const [hasta, setHasta] = useState(iniciales?.hasta ?? "");
  const [estado, setEstado] = useState("");
  const [pago, setPago] = useState("");
  const [extra, setExtraTodo] = useState<Record<string, string>>({});
  const busquedaAplicada = useDebounce(busqueda.trim(), 300);
  const refBusqueda = useRef<HTMLInputElement>(null);

  const claveExtra = JSON.stringify(extra);
  // Cualquier cambio de filtro vuelve a la página 1.
  useEffect(() => {
    setPagina(1);
  }, [busquedaAplicada, desde, hasta, estado, pago, claveExtra, setPagina]);

  // Atajo "/" para saltar al buscador desde cualquier parte de la pantalla
  // (salvo que ya se esté escribiendo en otro campo).
  useEffect(() => {
    function manejarTecla(e: KeyboardEvent) {
      if (e.key !== "/") return;
      const destino = e.target as HTMLElement;
      if (destino.tagName === "INPUT" || destino.tagName === "TEXTAREA" || destino.tagName === "SELECT") return;
      e.preventDefault();
      refBusqueda.current?.focus();
    }
    window.addEventListener("keydown", manejarTecla);
    return () => window.removeEventListener("keydown", manejarTecla);
  }, []);

  const hayExtra = Object.values(extra).some((v) => v !== "");
  const hayFiltros = busqueda !== "" || desde !== "" || hasta !== "" || estado !== "" || pago !== "" || hayExtra;

  const params: Record<string, string> = {};
  if (busquedaAplicada) params.q = busquedaAplicada;
  if (desde) params.desde = desde;
  if (hasta) params.hasta = hasta;
  if (estado) params.estado = estado;
  if (pago) params.estadoPago = pago;
  for (const [k, v] of Object.entries(extra)) if (v) params[k] = v;

  return {
    busqueda,
    setBusqueda,
    desde,
    setDesde,
    hasta,
    setHasta,
    estado,
    setEstado,
    pago,
    setPago,
    extra,
    setExtra: (clave, valor) => setExtraTodo((actual) => ({ ...actual, [clave]: valor })),
    busquedaAplicada,
    refBusqueda,
    hayFiltros,
    limpiar: () => {
      setBusqueda("");
      setDesde("");
      setHasta("");
      setEstado("");
      setPago("");
      setExtraTodo({});
      refBusqueda.current?.focus();
    },
    params,
    clave: [busquedaAplicada, desde, hasta, estado, pago, claveExtra],
  };
}

export function BarraBuscadorDocumentos({
  filtros,
  etiquetaBusqueda,
  placeholder,
  opcionesEstado,
  etiquetaEstado = "Estado",
  mostrarPago = true,
  extras,
  autoFocus = false,
  mostrarFechas = true,
}: {
  filtros: FiltrosListado;
  etiquetaBusqueda: string;
  placeholder: string;
  // Sin opciones = el documento no tiene estados, no se muestra el filtro.
  opcionesEstado?: { valor: string; etiqueta: string }[];
  etiquetaEstado?: string;
  mostrarPago?: boolean;
  extras?: ReactNode;
  // Solo en pantallas que son SOLO el listado (Facturas, Notas de venta):
  // donde arriba hay un formulario (Compras, Proformas...) el cursor tiene
  // que quedarse en el formulario, no saltar al buscador del historial.
  autoFocus?: boolean;
  // Para listas cuyos registros no tienen una fecha útil para filtrar.
  mostrarFechas?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2 p-3 bg-stone-50 dark:bg-gray-900/40 border-b border-stone-300 dark:border-gray-700">
      <label className="flex flex-col gap-1 min-w-0 flex-[2_1_280px]">
        <span className={CLASE_ETIQUETA}>{etiquetaBusqueda}</span>
        <div className="relative">
          <Search strokeWidth={1.75} className="w-4 h-4 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={filtros.refBusqueda}
            type="text"
            value={filtros.busqueda}
            onChange={(e) => filtros.setBusqueda(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") filtros.setBusqueda("");
            }}
            placeholder={placeholder}
            className={`${CLASE_CAMPO} pl-7 pr-10`}
            autoFocus={autoFocus}
          />
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] text-gray-400 border border-stone-300 dark:border-gray-600 px-1 rounded-sm">
            /
          </kbd>
        </div>
      </label>
      {mostrarFechas && (
        <>
          <label className="flex flex-col gap-1 w-36">
            <span className={CLASE_ETIQUETA}>Desde</span>
            <input type="date" value={filtros.desde} onChange={(e) => filtros.setDesde(e.target.value)} className={CLASE_CAMPO} />
          </label>
          <label className="flex flex-col gap-1 w-36">
            <span className={CLASE_ETIQUETA}>Hasta</span>
            <input type="date" value={filtros.hasta} onChange={(e) => filtros.setHasta(e.target.value)} className={CLASE_CAMPO} />
          </label>
        </>
      )}
      {opcionesEstado && opcionesEstado.length > 0 && (
      <label className="flex flex-col gap-1 w-32">
        <span className={CLASE_ETIQUETA}>{etiquetaEstado}</span>
        <select value={filtros.estado} onChange={(e) => filtros.setEstado(e.target.value)} className={CLASE_CAMPO}>
          <option value="">Todos</option>
          {opcionesEstado.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.etiqueta}
            </option>
          ))}
        </select>
      </label>
      )}
      {mostrarPago && (
        <label className="flex flex-col gap-1 w-32">
          <span className={CLASE_ETIQUETA}>Pago</span>
          <select value={filtros.pago} onChange={(e) => filtros.setPago(e.target.value)} className={CLASE_CAMPO}>
            <option value="">Todos</option>
            <option value="PENDIENTE">Pendiente</option>
            <option value="PARCIAL">Parcial</option>
            <option value="PAGADA">Pagada</option>
          </select>
        </label>
      )}
      {extras}
      <button
        type="button"
        onClick={filtros.limpiar}
        disabled={!filtros.hayFiltros}
        className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 px-3 py-1.5 rounded-sm text-xs font-semibold hover:bg-stone-100 dark:hover:bg-gray-700 disabled:opacity-40"
      >
        Limpiar
      </button>
    </div>
  );
}

// Pie del listado: cuántos documentos vigentes hay en el resultado del
// filtro y su total (el backend ya excluye los anulados).
export function PieResumenListado({
  resumen,
  hayFiltros,
}: {
  resumen?: { cantidadVigentes: number; totalVigentes: string };
  hayFiltros: boolean;
}) {
  if (!resumen) return null;
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 px-4 py-2.5 border-t-2 border-gray-900 dark:border-gray-200">
      <span className="font-mono text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {resumen.cantidadVigentes} vigente{resumen.cantidadVigentes === 1 ? "" : "s"}
        {hayFiltros ? " · según filtro" : ""}
      </span>
      <span className="text-sm font-bold text-gray-900 dark:text-gray-50">
        TOTAL USD <span className="font-mono tabular-nums ml-2">{Number(resumen.totalVigentes).toFixed(2)}</span>
      </span>
    </div>
  );
}

export type RespuestaConResumen<T> = {
  datos: T[];
  paginacion: { page: number; pageSize: number; total: number; totalPaginas: number };
  resumen?: { cantidadVigentes: number; totalVigentes: string };
};

// Para listados que no paginan: el buscador no tiene página a la que volver.
export function sinPaginacion() {}

// Normaliza para comparar sin distinguir mayúsculas ni tildes
// ("Cañón" encuentra "canon", "ÁREA" encuentra "area").
export function normalizarTexto(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Fecha local "YYYY-MM-DD" de un ISO del backend — para comparar contra los
// filtros Desde/Hasta (que el <input type="date"> da en ese mismo formato).
function fechaLocalIso(valor: string): string {
  return new Date(valor).toLocaleDateString("en-CA");
}

// Filtro EN EL NAVEGADOR para los listados que ya traen la lista completa
// (catálogos, planes, nodos...): mismo buscador que los documentos, pero
// sin ir al backend — el resultado es instantáneo mientras se escribe.
//   textos: campos donde busca el texto libre
//   fecha:  campo que filtran Desde/Hasta (si la pantalla los muestra)
//   estado: valor que compara el filtro de estado
//   extra:  condición adicional con los filtros propios de la pantalla
export function filtrarLocal<T>(
  items: T[] | undefined,
  filtros: FiltrosListado,
  opciones: {
    textos: (item: T) => (string | number | null | undefined)[];
    fecha?: (item: T) => string | null | undefined;
    estado?: (item: T) => string;
    extra?: (item: T, extra: Record<string, string>) => boolean;
  }
): T[] | undefined {
  if (!items) return items;
  const termino = normalizarTexto(filtros.busqueda.trim());
  return items.filter((item) => {
    if (termino && !opciones.textos(item).some((t) => t != null && normalizarTexto(String(t)).includes(termino))) return false;
    if (opciones.fecha && (filtros.desde || filtros.hasta)) {
      const valor = opciones.fecha(item);
      if (!valor) return false;
      const dia = fechaLocalIso(valor);
      if (filtros.desde && dia < filtros.desde) return false;
      if (filtros.hasta && dia > filtros.hasta) return false;
    }
    if (opciones.estado && filtros.estado && opciones.estado(item) !== filtros.estado) return false;
    if (opciones.extra && !opciones.extra(item, filtros.extra)) return false;
    return true;
  });
}
