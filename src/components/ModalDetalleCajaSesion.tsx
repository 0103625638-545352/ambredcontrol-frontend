import { useQuery } from "@tanstack/react-query";
import { api, type CajaSesion } from "../api/client";
import { Modal } from "./Modal";

interface Props {
  cajaSesionId: number;
  onCerrar: () => void;
}

function colorDiferencia(diferencia: string | null): string {
  if (diferencia === null) return "text-gray-700 dark:text-gray-300";
  const valor = parseFloat(diferencia);
  if (Math.abs(valor) <= 0.005) return "text-emerald-600 dark:text-emerald-400";
  return valor > 0 ? "text-sky-600 dark:text-sky-400" : "text-red-600 dark:text-red-400";
}

export function ModalDetalleCajaSesion({ cajaSesionId, onCerrar }: Props) {
  const { data: sesion, isLoading } = useQuery({
    queryKey: ["caja", "detalle", cajaSesionId],
    queryFn: async () => (await api.get<CajaSesion>(`/caja/${cajaSesionId}`)).data,
  });

  return (
    <Modal titulo="Detalle de sesión de caja" onCerrar={onCerrar} ancho="max-w-lg">
      {isLoading || !sesion ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>
      ) : (
        <div className="space-y-4">
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-stone-100 dark:border-gray-700">
                <td className="py-1.5 text-gray-500 dark:text-gray-400">Sucursal</td>
                <td className="py-1.5 text-right font-medium text-gray-800 dark:text-gray-100">{sesion.sucursal.nombre}</td>
              </tr>
              <tr className="border-b border-stone-100 dark:border-gray-700">
                <td className="py-1.5 text-gray-500 dark:text-gray-400">Abierta por</td>
                <td className="py-1.5 text-right text-gray-800 dark:text-gray-100">
                  {sesion.abiertaPor.nombre} — {new Date(sesion.abiertaEn).toLocaleString("es-EC")}
                </td>
              </tr>
              <tr className="border-b border-stone-100 dark:border-gray-700">
                <td className="py-1.5 text-gray-500 dark:text-gray-400">Monto inicial</td>
                <td className="py-1.5 text-right text-gray-800 dark:text-gray-100">${sesion.montoInicial}</td>
              </tr>
              {sesion.estado === "CERRADA" ? (
                <>
                  <tr className="border-b border-stone-100 dark:border-gray-700">
                    <td className="py-1.5 text-gray-500 dark:text-gray-400">Cerrada por</td>
                    <td className="py-1.5 text-right text-gray-800 dark:text-gray-100">
                      {sesion.cerradaPor?.nombre} — {sesion.cerradaEn && new Date(sesion.cerradaEn).toLocaleString("es-EC")}
                    </td>
                  </tr>
                  <tr className="border-b border-stone-100 dark:border-gray-700">
                    <td className="py-1.5 text-gray-500 dark:text-gray-400">Esperado</td>
                    <td className="py-1.5 text-right text-gray-800 dark:text-gray-100">${sesion.montoEsperado}</td>
                  </tr>
                  <tr className="border-b border-stone-100 dark:border-gray-700">
                    <td className="py-1.5 text-gray-500 dark:text-gray-400">Contado</td>
                    <td className="py-1.5 text-right text-gray-800 dark:text-gray-100">${sesion.montoContado}</td>
                  </tr>
                  <tr className="border-b border-stone-100 dark:border-gray-700">
                    <td className="py-1.5 text-gray-700 dark:text-gray-200 font-semibold">Diferencia</td>
                    <td className={`py-1.5 text-right font-bold ${colorDiferencia(sesion.diferencia)}`}>${sesion.diferencia}</td>
                  </tr>
                  {sesion.observacionesCierre && (
                    <tr>
                      <td className="py-1.5 text-gray-500 dark:text-gray-400">Observaciones</td>
                      <td className="py-1.5 text-right text-gray-800 dark:text-gray-100">{sesion.observacionesCierre}</td>
                    </tr>
                  )}
                </>
              ) : (
                <tr>
                  <td className="py-1.5 text-gray-500 dark:text-gray-400">Estado</td>
                  <td className="py-1.5 text-right text-emerald-600 dark:text-emerald-400 font-medium">Abierta</td>
                </tr>
              )}
            </tbody>
          </table>

          <div>
            <h4 className="font-mono text-[11px] uppercase tracking-[0.15em] text-gray-600 dark:text-gray-300 mb-2">Movimientos manuales</h4>
            {sesion.movimientos?.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-gray-500">Sin movimientos manuales</p>
            )}
            {sesion.movimientos && sesion.movimientos.length > 0 && (
              <table className="w-full text-sm">
                <thead className="text-left text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="py-1 font-normal">Tipo</th>
                    <th className="py-1 font-normal text-right">Monto</th>
                    <th className="py-1 font-normal">Motivo</th>
                    <th className="py-1 font-normal">Usuario</th>
                  </tr>
                </thead>
                <tbody>
                  {sesion.movimientos.map((m) => (
                    <tr key={m.id} className="border-t border-stone-100 dark:border-gray-700">
                      <td className={`py-1 ${m.tipo === "INGRESO" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                        {m.tipo === "INGRESO" ? "Ingreso" : "Egreso"}
                      </td>
                      <td className="py-1 text-right">${m.monto}</td>
                      <td className="py-1 text-gray-500 dark:text-gray-400">{m.motivo}</td>
                      <td className="py-1 text-gray-500 dark:text-gray-400">{m.usuario.nombre}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
