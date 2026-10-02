import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { api, type ReporteAts } from "../api/client";
import { useFiltrosListado, BarraBuscadorDocumentos, filtrarLocal, sinPaginacion } from "../components/BuscadorDocumentos";
import { CLASE_CAMPO, CLASE_ETIQUETA, CLASE_THEAD, Resaltar } from "../components/FormatoDocumento";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// Insumo para el Anexo Transaccional Simplificado (ATS) que se declara
// mensualmente al SRI — a propósito NO es el XML oficial (ver el comentario
// de GET /reportes/ats en el backend), es un detalle por comprobante que el
// negocio o su contador revisan y cargan a mano en el DIMM Formularios.
// Vivía como una sección más dentro de ReportesPage.tsx; se independizó a su
// propia pestaña porque el período (siempre mes calendario, a diferencia
// del rango libre que usa el resto de Reportes) y el volumen de datos lo
// justifican como vista propia.
export function AtsPage() {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);

  const { data: reporteAts } = useQuery({
    queryKey: ["reporte-ats", anio, mes],
    queryFn: async () => (await api.get<ReporteAts>("/reportes/ats", { params: { anio, mes } })).data,
  });

  // Una hoja por sección, para revisar y cargar a mano al DIMM Formularios.
  function exportarExcelAts() {
    if (!reporteAts) return;
    const libro = XLSX.utils.book_new();

    const hojaVentas = XLSX.utils.json_to_sheet(
      reporteAts.ventas.map((v) => ({
        Tipo: v.tipo === "FACTURA" ? "Factura" : "Nota de venta",
        Fecha: new Date(v.fecha).toLocaleDateString("es-EC"),
        Comprobante: v.comprobante,
        "Clave de acceso": v.claveAcceso ?? "",
        "Tipo identificación (SRI)": v.tipoIdentificacion,
        Identificación: v.identificacion,
        "Razón social": v.razonSocial,
        "Base 0%": Number(v.base0),
        "Base 12%": Number(v.base12),
        IVA: Number(v.iva),
        Total: Number(v.total),
      }))
    );
    XLSX.utils.book_append_sheet(libro, hojaVentas, "Ventas");

    const hojaNotasCredito = XLSX.utils.json_to_sheet(
      reporteAts.notasCredito.map((n) => ({
        Fecha: new Date(n.fecha).toLocaleDateString("es-EC"),
        Comprobante: n.comprobante,
        "Clave de acceso": n.claveAcceso ?? "",
        "Factura modificada": n.facturaModificada,
        "Tipo identificación (SRI)": n.tipoIdentificacion,
        Identificación: n.identificacion,
        "Razón social": n.razonSocial,
        "Base 0%": Number(n.base0),
        "Base 12%": Number(n.base12),
        IVA: Number(n.iva),
        Total: Number(n.total),
      }))
    );
    XLSX.utils.book_append_sheet(libro, hojaNotasCredito, "Notas de crédito");

    const hojaCompras = XLSX.utils.json_to_sheet(
      reporteAts.compras.map((c) => ({
        Fecha: new Date(c.fecha).toLocaleDateString("es-EC"),
        Comprobante: c.comprobante,
        "Tipo identificación (SRI)": c.tipoIdentificacion,
        Identificación: c.identificacion,
        "Razón social": c.razonSocial,
        "Base 0%": Number(c.base0),
        "Base 12%": Number(c.base12),
        IVA: Number(c.iva),
        Total: Number(c.total),
        "Sustento tributario": c.sustentoTributario ?? "(completar a mano)",
      }))
    );
    XLSX.utils.book_append_sheet(libro, hojaCompras, "Compras");

    const hojaRetEmitidas = XLSX.utils.json_to_sheet(
      reporteAts.retencionesEmitidas.flatMap((r) =>
        r.detalles.map((d) => ({
          Fecha: new Date(r.fecha).toLocaleDateString("es-EC"),
          Comprobante: r.comprobante,
          "Clave de acceso": r.claveAcceso ?? "",
          "Compra Fact.": r.compraNumeroFactura,
          "Tipo identificación (SRI)": r.tipoIdentificacion,
          Identificación: r.identificacion,
          "Razón social": r.razonSocial,
          "Tipo impuesto": d.tipoImpuesto,
          "Código retención": d.codigoRetencion,
          "Base imponible": Number(d.baseImponible),
          Porcentaje: Number(d.porcentaje),
          "Valor retenido": Number(d.valorRetenido),
        }))
      )
    );
    XLSX.utils.book_append_sheet(libro, hojaRetEmitidas, "Retenciones emitidas");

    const hojaRetRecibidas = XLSX.utils.json_to_sheet(
      reporteAts.retencionesRecibidas.flatMap((r) =>
        r.detalles.map((d) => ({
          Fecha: new Date(r.fecha).toLocaleDateString("es-EC"),
          Comprobante: r.comprobante,
          Factura: r.facturaSecuencial,
          "Tipo identificación (SRI)": r.tipoIdentificacion,
          Identificación: r.identificacion,
          "Razón social": r.razonSocial,
          "Tipo impuesto": d.tipoImpuesto,
          "Código retención": d.codigoRetencion,
          "Base imponible": Number(d.baseImponible),
          Porcentaje: Number(d.porcentaje),
          "Valor retenido": Number(d.valorRetenido),
        }))
      )
    );
    XLSX.utils.book_append_sheet(libro, hojaRetRecibidas, "Retenciones recibidas");

    const hojaAnulados = XLSX.utils.json_to_sheet(
      reporteAts.anulados.map((a) => ({
        Tipo: a.tipo === "FACTURA" ? "Factura" : "Nota de crédito",
        Comprobante: a.comprobante,
        Fecha: new Date(a.fecha).toLocaleDateString("es-EC"),
        "Clave de acceso": a.claveAcceso ?? "",
      }))
    );
    XLSX.utils.book_append_sheet(libro, hojaAnulados, "Anulados");

    const hojaResumen = XLSX.utils.json_to_sheet([
      {
        Período: `${String(mes).padStart(2, "0")}/${anio}`,
        Ventas: reporteAts.resumen.cantidadVentas,
        "Total ventas": Number(reporteAts.resumen.totalVentas),
        "Notas de crédito": reporteAts.resumen.cantidadNotasCredito,
        Compras: reporteAts.resumen.cantidadCompras,
        "Total compras": Number(reporteAts.resumen.totalCompras),
        "Retenciones emitidas": reporteAts.resumen.cantidadRetencionesEmitidas,
        "Total retenciones emitidas": Number(reporteAts.resumen.totalRetencionesEmitidas),
        "Retenciones recibidas": reporteAts.resumen.cantidadRetencionesRecibidas,
        "Total retenciones recibidas": Number(reporteAts.resumen.totalRetencionesRecibidas),
        Anulados: reporteAts.resumen.cantidadAnulados,
      },
    ]);
    XLSX.utils.book_append_sheet(libro, hojaResumen, "Resumen");

    XLSX.writeFile(libro, `ats_${anio}-${String(mes).padStart(2, "0")}.xlsx`);
  }

  // Pestaña visible y buscador compartido de los listados (en el navegador:
  // el reporte del mes ya viene completo). El buscador filtra la pestaña
  // que se está viendo.
  const [seccion, setSeccion] = useState<SeccionAts>("ventas");
  const filtros = useFiltrosListado(sinPaginacion);
  const termino = filtros.busquedaAplicada;
  const R = (texto: string | null | undefined) => <Resaltar texto={texto ?? "—"} termino={termino} />;
  const retenido = (detalles: { valorRetenido: string }[]) => detalles.reduce((a, d) => a + Number(d.valorRetenido), 0);
  const codigos = (detalles: { tipoImpuesto: string; codigoRetencion: string; porcentaje: string }[]) =>
    detalles.map((d) => `${d.tipoImpuesto} ${d.codigoRetencion} (${Number(d.porcentaje)}%)`).join(" · ");
  const fecha = (valor: string) => <span className="font-mono text-xs">{new Date(valor).toLocaleDateString("es-EC")}</span>;
  const dinero = (valor: string | number) => <span className="font-mono tabular-nums">{Number(valor).toFixed(2)}</span>;

  const pestanas: { id: SeccionAts; etiqueta: string; cantidad: number }[] = reporteAts
    ? [
        { id: "ventas", etiqueta: "Ventas", cantidad: reporteAts.ventas.length },
        { id: "notasCredito", etiqueta: "Notas de crédito", cantidad: reporteAts.notasCredito.length },
        { id: "compras", etiqueta: "Compras", cantidad: reporteAts.compras.length },
        { id: "retEmitidas", etiqueta: "Ret. emitidas", cantidad: reporteAts.retencionesEmitidas.length },
        { id: "retRecibidas", etiqueta: "Ret. recibidas", cantidad: reporteAts.retencionesRecibidas.length },
        { id: "anulados", etiqueta: "Anulados", cantidad: reporteAts.anulados.length },
      ]
    : [];

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-stone-300 dark:border-gray-700">
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-50">Anexo Transaccional Simplificado (ATS)</h2>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-gray-400 dark:text-gray-500">
              Período {String(mes).padStart(2, "0")}/{anio}
            </span>
            <button
              onClick={exportarExcelAts}
              disabled={!reporteAts}
              className="bg-brand-700 text-white px-3 py-1.5 rounded-sm text-sm font-semibold hover:bg-brand-800 disabled:opacity-40"
            >
              Exportar Excel
            </button>
          </div>
        </div>
        <div className="px-4 py-2 bg-stone-50 dark:bg-gray-900/40 border-b border-stone-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
          Detalle por comprobante del mes elegido para revisar y cargar a mano en el DIMM Formularios — este sistema no genera el XML
          oficial que exige el SRI, solo el insumo para armarlo. La columna "Sustento tributario" de Compras viene vacía solo en compras
          registradas antes de que existiera ese campo; las nuevas ya lo piden al crearlas.
        </div>
        <div className="px-4 py-2 bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-400">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.15em] font-semibold">Códigos del SRI: verificar que sigan vigentes · </span>
          Los códigos de tipo de identificación, forma de pago y porcentaje de IVA están tomados de la Ficha Técnica del SRI vigente al
          programarlos, y el SRI los actualiza periódicamente. Si cambiaron, se corrigen desde <strong>Ajustes → Códigos SRI</strong>, sin
          tocar código.
        </div>

        <BarraBuscadorDocumentos
          filtros={filtros}
          etiquetaBusqueda="Buscar en la pestaña · comprobante, identificación, razón social o clave de acceso"
          placeholder="Ej: 001-001-000000125, 0190345678001, Tornillo..."
          mostrarPago={false}
          mostrarFechas={false}
          autoFocus
          extras={
            <>
              <label className="flex flex-col gap-1 w-36">
                <span className={CLASE_ETIQUETA}>Mes</span>
                <select value={mes} onChange={(e) => setMes(Number(e.target.value))} className={CLASE_CAMPO}>
                  {MESES.map((nombre, i) => (
                    <option key={nombre} value={i + 1}>
                      {nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 w-24">
                <span className={CLASE_ETIQUETA}>Año</span>
                <input type="number" value={anio} onChange={(e) => setAnio(Number(e.target.value))} className={`${CLASE_CAMPO} font-mono`} />
              </label>
            </>
          }
        />

        {/* Pestañas por sección del ATS, con su conteo */}
        <div className="flex flex-wrap border-b border-stone-300 dark:border-gray-700 px-2">
          {pestanas.map((p) => (
            <button
              key={p.id}
              onClick={() => setSeccion(p.id)}
              className={`px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px ${
                seccion === p.id
                  ? "border-brand-600 text-brand-700 dark:text-brand-300"
                  : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              }`}
            >
              {p.etiqueta}
              <span className="ml-1.5 font-mono text-[10px] text-gray-400 dark:text-gray-500">{p.cantidad}</span>
            </button>
          ))}
        </div>

        {!reporteAts && <p className="px-4 py-6 text-sm text-gray-400 dark:text-gray-500">Cargando...</p>}

        {reporteAts && seccion === "ventas" && (
          <TablaAts
            filas={filtrarLocal(reporteAts.ventas, filtros, { textos: (v) => [v.comprobante, v.identificacion, v.razonSocial, v.claveAcceso] }) ?? []}
            clave={(v) => `${v.tipo}-${v.comprobante}`}
            total={(v) => Number(v.total)}
            vacio="Sin ventas en este período"
            hayFiltros={filtros.hayFiltros}
            columnas={[
              { titulo: "Tipo", celda: (v) => <span className="font-mono text-[10px] uppercase tracking-wider text-gray-500">{v.tipo === "FACTURA" ? "Factura" : "Nota de venta"}</span> },
              { titulo: "Comprobante", celda: (v) => <span className="font-mono text-xs">{R(v.comprobante)}</span> },
              { titulo: "Fecha", celda: (v) => fecha(v.fecha) },
              { titulo: "Identificación", celda: (v) => <span className="font-mono text-xs">{R(v.identificacion)}</span> },
              { titulo: "Razón social", celda: (v) => R(v.razonSocial) },
              { titulo: "Base 0%", derecha: true, celda: (v) => dinero(v.base0) },
              { titulo: "Base gravada", derecha: true, celda: (v) => dinero(v.base12) },
              { titulo: "IVA", derecha: true, celda: (v) => dinero(v.iva) },
              { titulo: "Total", derecha: true, celda: (v) => <strong>{dinero(v.total)}</strong> },
            ]}
          />
        )}
        {reporteAts && seccion === "notasCredito" && (
          <TablaAts
            filas={filtrarLocal(reporteAts.notasCredito, filtros, { textos: (n) => [n.comprobante, n.facturaModificada, n.identificacion, n.razonSocial, n.claveAcceso] }) ?? []}
            clave={(n) => n.comprobante}
            total={(n) => Number(n.total)}
            vacio="Sin notas de crédito en este período"
            hayFiltros={filtros.hayFiltros}
            columnas={[
              { titulo: "Comprobante", celda: (n) => <span className="font-mono text-xs">{R(n.comprobante)}</span> },
              { titulo: "Fecha", celda: (n) => fecha(n.fecha) },
              { titulo: "Factura modificada", celda: (n) => <span className="font-mono text-xs">{R(n.facturaModificada)}</span> },
              { titulo: "Identificación", celda: (n) => <span className="font-mono text-xs">{R(n.identificacion)}</span> },
              { titulo: "Razón social", celda: (n) => R(n.razonSocial) },
              { titulo: "Base 0%", derecha: true, celda: (n) => dinero(n.base0) },
              { titulo: "Base gravada", derecha: true, celda: (n) => dinero(n.base12) },
              { titulo: "IVA", derecha: true, celda: (n) => dinero(n.iva) },
              { titulo: "Total", derecha: true, celda: (n) => <strong>{dinero(n.total)}</strong> },
            ]}
          />
        )}
        {reporteAts && seccion === "compras" && (
          <TablaAts
            filas={filtrarLocal(reporteAts.compras, filtros, { textos: (c) => [c.comprobante, c.identificacion, c.razonSocial, c.sustentoTributario] }) ?? []}
            clave={(c) => `${c.comprobante}-${c.identificacion}`}
            total={(c) => Number(c.total)}
            vacio="Sin compras en este período"
            hayFiltros={filtros.hayFiltros}
            columnas={[
              { titulo: "Comprobante", celda: (c) => <span className="font-mono text-xs">{R(c.comprobante)}</span> },
              { titulo: "Fecha", celda: (c) => fecha(c.fecha) },
              { titulo: "Identificación", celda: (c) => <span className="font-mono text-xs">{R(c.identificacion)}</span> },
              { titulo: "Razón social", celda: (c) => R(c.razonSocial) },
              { titulo: "Base 0%", derecha: true, celda: (c) => dinero(c.base0) },
              { titulo: "Base gravada", derecha: true, celda: (c) => dinero(c.base12) },
              { titulo: "IVA", derecha: true, celda: (c) => dinero(c.iva) },
              { titulo: "Total", derecha: true, celda: (c) => <strong>{dinero(c.total)}</strong> },
              {
                titulo: "Sustento",
                celda: (c) =>
                  c.sustentoTributario ? (
                    <span className="font-mono text-xs">{R(c.sustentoTributario)}</span>
                  ) : (
                    <span className="font-mono text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400">Completar</span>
                  ),
              },
            ]}
          />
        )}
        {reporteAts && seccion === "retEmitidas" && (
          <TablaAts
            filas={filtrarLocal(reporteAts.retencionesEmitidas, filtros, { textos: (r) => [r.comprobante, r.compraNumeroFactura, r.identificacion, r.razonSocial, r.claveAcceso] }) ?? []}
            clave={(r) => r.comprobante}
            total={(r) => retenido(r.detalles)}
            etiquetaTotal="TOTAL RETENIDO USD"
            vacio="Sin retenciones emitidas en este período"
            hayFiltros={filtros.hayFiltros}
            columnas={[
              { titulo: "Comprobante", celda: (r) => <span className="font-mono text-xs">{R(r.comprobante)}</span> },
              { titulo: "Fecha", celda: (r) => fecha(r.fecha) },
              { titulo: "Compra fact.", celda: (r) => <span className="font-mono text-xs">{R(r.compraNumeroFactura)}</span> },
              { titulo: "Identificación", celda: (r) => <span className="font-mono text-xs">{R(r.identificacion)}</span> },
              { titulo: "Razón social", celda: (r) => R(r.razonSocial) },
              { titulo: "Retenciones", celda: (r) => <span className="font-mono text-[11px] text-gray-500">{codigos(r.detalles)}</span> },
              { titulo: "Valor retenido", derecha: true, celda: (r) => <strong>{dinero(retenido(r.detalles))}</strong> },
            ]}
          />
        )}
        {reporteAts && seccion === "retRecibidas" && (
          <TablaAts
            filas={filtrarLocal(reporteAts.retencionesRecibidas, filtros, { textos: (r) => [r.comprobante, r.facturaSecuencial, r.identificacion, r.razonSocial] }) ?? []}
            clave={(r) => `${r.comprobante}-${r.facturaSecuencial}`}
            total={(r) => retenido(r.detalles)}
            etiquetaTotal="TOTAL RETENIDO USD"
            vacio="Sin retenciones recibidas en este período"
            hayFiltros={filtros.hayFiltros}
            columnas={[
              { titulo: "Comprobante", celda: (r) => <span className="font-mono text-xs">{R(r.comprobante)}</span> },
              { titulo: "Fecha", celda: (r) => fecha(r.fecha) },
              { titulo: "Factura", celda: (r) => <span className="font-mono text-xs">{R(r.facturaSecuencial)}</span> },
              { titulo: "Identificación", celda: (r) => <span className="font-mono text-xs">{R(r.identificacion)}</span> },
              { titulo: "Razón social", celda: (r) => R(r.razonSocial) },
              { titulo: "Retenciones", celda: (r) => <span className="font-mono text-[11px] text-gray-500">{codigos(r.detalles)}</span> },
              { titulo: "Valor retenido", derecha: true, celda: (r) => <strong>{dinero(retenido(r.detalles))}</strong> },
            ]}
          />
        )}
        {reporteAts && seccion === "anulados" && (
          <TablaAts
            filas={filtrarLocal(reporteAts.anulados, filtros, { textos: (x) => [x.comprobante, x.claveAcceso] }) ?? []}
            clave={(x) => `${x.tipo}-${x.comprobante}`}
            vacio="Sin comprobantes anulados en este período"
            hayFiltros={filtros.hayFiltros}
            columnas={[
              { titulo: "Tipo", celda: (x) => <span className="font-mono text-[10px] uppercase tracking-wider text-gray-500">{x.tipo === "FACTURA" ? "Factura" : "Nota de crédito"}</span> },
              { titulo: "Comprobante", celda: (x) => <span className="font-mono text-xs">{R(x.comprobante)}</span> },
              { titulo: "Fecha", celda: (x) => fecha(x.fecha) },
              { titulo: "Clave de acceso", celda: (x) => <span className="font-mono text-[11px] text-gray-500 break-all">{R(x.claveAcceso)}</span> },
            ]}
          />
        )}
      </div>
    </div>
  );
}

type SeccionAts = "ventas" | "notasCredito" | "compras" | "retEmitidas" | "retRecibidas" | "anulados";

// Tabla de una sección del ATS: encabezado del formato, filas y pie con el
// total de lo filtrado (como el de Facturas emitidas).
function TablaAts<T>({
  filas,
  columnas,
  clave,
  total,
  etiquetaTotal = "TOTAL USD",
  vacio,
  hayFiltros,
}: {
  filas: T[];
  columnas: { titulo: string; derecha?: boolean; celda: (fila: T) => ReactNode }[];
  clave: (fila: T) => string;
  total?: (fila: T) => number;
  etiquetaTotal?: string;
  vacio: string;
  hayFiltros: boolean;
}) {
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className={CLASE_THEAD}>
            <tr>
              {columnas.map((c) => (
                <th key={c.titulo} className={`px-4 py-2 whitespace-nowrap ${c.derecha ? "text-right" : ""}`}>
                  {c.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && (
              <tr>
                <td colSpan={columnas.length} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">
                  {hayFiltros ? "Ningún comprobante coincide con la búsqueda." : vacio}
                </td>
              </tr>
            )}
            {filas.map((fila) => (
              <tr key={clave(fila)} className="border-t border-stone-100 dark:border-gray-700 hover:bg-stone-50 dark:hover:bg-gray-700/30">
                {columnas.map((c) => (
                  <td key={c.titulo} className={`px-4 py-2 ${c.derecha ? "text-right whitespace-nowrap" : ""}`}>
                    {c.celda(fila)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filas.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 px-4 py-2.5 border-t-2 border-gray-900 dark:border-gray-200">
          <span className="font-mono text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {filas.length} comprobante{filas.length === 1 ? "" : "s"}
            {hayFiltros ? " · según filtro" : ""}
          </span>
          {total && (
            <span className="text-sm font-bold text-gray-900 dark:text-gray-50">
              {etiquetaTotal}{" "}
              <span className="font-mono tabular-nums ml-2">{filas.reduce((a, f) => a + total(f), 0).toFixed(2)}</span>
            </span>
          )}
        </div>
      )}
    </>
  );
}
