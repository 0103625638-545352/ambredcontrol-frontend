import { useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api, abrirPdfEnNuevaPestana, type NotaVenta } from "../api/client";
import { usePermiso } from "../context/AuthContext";
import { Paginacion } from "../components/Paginacion";
import { EstadoBadge } from "../components/EstadoBadge";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmProvider";
import { ModalRegistrarPago } from "../components/ModalRegistrarPago";
import { ModalHistorialPagos } from "../components/ModalHistorialPagos";
import {
  useFiltrosListado,
  BarraBuscadorDocumentos,
  PieResumenListado,
  type RespuestaConResumen,
} from "../components/BuscadorDocumentos";
import {
  CLASE_CAMPO,
  CLASE_ETIQUETA,
  CLASE_THEAD,
  CLASE_ACCION,
  CLASE_ACCION_OK,
  CLASE_ACCION_PELIGRO,
  Resaltar,
} from "../components/FormatoDocumento";

const TAMANO_PAGINA = 20;

export function NotasVentaPage() {
  const puedeAnular = usePermiso("facturas_anular");
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const confirmar = useConfirm();
  const [pagina, setPagina] = useState(1);
  const [notaVentaPagoId, setNotaVentaPagoId] = useState<number | null>(null);
  const [notaVentaVerPagosId, setNotaVentaVerPagosId] = useState<number | null>(null);

  // Buscador dinámico compartido con Facturas emitidas (ver
  // components/BuscadorDocumentos.tsx) + un filtro propio: si la nota
  // desglosa IVA o no.
  const filtros = useFiltrosListado(setPagina);

  const { data: respuesta, isLoading, isFetching } = useQuery({
    queryKey: ["notas-venta", pagina, ...filtros.clave],
    queryFn: async () =>
      (
        await api.get<RespuestaConResumen<NotaVenta>>("/notas-venta", {
          params: { page: pagina, pageSize: TAMANO_PAGINA, ...filtros.params },
        })
      ).data,
    placeholderData: keepPreviousData,
  });
  const notasVenta = respuesta?.datos;
  // Mientras llega el resultado de una búsqueda nueva, la tabla anterior
  // queda visible pero atenuada (en vez de parpadear en blanco).
  const buscando = isFetching && !isLoading;

  // A diferencia de Factura, una nota de venta se puede anular en cualquier
  // momento (mientras no esté ya anulada): nunca pasa por el SRI, así que no
  // hay un estado "AUTORIZADA" que lo impida.
  const anularNotaVenta = useMutation({
    mutationFn: async (id: number) => api.patch(`/notas-venta/${id}/anular`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notas-venta"] });
      queryClient.invalidateQueries({ queryKey: ["productos"] }); // el stock cambió
    },
    onError: (error: any) => {
      mostrarToast(error.response?.data?.error ?? "Error al anular la nota de venta");
    },
  });

  async function confirmarAnulacion(n: NotaVenta) {
    const ok = await confirmar(
      `¿Anular la nota de venta ${n.secuencial}? Esto devolverá el stock de todos sus productos. Esta acción no se puede deshacer.`
    );
    if (ok) anularNotaVenta.mutate(n.id);
  }

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-stone-300 dark:border-gray-700">
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-50">Notas de venta</h2>
          <span className="font-mono text-[11px] text-gray-400 dark:text-gray-500">
            {respuesta ? `${respuesta.paginacion.total} documento${respuesta.paginacion.total === 1 ? "" : "s"}` : ""}
          </span>
        </div>
        <div className="px-4 py-2 bg-stone-50 dark:bg-gray-900/40 border-b border-stone-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
          Recibos internos: no pasan por el SRI. Para clientes que no necesitan una factura formal.
        </div>

        <BarraBuscadorDocumentos
          filtros={filtros}
          autoFocus
          etiquetaBusqueda="Buscar · número, cliente o cédula/RUC"
          placeholder="Ej: 000000125, Tornillo, 0190345678001..."
          opcionesEstado={[
            { valor: "CREADA", etiqueta: "Vigente" },
            { valor: "ANULADA", etiqueta: "Anulada" },
          ]}
          extras={
            <label className="flex flex-col gap-1 w-28">
              <span className={CLASE_ETIQUETA}>IVA</span>
              <select
                value={filtros.extra.aplicaIva ?? ""}
                onChange={(e) => filtros.setExtra("aplicaIva", e.target.value)}
                className={CLASE_CAMPO}
              >
                <option value="">Todas</option>
                <option value="true">Con IVA</option>
                <option value="false">Sin IVA</option>
              </select>
            </label>
          }
        />

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className={CLASE_THEAD}>
              <tr>
                <th className="px-4 py-2">No.</th>
                <th className="px-4 py-2">Cliente</th>
                <th className="px-4 py-2">Emisión</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2">IVA</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2">Pago</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className={buscando ? "opacity-60 transition-opacity" : "transition-opacity"}>
              {isLoading && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-gray-400 dark:text-gray-500">
                    Cargando...
                  </td>
                </tr>
              )}
              {!isLoading && notasVenta?.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">
                    {filtros.hayFiltros ? "Ninguna nota de venta coincide con la búsqueda." : "No hay notas de venta emitidas."}
                  </td>
                </tr>
              )}
              {notasVenta?.map((n) => {
                const saldo = (parseFloat(n.total) - parseFloat(n.montoPagado)).toFixed(2);
                const anulada = n.estado === "ANULADA";
                return (
                  <tr
                    key={n.id}
                    className={`border-t border-stone-100 dark:border-gray-700 hover:bg-stone-50 dark:hover:bg-gray-700/30 align-top ${
                      anulada ? "text-gray-400 dark:text-gray-500" : ""
                    }`}
                  >
                    <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">
                      <Resaltar texto={n.secuencial} termino={filtros.busquedaAplicada} />
                    </td>
                    <td className="px-4 py-2">
                      <Resaltar texto={n.cliente.razonSocial} termino={filtros.busquedaAplicada} />
                      <span className="block font-mono text-[11px] text-gray-400 dark:text-gray-500">
                        <Resaltar texto={n.cliente.identificacion} termino={filtros.busquedaAplicada} />
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">
                      {new Date(n.fechaEmision).toLocaleDateString("es-EC")}
                    </td>
                    <td
                      className={`px-4 py-2 text-right font-mono tabular-nums ${
                        anulada ? "line-through" : "font-semibold text-gray-900 dark:text-gray-50"
                      }`}
                    >
                      {n.total}
                    </td>
                    <td className="px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      {n.aplicaIva ? "Con IVA" : "Sin IVA"}
                    </td>
                    <td className="px-4 py-2">
                      <EstadoBadge estado={n.estado} />
                    </td>
                    <td className="px-4 py-2">
                      {anulada ? (
                        <span className="text-gray-300 dark:text-gray-600">—</span>
                      ) : (
                        <div className="flex flex-col items-start gap-0.5">
                          <EstadoBadge estado={n.estadoPago} />
                          {n.estadoPago !== "PAGADA" && (
                            <span className="font-mono text-[10px] text-gray-400 dark:text-gray-500">Saldo {saldo}</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex flex-wrap justify-end gap-x-3 gap-y-1">
                        <button onClick={() => abrirPdfEnNuevaPestana(`/notas-venta/${n.id}/recibo`)} className={CLASE_ACCION}>
                          Ver PDF
                        </button>
                        <button onClick={() => abrirPdfEnNuevaPestana(`/notas-venta/${n.id}/recibo-termico`)} className={CLASE_ACCION}>
                          80mm
                        </button>
                        <button onClick={() => setNotaVentaVerPagosId(n.id)} className={CLASE_ACCION}>
                          Pagos
                        </button>
                        {!anulada && n.estadoPago !== "PAGADA" && (
                          <button onClick={() => setNotaVentaPagoId(n.id)} className={CLASE_ACCION_OK}>
                            Registrar pago
                          </button>
                        )}
                        {n.estado === "CREADA" && puedeAnular && (
                          <button onClick={() => confirmarAnulacion(n)} className={CLASE_ACCION_PELIGRO}>
                            Anular
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <PieResumenListado resumen={respuesta?.resumen} hayFiltros={filtros.hayFiltros} />
        {respuesta && (
          <Paginacion
            page={respuesta.paginacion.page}
            totalPaginas={respuesta.paginacion.totalPaginas}
            total={respuesta.paginacion.total}
            onCambiarPagina={setPagina}
          />
        )}
      </div>

      {notaVentaPagoId !== null && (() => {
        const notaVenta = notasVenta?.find((n) => n.id === notaVentaPagoId);
        if (!notaVenta) return null;
        const saldo = (parseFloat(notaVenta.total) - parseFloat(notaVenta.montoPagado)).toFixed(2);
        return (
          <ModalRegistrarPago
            endpoint={`/notas-venta/${notaVenta.id}/pagos`}
            documento={`nota de venta ${notaVenta.secuencial}`}
            saldoPendiente={saldo}
            queryKeysAInvalidar={[["notas-venta"], ["reporte-cuentas-por-cobrar"]]}
            onCerrar={() => setNotaVentaPagoId(null)}
            onPagado={() => setNotaVentaPagoId(null)}
          />
        );
      })()}

      {notaVentaVerPagosId !== null && (() => {
        const notaVenta = notasVenta?.find((n) => n.id === notaVentaVerPagosId);
        if (!notaVenta) return null;
        return (
          <ModalHistorialPagos
            endpointBase={`/notas-venta/${notaVenta.id}`}
            documento={`nota de venta ${notaVenta.secuencial}`}
            queryKeysAInvalidar={[["notas-venta"], ["reporte-cuentas-por-cobrar"]]}
            onCerrar={() => setNotaVentaVerPagosId(null)}
          />
        );
      })()}
    </div>
  );
}
