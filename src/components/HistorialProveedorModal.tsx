import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { api, type HistorialProveedorItem } from "../api/client";
import { Modal } from "./Modal";
import { EstadoBadge } from "./EstadoBadge";

interface Props {
  proveedorId: number;
  nombreProveedor: string;
  onCerrar: () => void;
}

// Qué productos se le han comprado a este proveedor, cuánto y bajo qué
// número de factura — el reverso de HistorialClienteModal.
export function HistorialProveedorModal({ proveedorId, nombreProveedor, onCerrar }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["historial-proveedor", proveedorId],
    queryFn: async () => (await api.get<HistorialProveedorItem[]>(`/proveedores/${proveedorId}/historial`)).data,
  });

  function exportarExcel() {
    if (!data || data.length === 0) return;
    const hoja = XLSX.utils.json_to_sheet(
      data.map((item) => ({
        Fecha: new Date(item.fecha).toLocaleDateString("es-EC"),
        "Fact. proveedor": item.documento,
        Producto: item.producto,
        Cantidad: item.cantidad,
        "Costo unitario": item.costoUnitario,
        Estado: item.estado,
      }))
    );
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Historial");
    XLSX.writeFile(libro, `historial-${nombreProveedor}.xlsx`);
  }

  return (
    <Modal
      titulo={`Historial de compras a "${nombreProveedor}"`}
      onCerrar={onCerrar}
      ancho="max-w-3xl"
      accionExtra={
        data &&
        data.length > 0 && (
          <button
            onClick={exportarExcel}
            className="bg-brand-700 text-white px-3 py-1.5 rounded-md text-xs font-semibold hover:bg-brand-800"
          >
            Exportar a Excel
          </button>
        )
      }
    >
      {isLoading && <p className="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>}
      {!isLoading && data?.length === 0 && (
        <p className="text-sm text-gray-400 dark:text-gray-500">Todavía no se ha registrado ninguna compra a este proveedor.</p>
      )}
      {data && data.length > 0 && (
        <table className="w-full text-sm">
          <thead className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700 text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 [&_th]:font-medium">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Fact. proveedor</th>
              <th className="px-3 py-2">Producto</th>
              <th className="px-3 py-2 text-right">Cantidad</th>
              <th className="px-3 py-2 text-right">Costo unit.</th>
              <th className="px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item, i) => (
              <tr key={i} className="border-t border-stone-100 dark:border-gray-700">
                <td className="px-3 py-2">{new Date(item.fecha).toLocaleDateString("es-EC")}</td>
                <td className="px-3 py-2 font-mono text-xs">{item.documento}</td>
                <td className="px-3 py-2">{item.producto}</td>
                <td className="px-3 py-2 text-right">{item.cantidad}</td>
                <td className="px-3 py-2 text-right">${item.costoUnitario}</td>
                <td className="px-3 py-2">
                  <EstadoBadge estado={item.estado} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
