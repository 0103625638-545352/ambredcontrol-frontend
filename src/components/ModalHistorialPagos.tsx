import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { api, type Pago, urlComprobantePago, origenPagoTexto } from "../api/client";
import { Modal } from "./Modal";
import { useConfirm } from "./ConfirmProvider";
import { useToast } from "./ToastProvider";

interface RegistroConPagos {
  total: string;
  montoPagado: string;
  pagos: Pago[];
}

interface Props {
  // La misma vista sirve para Factura y Compra: ambas exponen {total,
  // montoPagado, pagos} en su GET /:id, y ambas tienen DELETE /:id/pagos/:pagoId.
  endpointBase: string; // ej. `/facturas/10` o `/compras/3`
  documento: string;
  queryKeysAInvalidar: string[][];
  onCerrar: () => void;
}

export function ModalHistorialPagos({ endpointBase, documento, queryKeysAInvalidar, onCerrar }: Props) {
  const queryClient = useQueryClient();
  const confirmar = useConfirm();
  const { mostrarToast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["historial-pagos", endpointBase],
    queryFn: async () => (await api.get<RegistroConPagos>(endpointBase)).data,
  });

  const eliminarPago = useMutation({
    mutationFn: async (pagoId: number) => api.delete(`${endpointBase}/pagos/${pagoId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["historial-pagos", endpointBase] });
      for (const queryKey of queryKeysAInvalidar) queryClient.invalidateQueries({ queryKey });
      mostrarToast("Pago eliminado, el saldo pendiente se actualizó", "success");
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al eliminar el pago"),
  });

  async function confirmarEliminar(p: Pago) {
    const ok = await confirmar(
      `¿Eliminar este pago de $${p.monto} (${p.formaPago})? El saldo pendiente volverá a subir en esa misma cantidad.`
    );
    if (ok) eliminarPago.mutate(p.id);
  }

  const saldo = data ? (parseFloat(data.total) - parseFloat(data.montoPagado)).toFixed(2) : "0.00";

  // Exporta el historial de pagos a un .xlsx — para cuando el cliente pide
  // un respaldo del abono que hizo, o para llevarlo a contabilidad. Mismo
  // patrón que exportarExcel() en ReportesPage.tsx (json_to_sheet + writeFile,
  // todo en el navegador, sin pasar por el backend).
  function exportarExcel() {
    if (!data || data.pagos.length === 0) return;
    const libro = XLSX.utils.book_new();
    const hoja = XLSX.utils.json_to_sheet(
      data.pagos.map((p) => ({
        Fecha: new Date(p.fecha).toLocaleString("es-EC"),
        Monto: Number(p.monto),
        "Forma de pago": p.formaPago,
        "Cuenta bancaria": p.cuentaBancaria ? `${p.cuentaBancaria.banco} — ${p.cuentaBancaria.numeroCuenta}` : "",
        Cuota: p.cuota ? `Cuota ${p.cuota.numero}` : "",
        "Origen del pago": origenPagoTexto(p) ?? "",
        Referencia: p.referencia ?? "",
      }))
    );
    XLSX.utils.book_append_sheet(libro, hoja, "Pagos");
    const nombreArchivo = `pagos_${documento.replace(/\s+/g, "_")}.xlsx`;
    XLSX.writeFile(libro, nombreArchivo);
  }

  return (
    <Modal
      titulo={`Pagos registrados — ${documento}`}
      onCerrar={onCerrar}
      ancho="max-w-2xl"
      accionExtra={
        data && data.pagos.length > 0 ? (
          <button
            onClick={exportarExcel}
            className="bg-brand-600 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-brand-700"
          >
            Exportar Excel
          </button>
        ) : undefined
      }
    >
      {isLoading && <p className="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>}
      {data && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4 text-sm bg-gray-50 dark:bg-gray-900/40 rounded-md p-3">
            <div>
              <p className="text-gray-500 dark:text-gray-400">Total</p>
              <p className="font-semibold text-gray-800 dark:text-gray-100">${data.total}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Pagado</p>
              <p className="font-semibold text-emerald-600 dark:text-emerald-400">${data.montoPagado}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Saldo pendiente</p>
              <p className="font-semibold text-red-600 dark:text-red-400">${saldo}</p>
            </div>
          </div>

          {data.pagos.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">Todavía no se ha registrado ningún abono.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
                <tr>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2 text-right">Monto</th>
                  <th className="px-3 py-2">Forma de pago</th>
                  <th className="px-3 py-2">Cuota</th>
                  <th className="px-3 py-2">Referencia</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.pagos.map((p) => (
                  <tr key={p.id} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="px-3 py-2">{new Date(p.fecha).toLocaleString("es-EC")}</td>
                    <td className="px-3 py-2 text-right font-medium">${p.monto}</td>
                    <td className="px-3 py-2">
                      {p.formaPago}
                      {p.cuentaBancaria && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {p.cuentaBancaria.banco} — {p.cuentaBancaria.numeroCuenta}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                      {p.cuota ? `Cuota ${p.cuota.numero}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-gray-500 dark:text-gray-400">
                      {p.referencia ?? "—"}
                      {origenPagoTexto(p) && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">{origenPagoTexto(p)}</div>
                      )}
                      {urlComprobantePago(p) && (
                        <div>
                          <a
                            href={urlComprobantePago(p)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sky-600 dark:text-sky-400 hover:underline text-xs"
                          >
                            Ver comprobante
                          </a>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => confirmarEliminar(p)}
                        className="text-red-600 dark:text-red-400 hover:underline text-xs font-medium"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </Modal>
  );
}
