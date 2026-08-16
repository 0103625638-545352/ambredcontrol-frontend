import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { api, type ReporteAts } from "../api/client";

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

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Anexo Transaccional Simplificado (ATS)</h2>
        <button
          onClick={exportarExcelAts}
          disabled={!reporteAts}
          className="bg-brand-600 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-brand-700 disabled:opacity-40"
        >
          Exportar Excel
        </button>
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-3 max-w-3xl">
        Detalle por comprobante del mes elegido (ventas, compras, notas de crédito, retenciones emitidas/recibidas y
        anulados) para revisar y cargar a mano en el DIMM Formularios — este sistema no genera el XML oficial que
        exige el SRI, solo el insumo para armarlo. La columna "Sustento tributario" de Compras viene vacía solo en
        compras registradas antes de que existiera ese campo; las nuevas ya lo piden al crearlas.
      </p>

      <div className="border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 rounded-md p-3 mb-4 max-w-3xl">
        <p className="text-sm font-semibold text-red-700 dark:text-red-400">⚠ Códigos del SRI: verificar que sigan vigentes</p>
        <p className="text-xs text-red-600 dark:text-red-400 mt-1">
          Los códigos de tipo de identificación, forma de pago (efectivo/tarjeta/transferencia) y porcentaje de IVA
          que usa el XML de cada comprobante están tomados de la Ficha Técnica del SRI vigente al momento en que se
          programaron — el SRI los actualiza periódicamente. Verificalos de tanto en tanto contra la ficha técnica
          oficial más reciente; si cambiaron, se corrigen desde <strong>Ajustes → Códigos SRI</strong>, sin tocar
          código ni volver a desplegar.
        </p>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <label className="text-xs text-gray-500 dark:text-gray-400">Período</label>
        <select
          value={mes}
          onChange={(e) => setMes(Number(e.target.value))}
          className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1.5 text-sm"
        >
          {MESES.map((nombre, i) => (
            <option key={nombre} value={i + 1}>
              {nombre}
            </option>
          ))}
        </select>
        <input
          type="number"
          value={anio}
          onChange={(e) => setAnio(Number(e.target.value))}
          className="w-24 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1.5 text-sm"
        />
      </div>

      {reporteAts && (
        <>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4">
            <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 p-3">
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Ventas</p>
              <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{reporteAts.resumen.cantidadVentas}</p>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">${reporteAts.resumen.totalVentas}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 p-3">
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Notas de crédito</p>
              <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{reporteAts.resumen.cantidadNotasCredito}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 p-3">
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Compras</p>
              <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{reporteAts.resumen.cantidadCompras}</p>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">${reporteAts.resumen.totalCompras}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 p-3">
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Ret. emitidas</p>
              <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{reporteAts.resumen.cantidadRetencionesEmitidas}</p>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">${reporteAts.resumen.totalRetencionesEmitidas}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 p-3">
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Ret. recibidas</p>
              <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{reporteAts.resumen.cantidadRetencionesRecibidas}</p>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">${reporteAts.resumen.totalRetencionesRecibidas}</p>
            </div>
            <div className="bg-amber-600 rounded-lg shadow-sm p-3">
              <p className="text-[11px] text-amber-100">Anulados</p>
              <p className="text-lg font-bold text-white">{reporteAts.resumen.cantidadAnulados}</p>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
                <tr>
                  <th className="px-4 py-2">Tipo</th>
                  <th className="px-4 py-2">Comprobante</th>
                  <th className="px-4 py-2">Fecha</th>
                  <th className="px-4 py-2">Identificación</th>
                  <th className="px-4 py-2">Razón social</th>
                  <th className="px-4 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {reporteAts.ventas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">
                      Sin ventas en este período
                    </td>
                  </tr>
                )}
                {reporteAts.ventas.map((v) => (
                  <tr key={`${v.tipo}-${v.comprobante}`} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
                      {v.tipo === "FACTURA" ? "Factura" : "Nota de venta"}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{v.comprobante}</td>
                    <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
                      {new Date(v.fecha).toLocaleDateString("es-EC")}
                    </td>
                    <td className="px-4 py-2 text-xs">{v.identificacion}</td>
                    <td className="px-4 py-2">{v.razonSocial}</td>
                    <td className="px-4 py-2 text-right font-semibold">${v.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
            Solo se muestran las ventas en pantalla — compras, notas de crédito, retenciones (con su detalle de
            IVA/Renta) y anulados vienen completos en el Excel.
          </p>
        </>
      )}
    </div>
  );
}
