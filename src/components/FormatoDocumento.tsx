import { useState, type ReactNode, type ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import type { Producto } from "../api/client";
import { ImagenProducto } from "./ImagenProducto";

// Piezas del formato "documento de escritorio" (el modelo A elegido para el
// Punto de Venta), compartidas por todas las pantallas que arman un
// documento con detalle: Compras, Proformas, Devoluciones, Egresos de
// bodega, Traslados. Campos rectos y compactos, etiquetas en mono, celdas
// de solo lectura con fondo apagado, detalle en tabla y totales como el RIDE.

export const CLASE_CAMPO =
  "w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm px-2 py-1.5 text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 disabled:opacity-50";
export const CLASE_SOLO_LECTURA =
  "w-full min-h-[34px] border border-stone-200 dark:border-gray-700 bg-stone-50 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300 rounded-sm px-2 py-1.5 text-sm";
export const CLASE_ETIQUETA = "font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500";
export const CLASE_TH =
  "px-3 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400";
// Para los <thead> de los listados/historiales (celdas px-4 py-2 propias).
export const CLASE_THEAD =
  "bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700 text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 [&_th]:font-medium";
// Input compacto dentro de una celda del detalle (cantidad, costo...).
export const CLASE_CAMPO_CELDA =
  "border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm px-1.5 py-0.5 text-sm font-mono text-right focus:outline-none focus:border-brand-600";

// Marco exterior del documento: barra superior con el título, el selector
// o sello que corresponda, y el cuerpo.
export function MarcoDocumento({
  titulo,
  controles,
  sello,
  aviso,
  children,
}: {
  titulo: string;
  controles?: ReactNode;
  sello?: ReactNode;
  aviso?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-stone-300 dark:border-gray-700">
        <div className="flex flex-wrap items-center gap-4">
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-50">{titulo}</h2>
          {controles}
        </div>
        {sello && <div className="flex items-center gap-3">{sello}</div>}
      </div>
      {aviso && (
        <div className="px-4 py-2 bg-stone-50 dark:bg-gray-900/40 border-b border-stone-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
          {aviso}
        </div>
      )}
      {children}
    </div>
  );
}

export function Sello({ children, tono = "ambar" }: { children: ReactNode; tono?: "ambar" | "marca" }) {
  return (
    <span
      className={`font-mono text-[10px] uppercase tracking-wider border border-current px-1.5 py-0.5 ${
        tono === "ambar" ? "text-amber-700 dark:text-amber-400" : "text-brand-700 dark:text-brand-300"
      }`}
    >
      {children}
    </span>
  );
}

export function ConteoItems({ cantidad, singular = "ítem", plural = "ítems" }: { cantidad: number; singular?: string; plural?: string }) {
  return (
    <span className="font-mono text-[11px] text-gray-400 dark:text-gray-500">
      {cantidad} {cantidad === 1 ? singular : plural}
    </span>
  );
}

// Cabecera en rejilla (etiqueta a la izquierda, campo a la derecha), dos
// pares por fila. Usar <EtiquetaCabecera> + el campo como hijos directos;
// "col-span-3" en un campo lo estira a toda la fila.
export function CabeceraDocumento({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-[max-content_minmax(0,1fr)_max-content_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-4">
      {children}
    </div>
  );
}

export function EtiquetaCabecera({ children }: { children: ReactNode }) {
  return <span className={`${CLASE_ETIQUETA} whitespace-nowrap`}>{children}</span>;
}

// Buscador de productos para agregar al detalle: campo de búsqueda +
// botón "Catálogo", con los resultados en una tabla EN EL FLUJO de la
// página (no un desplegable flotante). Clic en una fila = onElegir.
export function BuscadorProductosDocumento({
  busqueda,
  onBusqueda,
  productos,
  onElegir,
  deshabilitado,
  infoDerecha,
  placeholder = "Buscar por nombre, código o código de barras...",
  aviso,
}: {
  busqueda: string;
  onBusqueda: (texto: string) => void;
  productos: Producto[] | undefined;
  onElegir: (producto: Producto) => void;
  deshabilitado?: (producto: Producto) => boolean;
  infoDerecha?: (producto: Producto) => ReactNode;
  placeholder?: string;
  aviso?: ReactNode;
}) {
  const [mostrarCatalogo, setMostrarCatalogo] = useState(false);
  const mostrarResultados = busqueda.trim() !== "" || mostrarCatalogo;

  return (
    <div className="mx-4 border border-stone-300 dark:border-gray-700 bg-stone-50 dark:bg-gray-900/40">
      <div className="flex items-end gap-2 p-2.5">
        <label className="flex flex-col gap-1 flex-1 min-w-0">
          <span className={CLASE_ETIQUETA}>Agregar producto</span>
          <input
            type="text"
            placeholder={placeholder}
            value={busqueda}
            onChange={(e) => onBusqueda(e.target.value)}
            className={CLASE_CAMPO}
          />
        </label>
        <button
          type="button"
          onClick={() => setMostrarCatalogo((v) => !v)}
          className={`border rounded-sm px-3 py-1.5 text-xs font-semibold ${
            mostrarCatalogo
              ? "border-brand-600 text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-900/30"
              : "border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-stone-100 dark:hover:bg-gray-700"
          }`}
        >
          Catálogo
        </button>
      </div>
      {aviso && <p className="px-2.5 pb-2 -mt-1 text-xs text-gray-400 dark:text-gray-500">{aviso}</p>}

      {mostrarResultados && (
        <div className="border-t border-stone-300 dark:border-gray-700 max-h-64 overflow-y-auto bg-white dark:bg-gray-800">
          {productos?.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-400 dark:text-gray-500">Sin resultados para "{busqueda}"</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {productos?.map((p) => {
                  const bloqueado = deshabilitado?.(p) ?? false;
                  return (
                    <tr
                      key={p.id}
                      onClick={() => !bloqueado && onElegir(p)}
                      className={`border-b border-stone-100 dark:border-gray-700 last:border-b-0 ${
                        bloqueado ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:bg-brand-50 dark:hover:bg-brand-900/20"
                      }`}
                    >
                      <td className="px-3 py-1.5 w-10">
                        <ImagenProducto producto={p} tamano={28} />
                      </td>
                      <td className="px-2 py-1.5 font-mono text-xs text-gray-500 dark:text-gray-400 w-32">{p.codigo}</td>
                      <td className="px-2 py-1.5 text-gray-800 dark:text-gray-100">
                        {p.nombre}
                        {(p.marca || p.modelo) && (
                          <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                            {[p.marca, p.modelo].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-xs text-right text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {infoDerecha?.(p)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// Contenedor de la tabla de detalle, pegado debajo del buscador.
export function DetalleDocumento({ children, pegadoArriba = true }: { children: ReactNode; pegadoArriba?: boolean }) {
  return (
    <div
      className={`mx-4 border border-stone-300 dark:border-gray-700 overflow-x-auto ${pegadoArriba ? "border-t-0" : ""}`}
    >
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function FilaDetalleVacia({ columnas, children }: { columnas: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={columnas} className="px-3 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
        {children}
      </td>
    </tr>
  );
}

// Recuadro con barra de título mono (Cobro, Pago al proveedor...).
export function RecuadroDocumento({ titulo, accion, children }: { titulo: string; accion?: ReactNode; children: ReactNode }) {
  return (
    <div className="border border-stone-300 dark:border-gray-700">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-stone-300 dark:border-gray-700 bg-stone-50 dark:bg-gray-900/40">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.15em] text-gray-600 dark:text-gray-300">{titulo}</span>
        {accion}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

// Selector tipo "botones pegados" (Factura | Nota de venta, Completo | Abono
// | Pendiente) — un solo control con bordes compartidos, como en los
// formularios de escritorio.
export function Segmentado<T extends string>({
  opciones,
  valor,
  onCambiar,
}: {
  opciones: { valor: T; etiqueta: string }[];
  valor: T;
  onCambiar: (valor: T) => void;
}) {
  return (
    <div className="inline-flex border border-stone-300 dark:border-gray-600 rounded-sm overflow-hidden">
      {opciones.map((opcion, i) => (
        <button
          key={opcion.valor}
          type="button"
          onClick={() => onCambiar(opcion.valor)}
          className={`px-3 py-1.5 text-xs font-semibold ${i > 0 ? "border-l border-stone-300 dark:border-gray-600" : ""} ${
            valor === opcion.valor
              ? "bg-brand-700 text-white"
              : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-stone-50 dark:hover:bg-gray-700"
          }`}
        >
          {opcion.etiqueta}
        </button>
      ))}
    </div>
  );
}

// Cuadro de totales en el orden del RIDE: filas normales + total final.
export function CuadroTotales({ children, etiquetaTotal = "TOTAL USD", total }: { children?: ReactNode; etiquetaTotal?: string; total: number }) {
  return (
    <div className="border border-stone-300 dark:border-gray-700 text-sm">
      {children}
      <div
        className={`flex justify-between px-3 py-2.5 font-bold text-base text-gray-900 dark:text-gray-50 ${
          children ? "border-t-2 border-gray-900 dark:border-gray-200" : ""
        }`}
      >
        <span>{etiquetaTotal}</span>
        <span className="font-mono tabular-nums">{total.toFixed(2)}</span>
      </div>
    </div>
  );
}

export function FilaTotal({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <div className="flex justify-between px-3 py-1.5 text-gray-700 dark:text-gray-300">
      <span>{etiqueta}</span>
      <span className="font-mono tabular-nums">{valor.toFixed(2)}</span>
    </div>
  );
}

// Botón principal del documento (Confirmar, Registrar, Generar...) — ancho
// completo, texto a la izquierda y flecha/atajo a la derecha.
export function BotonConfirmar({
  children,
  atajo,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { atajo?: string }) {
  return (
    <button
      {...props}
      className={`w-full flex items-center justify-between bg-brand-700 text-white px-4 py-3 rounded-sm text-sm font-semibold hover:bg-brand-800 disabled:opacity-40 ${className}`}
    >
      <span>{children}</span>
      <span className="font-mono text-xs opacity-80">{atajo ? `${atajo} →` : "→"}</span>
    </button>
  );
}

export function MensajeError({ children }: { children: ReactNode }) {
  return <p className="border-l-2 border-red-600 pl-3 text-red-700 dark:text-red-400 text-sm">{children}</p>;
}

// Sección de listado/historial debajo del documento: barra de título mono y
// la tabla adentro (usar CLASE_THEAD en su <thead>).
export function SeccionListado({ titulo, accion, children }: { titulo: string; accion?: ReactNode; children: ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-stone-300 dark:border-gray-700">
        <h3 className="font-mono text-[11px] uppercase tracking-[0.15em] text-gray-600 dark:text-gray-300">{titulo}</h3>
        {accion}
      </div>
      {children}
    </div>
  );
}

// Botón secundario de encabezado de pantalla ("+ Nueva devolución", etc.).
export function BotonSecundario({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 px-3 py-1.5 rounded-sm text-sm font-semibold hover:bg-stone-50 dark:hover:bg-gray-700 disabled:opacity-40 ${className}`}
    />
  );
}

// Fecha de hoy como la muestran las cabeceras (solo lectura).
export function fechaHoy(): string {
  return new Date().toLocaleDateString("es-EC");
}

// Tarjeta de color sólido para una cifra clave (Dashboard, Combustible...):
// color plano, sin degradado, etiqueta en mono. "color" es la clase de
// fondo de Tailwind (ej. "bg-emerald-600").
export function TarjetaKpi({ icono: Icono, etiqueta, valor, color }: { icono: LucideIcon; etiqueta: string; valor: string; color: string }) {
  return (
    <div className={`${color} rounded-sm p-4 text-white`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="font-mono text-[10px] uppercase tracking-wider opacity-90">{etiqueta}</p>
        <Icono strokeWidth={1.75} className="w-4 h-4 opacity-80 shrink-0" />
      </div>
      <p className="font-mono text-2xl font-semibold tabular-nums leading-none">{valor}</p>
    </div>
  );
}

// Título de sección dentro de un panel (mono, mayúsculas).
export const CLASE_TITULO_SECCION = "font-mono text-[11px] uppercase tracking-[0.15em] text-gray-600 dark:text-gray-300";

// Enlaces de acción en filas de listados.
export const CLASE_ACCION = "text-brand-700 dark:text-brand-300 hover:underline text-xs font-semibold whitespace-nowrap";
export const CLASE_ACCION_OK = "text-emerald-700 dark:text-emerald-400 hover:underline text-xs font-semibold whitespace-nowrap";
export const CLASE_ACCION_PELIGRO = "text-red-600 dark:text-red-400 hover:underline text-xs font-semibold whitespace-nowrap";

// Marca en el texto las coincidencias con lo buscado (sin distinguir
// mayúsculas), para que se vea de un vistazo por qué salió cada fila.
export function Resaltar({ texto, termino }: { texto: string; termino: string }) {
  const t = quitarTildes(termino.trim().toLowerCase());
  if (!t) return <>{texto}</>;
  // Busca sobre una copia sin tildes (misma longitud que el original, así
  // los índices coinciden) y corta el texto ORIGINAL en esas posiciones.
  const base = quitarTildes(texto.toLowerCase());
  const partes: { texto: string; marca: boolean }[] = [];
  let desde = 0;
  let i = base.indexOf(t);
  while (i !== -1) {
    if (i > desde) partes.push({ texto: texto.slice(desde, i), marca: false });
    partes.push({ texto: texto.slice(i, i + t.length), marca: true });
    desde = i + t.length;
    i = base.indexOf(t, desde);
  }
  if (desde < texto.length) partes.push({ texto: texto.slice(desde), marca: false });
  return (
    <>
      {partes.map((parte, k) =>
        parte.marca ? (
          <mark key={k} className="bg-amber-200 dark:bg-amber-500/40 text-inherit rounded-sm px-px">
            {parte.texto}
          </mark>
        ) : (
          parte.texto
        )
      )}
    </>
  );
}

// Quita tildes letra por letra SIN cambiar la longitud (á→a, ñ→n...), para
// que las posiciones sigan valiendo sobre el texto original.
function quitarTildes(texto: string): string {
  return Array.from(texto)
    .map((c) => c.normalize("NFD").replace(/[\u0300-\u036f]/g, "").charAt(0) || c)
    .join("");
}

// Marco de un listado/catálogo: barra superior con título y conteo, nota
// opcional, y el contenido (buscador + tabla) adentro — mismo aspecto que
// "Facturas emitidas".
export function PanelListado({
  titulo,
  conteo,
  singular = "registro",
  plural = "registros",
  aviso,
  acciones,
  children,
}: {
  titulo: string;
  conteo?: number;
  singular?: string;
  plural?: string;
  aviso?: ReactNode;
  acciones?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-stone-300 dark:border-gray-700">
        <h2 className="text-base font-bold text-gray-900 dark:text-gray-50">{titulo}</h2>
        <div className="flex items-center gap-3">
          {conteo !== undefined && (
            <span className="font-mono text-[11px] text-gray-400 dark:text-gray-500">
              {conteo} {conteo === 1 ? singular : plural}
            </span>
          )}
          {acciones}
        </div>
      </div>
      {aviso && (
        <div className="px-4 py-2 bg-stone-50 dark:bg-gray-900/40 border-b border-stone-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
          {aviso}
        </div>
      )}
      {children}
    </div>
  );
}

// Fila "sin resultados" de un listado filtrado.
export function FilaSinResultados({ columnas, hayFiltros, vacio }: { columnas: number; hayFiltros: boolean; vacio: string }) {
  return (
    <tr>
      <td colSpan={columnas} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">
        {hayFiltros ? "Ningún registro coincide con la búsqueda." : vacio}
      </td>
    </tr>
  );
}

// Barra de título de un listado (como la de "Facturas emitidas"): título,
// conteo, acciones (ej. "+ Nuevo...") y nota opcional en franja gris. Para
// pantallas cuyo contenedor ya existe; PanelListado es la versión completa.
export function EncabezadoListado({
  titulo,
  conteo,
  singular = "registro",
  plural = "registros",
  acciones,
  aviso,
}: {
  titulo: string;
  conteo?: number;
  singular?: string;
  plural?: string;
  acciones?: ReactNode;
  aviso?: ReactNode;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-stone-300 dark:border-gray-700">
        <h2 className="text-base font-bold text-gray-900 dark:text-gray-50">{titulo}</h2>
        <div className="flex items-center gap-3">
          {conteo !== undefined && (
            <span className="font-mono text-[11px] text-gray-400 dark:text-gray-500">
              {conteo} {conteo === 1 ? singular : plural}
            </span>
          )}
          {acciones}
        </div>
      </div>
      {aviso && (
        <div className="px-4 py-2 bg-stone-50 dark:bg-gray-900/40 border-b border-stone-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
          {aviso}
        </div>
      )}
    </>
  );
}

// Pie simple de un listado sin montos: la línea gruesa con el conteo.
export function PieConteo({ cantidad, etiqueta, hayFiltros }: { cantidad: number; etiqueta: string; hayFiltros: boolean }) {
  if (cantidad === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 px-4 py-2.5 border-t-2 border-gray-900 dark:border-gray-200">
      <span className="font-mono text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {hayFiltros ? "Según filtro" : "Todos"}
      </span>
      <span className="text-sm font-bold text-gray-900 dark:text-gray-50">
        {etiqueta} <span className="font-mono tabular-nums ml-2">{cantidad}</span>
      </span>
    </div>
  );
}

// Botón de la barra de título ("+ Nuevo...", "Cancelar").
export const CLASE_BOTON_ENCABEZADO =
  "border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 px-3 py-1.5 rounded-sm text-sm font-semibold hover:bg-stone-50 dark:hover:bg-gray-700";
