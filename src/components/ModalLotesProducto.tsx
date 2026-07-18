import { useQuery } from "@tanstack/react-query";
import { api, type LoteProducto } from "../api/client";
import { Modal } from "./Modal";

interface Props {
  productoId: number;
  nombreProducto: string;
  onCerrar: () => void;
}

// Lotes de un producto perecible, del que caduca más pronto al que caduca
// más tarde — el mismo orden en que las ventas los van a consumir (FEFO).
export function ModalLotesProducto({ productoId, nombreProducto, onCerrar }: Props) {
  const { data: lotes, isLoading } = useQuery({
    queryKey: ["lotes-producto", productoId],
    queryFn: async () => (await api.get<LoteProducto[]>(`/productos/${productoId}/lotes`)).data,
  });

  const hoy = new Date();

  return (
    <Modal titulo={`Lotes — ${nombreProducto}`} onCerrar={onCerrar} ancho="max-w-2xl">
      {isLoading && <p className="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>}
      {lotes && lotes.length === 0 && (
        <p className="text-sm text-gray-400 dark:text-gray-500">Todavía no se ha registrado ningún lote.</p>
      )}
      {lotes && lotes.length > 0 && (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
            <tr>
              <th className="px-3 py-2">N° de lote</th>
              <th className="px-3 py-2">Caducidad</th>
              <th className="px-3 py-2 text-right">Cantidad</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {lotes.map((l) => {
              const fecha = new Date(l.fechaCaducidad);
              const vencido = fecha < hoy;
              const diasRestantes = Math.ceil((fecha.getTime() - hoy.getTime()) / (24 * 60 * 60 * 1000));
              return (
                <tr key={l.id} className="border-t border-gray-100 dark:border-gray-700">
                  <td className="px-3 py-2">{l.numeroLote || "—"}</td>
                  <td className="px-3 py-2">{fecha.toLocaleDateString("es-EC")}</td>
                  <td className="px-3 py-2 text-right">{l.cantidad}</td>
                  <td className="px-3 py-2 text-xs">
                    {l.cantidad === 0 ? (
                      <span className="text-gray-400 dark:text-gray-500">Agotado</span>
                    ) : vencido ? (
                      <span className="text-red-600 dark:text-red-400 font-medium">Caducado</span>
                    ) : diasRestantes <= 30 ? (
                      <span className="text-amber-600 dark:text-amber-400 font-medium">Vence en {diasRestantes} días</span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
