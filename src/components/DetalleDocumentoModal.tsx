import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { Modal } from "./Modal";

export interface CampoDocumento<T> {
  etiqueta: string;
  obtenerValor: (doc: T) => ReactNode;
}

export interface ColumnaLinea<L> {
  etiqueta: string;
  obtenerValor: (linea: L) => ReactNode;
}

interface Props<T> {
  endpoint: string; // ej. "/facturas" — se pide GET `${endpoint}/${id}`
  id: number;
  titulo: (doc: T) => string;
  campos: CampoDocumento<T>[];
  obtenerLineas: (doc: T) => unknown[];
  columnasLinea: ColumnaLinea<any>[];
  onCerrar: () => void;
}

// Detalle genérico de un documento con líneas (Facturas, Notas de Venta,
// Compras, Notas de Crédito, Traslados) — pide GET /:id recién al hacer clic
// en la fila, no se precarga en el listado (esas rutas evitan a propósito
// traer "detalles" en la tabla para no volverla lenta sobre meses de historial).
export function DetalleDocumentoModal<T>({ endpoint, id, titulo, campos, obtenerLineas, columnasLinea, onCerrar }: Props<T>) {
  const { data: doc, isLoading } = useQuery({
    queryKey: [endpoint, id],
    queryFn: async () => (await api.get<T>(`${endpoint}/${id}`)).data,
  });

  return (
    <Modal titulo={doc ? titulo(doc) : "Cargando..."} onCerrar={onCerrar} ancho="max-w-2xl">
      {isLoading && <p className="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>}
      {doc && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            {campos.map((c) => (
              <div key={c.etiqueta}>
                <p className="text-xs text-gray-500 dark:text-gray-400">{c.etiqueta}</p>
                <p className="text-gray-800 dark:text-gray-100">{c.obtenerValor(doc)}</p>
              </div>
            ))}
          </div>

          {obtenerLineas(doc).length > 0 && (
            <div className="border-t border-stone-100 dark:border-gray-700 pt-3">
              <table className="w-full text-sm">
                <thead className="text-left text-gray-500 dark:text-gray-400">
                  <tr>
                    {columnasLinea.map((c) => (
                      <th key={c.etiqueta} className="py-1 pr-3">{c.etiqueta}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {obtenerLineas(doc).map((linea, i) => (
                    <tr key={i} className="border-t border-gray-50 dark:border-gray-800">
                      {columnasLinea.map((c) => (
                        <td key={c.etiqueta} className="py-1 pr-3 text-gray-700 dark:text-gray-300">
                          {c.obtenerValor(linea)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
