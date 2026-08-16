import { useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api, abrirPdfEnNuevaPestana, type NotaVenta, type RespuestaPaginada } from "../api/client";
import { usePermiso } from "../context/AuthContext";
import { Paginacion } from "../components/Paginacion";
import { EstadoBadge } from "../components/EstadoBadge";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmProvider";
import { ModalRegistrarPago } from "../components/ModalRegistrarPago";
import { ModalHistorialPagos } from "../components/ModalHistorialPagos";

const TAMANO_PAGINA = 20;

export function NotasVentaPage() {
  const puedeAnular = usePermiso("facturas_anular");
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const confirmar = useConfirm();
  const [pagina, setPagina] = useState(1);
  const [notaVentaPagoId, setNotaVentaPagoId] = useState<number | null>(null);
  const [notaVentaVerPagosId, setNotaVentaVerPagosId] = useState<number | null>(null);

  const { data: respuesta, isLoading } = useQuery({
    queryKey: ["notas-venta", pagina],
    queryFn: async () =>
      (await api.get<RespuestaPaginada<NotaVenta>>("/notas-venta", { params: { page: pagina, pageSize: TAMANO_PAGINA } })).data,
    placeholderData: keepPreviousData,
  });
  const notasVenta = respuesta?.datos;

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
    <div>
      <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Notas de venta</h2>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
        Recibos internos: no pasan por el SRI. Para clientes que no necesitan una factura formal.
      </p>

      <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
            <tr>
              <th className="px-4 py-2">No.</th>
              <th className="px-4 py-2">Cliente</th>
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2 text-right">Total</th>
              <th className="px-4 py-2">IVA</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2">Pago</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={8} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">Cargando...</td>
              </tr>
            )}
            {notasVenta?.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">
                  No hay notas de venta emitidas
                </td>
              </tr>
            )}
            {notasVenta?.map((n) => {
              const saldo = (parseFloat(n.total) - parseFloat(n.montoPagado)).toFixed(2);
              return (
              <tr key={n.id} className="border-t border-gray-100 dark:border-gray-700">
                <td className="px-4 py-2 font-mono text-xs">{n.secuencial}</td>
                <td className="px-4 py-2">{n.cliente.razonSocial}</td>
                <td className="px-4 py-2">{new Date(n.fechaEmision).toLocaleDateString("es-EC")}</td>
                <td className="px-4 py-2 text-right">${n.total}</td>
                <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">{n.aplicaIva ? "Sí" : "No"}</td>
                <td className="px-4 py-2">
                  <EstadoBadge estado={n.estado} />
                </td>
                <td className="px-4 py-2">
                  {n.estado === "ANULADA" ? (
                    <span className="text-gray-300 dark:text-gray-600">—</span>
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      <EstadoBadge estado={n.estadoPago} />
                      {n.estadoPago !== "PAGADA" && (
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">Saldo: ${saldo}</span>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2 text-right space-x-3">
                  <button
                    onClick={() => setNotaVentaVerPagosId(n.id)}
                    className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium"
                  >
                    Ver pagos
                  </button>
                  {n.estado !== "ANULADA" && n.estadoPago !== "PAGADA" && (
                    <button
                      onClick={() => setNotaVentaPagoId(n.id)}
                      className="text-emerald-700 dark:text-emerald-400 hover:underline text-xs font-medium"
                    >
                      Registrar pago
                    </button>
                  )}
                  <button
                    onClick={() => abrirPdfEnNuevaPestana(`/notas-venta/${n.id}/recibo`)}
                    className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium"
                  >
                    Ver PDF
                  </button>
                  <button
                    onClick={() => abrirPdfEnNuevaPestana(`/notas-venta/${n.id}/recibo-termico`)}
                    className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium"
                  >
                    Recibo 80mm
                  </button>
                  {n.estado === "CREADA" && puedeAnular && (
                    <button
                      onClick={() => confirmarAnulacion(n)}
                      className="text-red-600 dark:text-red-400 hover:underline text-xs font-medium"
                    >
                      Anular
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
