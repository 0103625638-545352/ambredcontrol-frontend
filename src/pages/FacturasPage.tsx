import { useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api, abrirPdfEnNuevaPestana, type Factura } from "../api/client";
import {
  useFiltrosListado,
  BarraBuscadorDocumentos,
  PieResumenListado,
  type RespuestaConResumen,
} from "../components/BuscadorDocumentos";
import { usePermiso } from "../context/AuthContext";
import { Paginacion } from "../components/Paginacion";
import { EstadoBadge } from "../components/EstadoBadge";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmProvider";
import { ModalRegistrarPago } from "../components/ModalRegistrarPago";
import { ModalHistorialPagos } from "../components/ModalHistorialPagos";
import { ModalRegistrarRetencionRecibida } from "../components/ModalRegistrarRetencionRecibida";
import { ModalGenerarGuiaRemision } from "../components/ModalGenerarGuiaRemision";
import {
  CLASE_THEAD,
  CLASE_ACCION,
  CLASE_ACCION_OK,
  CLASE_ACCION_PELIGRO,
  Resaltar,
} from "../components/FormatoDocumento";

const TAMANO_PAGINA = 20;

interface Props {
  // Lleva al usuario a Notas de Crédito con esta factura ya preseleccionada
  // — evita tener que buscarla de nuevo en el <select> de esa pantalla.
  onIrANotaCredito: (facturaId: number) => void;
}

export function FacturasPage({ onIrANotaCredito }: Props) {
  const puedeAnular = usePermiso("facturas_anular");
  const puedeNotasCredito = usePermiso("notas_credito");
  const puedeRetenciones = usePermiso("retenciones");
  const puedeGuiasRemision = usePermiso("guias_remision");
  const puedeEnviarSri = usePermiso("facturas_sri");
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const confirmar = useConfirm();
  const [pagina, setPagina] = useState(1);
  const [facturaPagoId, setFacturaPagoId] = useState<number | null>(null);
  const [facturaVerPagosId, setFacturaVerPagosId] = useState<number | null>(null);
  const [facturaRetencionId, setFacturaRetencionId] = useState<number | null>(null);
  const [facturaGuiaRemisionId, setFacturaGuiaRemisionId] = useState<number | null>(null);

  // Buscador dinámico compartido (ver components/BuscadorDocumentos.tsx):
  // texto con debounce + fechas + estado SRI + estado de pago, resuelto en
  // el backend para que funcione con la paginación.
  const filtros = useFiltrosListado(setPagina);
  const busquedaAplicada = filtros.busquedaAplicada;
  const hayFiltros = filtros.hayFiltros;

  const { data: respuesta, isLoading, isFetching } = useQuery({
    queryKey: ["facturas", pagina, ...filtros.clave],
    queryFn: async () =>
      (
        await api.get<RespuestaConResumen<Factura>>("/facturas", {
          params: { page: pagina, pageSize: TAMANO_PAGINA, ...filtros.params },
        })
      ).data,
    placeholderData: keepPreviousData,
  });
  // Mientras llega el resultado de una búsqueda nueva, la tabla anterior
  // queda visible pero atenuada (en vez de parpadear en blanco).
  const buscando = isFetching && !isLoading;
  const facturas = respuesta?.datos;

  // Anula una factura (solo funciona si el backend confirma que está en
  // estado CREADA — si ya se envió al SRI, el backend rechaza la anulación
  // y explica que hace falta una Nota de Crédito).
  const anularFactura = useMutation({
    mutationFn: async (facturaId: number) => api.patch(`/facturas/${facturaId}/anular`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["facturas"] });
      queryClient.invalidateQueries({ queryKey: ["productos"] }); // el stock cambió
    },
    onError: (error: any) => {
      mostrarToast(error.response?.data?.error ?? "Error al anular la factura");
    },
  });

  async function confirmarAnulacion(f: Factura) {
    const ok = await confirmar(
      `¿Anular la factura ${f.secuencial}? Esto devolverá el stock de todos sus productos. Esta acción no se puede deshacer.`
    );
    if (ok) anularFactura.mutate(f.id);
  }

  // Normalmente ya no hace falta: toda factura nueva se envía sola al SRI al
  // crearse. Este botón es el respaldo manual para cuando ese envío
  // automático falló (sin certificado en ese momento, sin internet, etc.) y
  // no se quiere esperar a que el job en segundo plano la reintente solo.
  const enviarSri = useMutation({
    mutationFn: async (facturaId: number) => api.post(`/facturas/${facturaId}/enviar-sri`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["facturas"] }),
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al enviar al SRI"),
  });

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-stone-300 dark:border-gray-700">
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-50">Facturas emitidas</h2>
          <span className="font-mono text-[11px] text-gray-400 dark:text-gray-500">
            {respuesta ? `${respuesta.paginacion.total} documento${respuesta.paginacion.total === 1 ? "" : "s"}` : ""}
          </span>
        </div>

        <BarraBuscadorDocumentos
          filtros={filtros}
          autoFocus
          etiquetaBusqueda="Buscar · número, cliente, cédula/RUC o clave de acceso"
          placeholder="Ej: 000000482, Tornillo, 0190345678001..."
          etiquetaEstado="Estado SRI"
          opcionesEstado={[
            { valor: "CREADA", etiqueta: "Creada" },
            { valor: "ENVIADA", etiqueta: "Enviada" },
            { valor: "AUTORIZADA", etiqueta: "Autorizada" },
            { valor: "RECHAZADA", etiqueta: "Rechazada" },
            { valor: "ANULADA", etiqueta: "Anulada" },
          ]}
        />

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className={CLASE_THEAD}>
              <tr>
                <th className="px-4 py-2">No.</th>
                <th className="px-4 py-2">Cliente</th>
                <th className="px-4 py-2">Emisión</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2">Estado SRI</th>
                <th className="px-4 py-2">Pago</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className={buscando ? "opacity-60 transition-opacity" : "transition-opacity"}>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-gray-400 dark:text-gray-500">
                    Cargando...
                  </td>
                </tr>
              )}
              {!isLoading && facturas?.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">
                    {hayFiltros ? "Ninguna factura coincide con la búsqueda." : "Todavía no hay facturas emitidas."}
                  </td>
                </tr>
              )}
              {facturas?.map((f) => {
                const saldo = (parseFloat(f.total) - parseFloat(f.montoPagado)).toFixed(2);
                return (
                  <tr
                    key={f.id}
                    className={`border-t border-stone-100 dark:border-gray-700 hover:bg-stone-50 dark:hover:bg-gray-700/30 align-top ${
                      f.estado === "ANULADA" ? "text-gray-400 dark:text-gray-500" : ""
                    }`}
                  >
                    <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">
                      <Resaltar texto={f.secuencial} termino={busquedaAplicada} />
                    </td>
                    <td className="px-4 py-2">
                      <Resaltar texto={f.cliente.razonSocial} termino={busquedaAplicada} />
                      <span className="block font-mono text-[11px] text-gray-400 dark:text-gray-500">
                        <Resaltar texto={f.cliente.identificacion} termino={busquedaAplicada} />
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">
                      {new Date(f.fechaEmision).toLocaleDateString("es-EC")}
                    </td>
                    <td
                      className={`px-4 py-2 text-right font-mono tabular-nums ${f.estado === "ANULADA" ? "line-through" : "font-semibold text-gray-900 dark:text-gray-50"}`}
                    >
                      {f.total}
                    </td>
                    <td className="px-4 py-2">
                      <EstadoBadge estado={f.estado} />
                    </td>
                    <td className="px-4 py-2">
                      {f.estado === "ANULADA" ? (
                        <span className="text-gray-300 dark:text-gray-600">—</span>
                      ) : (
                        <div className="flex flex-col items-start gap-0.5">
                          <EstadoBadge estado={f.estadoPago} />
                          {f.estadoPago !== "PAGADA" && (
                            <span className="font-mono text-[10px] text-gray-400 dark:text-gray-500">Saldo {saldo}</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex flex-wrap justify-end gap-x-3 gap-y-1">
                        <button onClick={() => abrirPdfEnNuevaPestana(`/facturas/${f.id}/ride`)} className={CLASE_ACCION}>
                          Ver PDF
                        </button>
                        <button onClick={() => abrirPdfEnNuevaPestana(`/facturas/${f.id}/recibo-termico`)} className={CLASE_ACCION}>
                          80mm
                        </button>
                        <button onClick={() => setFacturaVerPagosId(f.id)} className={CLASE_ACCION}>
                          Pagos
                        </button>
                        {f.estado !== "ANULADA" && f.estadoPago !== "PAGADA" && (
                          <button onClick={() => setFacturaPagoId(f.id)} className={CLASE_ACCION_OK}>
                            Registrar pago
                          </button>
                        )}
                        {/* Respaldo manual: normalmente ya no hace falta porque toda
                            factura nueva se envía sola al SRI al crearse. */}
                        {f.estado === "CREADA" && puedeEnviarSri && (
                          <button onClick={() => enviarSri.mutate(f.id)} disabled={enviarSri.isPending} className={`${CLASE_ACCION_OK} disabled:opacity-40`}>
                            {enviarSri.isPending ? "Enviando..." : "Enviar al SRI"}
                          </button>
                        )}
                        {/* Solo mostramos el botón de anular si tiene sentido: una factura
                            ya anulada o autorizada no puede anularse de nuevo desde aquí */}
                        {f.estado === "CREADA" && puedeAnular && (
                          <button onClick={() => confirmarAnulacion(f)} className={CLASE_ACCION_PELIGRO}>
                            Anular
                          </button>
                        )}
                        {/* Una factura ya AUTORIZADA por el SRI no se puede anular
                            directamente (regla del SRI) — la única forma de corregirla
                            o dejarla sin efecto es con una nota de crédito. */}
                        {f.estado === "AUTORIZADA" && puedeNotasCredito && (
                          <button onClick={() => onIrANotaCredito(f.id)} className={CLASE_ACCION_PELIGRO}>
                            Nota de crédito
                          </button>
                        )}
                        {/* Un cliente agente de retención puede retenernos IVA/Renta
                            al pagar — esto solo registra lo que ya nos entregó, no
                            genera ni envía nada (eso lo hace el cliente, del otro lado). */}
                        {f.estado === "AUTORIZADA" && !f.retencionRecibida && puedeRetenciones && (
                          <button onClick={() => setFacturaRetencionId(f.id)} className={CLASE_ACCION}>
                            Retención recibida
                          </button>
                        )}
                        {/* Documento de transporte que acompaña la mercadería ya
                            vendida — se puede generar más de una guía por factura
                            (envío repartido en varios viajes/camiones), por eso el
                            botón sigue visible aunque ya se haya generado una. */}
                        {f.estado === "AUTORIZADA" && puedeGuiasRemision && (
                          <button onClick={() => setFacturaGuiaRemisionId(f.id)} className={CLASE_ACCION}>
                            Guía de remisión
                          </button>
                        )}
                      </div>
                      {f.retencionRecibida && (
                        <span className="block mt-1 font-mono text-[10px] text-gray-500 dark:text-gray-400">
                          Retención recibida {f.retencionRecibida.total}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <PieResumenListado resumen={respuesta?.resumen} hayFiltros={hayFiltros} />
        {respuesta && (
          <Paginacion
            page={respuesta.paginacion.page}
            totalPaginas={respuesta.paginacion.totalPaginas}
            total={respuesta.paginacion.total}
            onCambiarPagina={setPagina}
          />
        )}
      </div>

      {facturaPagoId !== null && (() => {
        const factura = facturas?.find((f) => f.id === facturaPagoId);
        if (!factura) return null;
        const saldo = (parseFloat(factura.total) - parseFloat(factura.montoPagado)).toFixed(2);
        return (
          <ModalRegistrarPago
            endpoint={`/facturas/${factura.id}/pagos`}
            documento={`factura ${factura.secuencial}`}
            saldoPendiente={saldo}
            queryKeysAInvalidar={[["facturas"], ["reporte-cuentas-por-cobrar"]]}
            onCerrar={() => setFacturaPagoId(null)}
            onPagado={() => setFacturaPagoId(null)}
          />
        );
      })()}

      {facturaVerPagosId !== null && (() => {
        const factura = facturas?.find((f) => f.id === facturaVerPagosId);
        if (!factura) return null;
        return (
          <ModalHistorialPagos
            endpointBase={`/facturas/${factura.id}`}
            documento={`factura ${factura.secuencial}`}
            queryKeysAInvalidar={[["facturas"], ["reporte-cuentas-por-cobrar"]]}
            onCerrar={() => setFacturaVerPagosId(null)}
          />
        );
      })()}

      {facturaRetencionId !== null && (() => {
        const factura = facturas?.find((f) => f.id === facturaRetencionId);
        if (!factura) return null;
        return <ModalRegistrarRetencionRecibida factura={factura} onCerrar={() => setFacturaRetencionId(null)} />;
      })()}

      {facturaGuiaRemisionId !== null && (
        <ModalGenerarGuiaRemision facturaId={facturaGuiaRemisionId} onCerrar={() => setFacturaGuiaRemisionId(null)} />
      )}
    </div>
  );
}
