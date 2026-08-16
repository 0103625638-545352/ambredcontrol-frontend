import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { api, type HistorialProductoItem } from "../api/client";
import { Modal } from "./Modal";
import { EstadoBadge } from "./EstadoBadge";

interface Props {
  productoId: number;
  nombreProducto: string;
  onCerrar: () => void;
}

const etiquetasTipo: Record<HistorialProductoItem["tipo"], string> = {
  COMPRA: "Compra",
  VENTA_FACTURA: "Factura",
  VENTA_NOTA_VENTA: "Nota de venta",
  DEVOLUCION: "Devolución (N. Crédito)",
};

// Historial combinado de un producto: de dónde vino el stock (compras) y a
// dónde se fue (facturas, notas de venta, devoluciones) — con documento y
// contraparte, no solo el texto libre de MovimientoInventario.
export function HistorialProductoModal({ productoId, nombreProducto, onCerrar }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["historial-producto", productoId],
    queryFn: async () => (await api.get<HistorialProductoItem[]>(`/productos/${productoId}/historial`)).data,
  });

  function exportarExcel() {
    if (!data || data.length === 0) return;
    const hoja = XLSX.utils.json_to_sheet(
      data.map((item) => ({
        Fecha: new Date(item.fecha).toLocaleDateString("es-EC"),
        Tipo: etiquetasTipo[item.tipo],
        Documento: item.documento,
        "Cliente / Proveedor": item.contraparte,
        Cantidad: item.cantidad,
        "Precio unitario": item.precioUnitario,
        Estado: item.estado,
      }))
    );
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Historial");
    XLSX.writeFile(libro, `historial-${nombreProducto}.xlsx`);
  }

  return (
    <Modal
      titulo={`Historial de "${nombreProducto}"`}
      onCerrar={onCerrar}
      ancho="max-w-3xl"
      accionExtra={
        data &&
        data.length > 0 && (
          <button
            onClick={exportarExcel}
            className="bg-brand-600 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-brand-700"
          >
            Exportar a Excel
          </button>
        )
      }
    >
      {isLoading && <p className="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>}
      {!isLoading && data?.length === 0 && (
        <p className="text-sm text-gray-400 dark:text-gray-500">Este producto todavía no tiene movimientos de compra ni venta.</p>
      )}
      {data && data.length > 0 && (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Documento</th>
              <th className="px-3 py-2">Cliente / Proveedor</th>
              <th className="px-3 py-2 text-right">Cantidad</th>
              <th className="px-3 py-2 text-right">P. Unit.</th>
              <th className="px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item, i) => (
              <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
                <td className="px-3 py-2">{new Date(item.fecha).toLocaleDateString("es-EC")}</td>
                <td className="px-3 py-2">{etiquetasTipo[item.tipo]}</td>
                <td className="px-3 py-2 font-mono text-xs">{item.documento}</td>
                <td className="px-3 py-2">{item.contraparte}</td>
                <td
                  className={`px-3 py-2 text-right font-medium ${
                    item.cantidad >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {item.cantidad >= 0 ? `+${item.cantidad}` : item.cantidad}
                </td>
                <td className="px-3 py-2 text-right">${item.precioUnitario}</td>
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
