import { useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api, abrirPdfEnNuevaPestana, type Factura, type RespuestaPaginada } from "../api/client";
import { usePermiso } from "../context/AuthContext";
import { Paginacion } from "../components/Paginacion";
import { EstadoBadge } from "../components/EstadoBadge";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmProvider";
import { ModalRegistrarPago } from "../components/ModalRegistrarPago";
import { ModalHistorialPagos } from "../components/ModalHistorialPagos";
import { ModalRegistrarRetencionRecibida } from "../components/ModalRegistrarRetencionRecibida";
import { ModalGenerarGuiaRemision } from "../components/ModalGenerarGuiaRemision";

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

  const { data: respuesta, isLoading } = useQuery({
    queryKey: ["facturas", pagina],
    queryFn: async () =>
      (await api.get<RespuestaPaginada<Factura>>("/facturas", { params: { page: pagina, pageSize: TAMANO_PAGINA } })).data,
    placeholderData: keepPreviousData,
  });
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
    <div>
      <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Facturas emitidas</h2>

      <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
            <tr>
              <th className="px-4 py-2">No.</th>
              <th className="px-4 py-2">Cliente</th>
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2 text-right">Total</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2">Pago</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">Cargando...</td>
              </tr>
            )}
            {facturas?.map((f) => {
              const saldo = (parseFloat(f.total) - parseFloat(f.montoPagado)).toFixed(2);
              return (
              <tr key={f.id} className="border-t border-gray-100 dark:border-gray-700">
                <td className="px-4 py-2 font-mono text-xs">{f.secuencial}</td>
                <td className="px-4 py-2">{f.cliente.razonSocial}</td>
                <td className="px-4 py-2">{new Date(f.fechaEmision).toLocaleDateString("es-EC")}</td>
                <td className="px-4 py-2 text-right">${f.total}</td>
                <td className="px-4 py-2">
                  <EstadoBadge estado={f.estado} />
                </td>
                <td className="px-4 py-2">
                  {f.estado === "ANULADA" ? (
                    <span className="text-gray-300 dark:text-gray-600">—</span>
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      <EstadoBadge estado={f.estadoPago} />
                      {f.estadoPago !== "PAGADA" && (
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">Saldo: ${saldo}</span>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2 text-right space-x-3">
                  <button
                    onClick={() => setFacturaVerPagosId(f.id)}
                    className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium"
                  >
                    Ver pagos
                  </button>
                  {f.estado !== "ANULADA" && f.estadoPago !== "PAGADA" && (
                    <button
                      onClick={() => setFacturaPagoId(f.id)}
                      className="text-emerald-700 dark:text-emerald-400 hover:underline text-xs font-medium"
                    >
                      Registrar pago
                    </button>
                  )}
                  <button
                    onClick={() => abrirPdfEnNuevaPestana(`/facturas/${f.id}/ride`)}
                    className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium"
                  >
                    Ver PDF
                  </button>
                  <button
                    onClick={() => abrirPdfEnNuevaPestana(`/facturas/${f.id}/recibo-termico`)}
                    className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium"
                  >
                    Recibo 80mm
                  </button>
                  {/* Respaldo manual: normalmente ya no hace falta porque toda
                      factura nueva se envía sola al SRI al crearse. */}
                  {f.estado === "CREADA" && puedeEnviarSri && (
                    <button
                      onClick={() => enviarSri.mutate(f.id)}
                      disabled={enviarSri.isPending}
                      className="text-emerald-700 dark:text-emerald-400 hover:underline text-xs font-medium disabled:opacity-40"
                    >
                      {enviarSri.isPending ? "Enviando..." : "Enviar al SRI"}
                    </button>
                  )}
                  {/* Solo mostramos el botón de anular si tiene sentido: una factura
                      ya anulada o autorizada no puede anularse de nuevo desde aquí */}
                  {f.estado === "CREADA" && puedeAnular && (
                    <button
                      onClick={() => confirmarAnulacion(f)}
                      className="text-red-600 dark:text-red-400 hover:underline text-xs font-medium"
                    >
                      Anular
                    </button>
                  )}
                  {/* Una factura ya AUTORIZADA por el SRI no se puede anular
                      directamente (regla del SRI) — la única forma de corregirla
                      o dejarla sin efecto es con una nota de crédito. */}
                  {f.estado === "AUTORIZADA" && puedeNotasCredito && (
                    <button
                      onClick={() => onIrANotaCredito(f.id)}
                      className="text-red-600 dark:text-red-400 hover:underline text-xs font-medium"
                    >
                      Anular (nota de crédito)
                    </button>
                  )}
                  {/* Un cliente agente de retención puede retenernos IVA/Renta
                      al pagar — esto solo registra lo que ya nos entregó, no
                      genera ni envía nada (eso lo hace el cliente, del otro lado). */}
                  {f.estado === "AUTORIZADA" && !f.retencionRecibida && puedeRetenciones && (
                    <button
                      onClick={() => setFacturaRetencionId(f.id)}
                      className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium"
                    >
                      Registrar retención recibida
                    </button>
                  )}
                  {f.retencionRecibida && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Retención recibida: ${f.retencionRecibida.total}
                    </span>
                  )}
                  {/* Documento de transporte que acompaña la mercadería ya
                      vendida — se puede generar más de una guía por factura
                      (envío repartido en varios viajes/camiones), por eso el
                      botón sigue visible aunque ya se haya generado una. */}
                  {f.estado === "AUTORIZADA" && puedeGuiasRemision && (
                    <button
                      onClick={() => setFacturaGuiaRemisionId(f.id)}
                      className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium"
                    >
                      Generar guía de remisión
                    </button>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
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
