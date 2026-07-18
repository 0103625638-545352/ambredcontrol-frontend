import { useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api, abrirPdfEnNuevaPestana, type Compra, type CompraConDetalle, type DevolucionCompra, type RespuestaPaginada } from "../api/client";
import { Paginacion } from "../components/Paginacion";

const TAMANO_PAGINA = 20;

export function DevolucionesCompraPage() {
  const queryClient = useQueryClient();
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [compraSeleccionadaId, setCompraSeleccionadaId] = useState<number | "">("");
  const [motivo, setMotivo] = useState("");
  // Cantidades a devolver por producto: { [productoId]: cantidad }
  const [cantidades, setCantidades] = useState<Record<number, number>>({});
  const [pagina, setPagina] = useState(1);

  const { data: respuesta, isLoading } = useQuery({
    queryKey: ["devoluciones-compra", pagina],
    queryFn: async () =>
      (await api.get<RespuestaPaginada<DevolucionCompra>>("/devoluciones-compra", { params: { page: pagina, pageSize: TAMANO_PAGINA } })).data,
    placeholderData: keepPreviousData,
  });
  const devoluciones = respuesta?.datos;

  // Solo mostramos compras NO anuladas — devolver mercadería de una compra ya
  // anulada no tiene sentido (ese stock ya se le quitó de vuelta al registro).
  // OJO: esta consulta NO manda "page", a propósito — necesita la lista
  // COMPLETA de compras para poder filtrar y ofrecerlas todas en el <select>.
  const { data: compras } = useQuery({
    queryKey: ["compras"],
    queryFn: async () => (await api.get<Compra[]>("/compras")).data,
  });
  const comprasDisponibles = compras?.filter((c) => c.estado !== "ANULADA") ?? [];

  const { data: compraDetalle } = useQuery({
    queryKey: ["compra-detalle", compraSeleccionadaId],
    queryFn: async () => (await api.get<CompraConDetalle>(`/compras/${compraSeleccionadaId}`)).data,
    enabled: compraSeleccionadaId !== "",
  });

  // Cuánto queda disponible para devolver de una línea: lo comprado menos lo
  // ya devuelto en devoluciones anteriores sobre esa misma línea.
  function disponibleParaDevolver(d: NonNullable<typeof compraDetalle>["detalles"][number]): number {
    const yaDevuelto = d.devolucionesDetalle?.reduce((acc, x) => acc + x.cantidad, 0) ?? 0;
    return d.cantidad - yaDevuelto;
  }

  const crearDevolucion = useMutation({
    mutationFn: async () => {
      const items = Object.entries(cantidades)
        .filter(([, cantidad]) => cantidad > 0)
        .map(([productoId, cantidad]) => ({ productoId: Number(productoId), cantidad }));

      return api.post("/devoluciones-compra", { compraId: compraSeleccionadaId, motivo, items });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devoluciones-compra"] });
      queryClient.invalidateQueries({ queryKey: ["productos"] }); // el stock cambió
      queryClient.invalidateQueries({ queryKey: ["compra-detalle"] }); // lo ya devuelto cambió
      setMostrarFormulario(false);
      setCompraSeleccionadaId("");
      setMotivo("");
      setCantidades({});
    },
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Devoluciones a Proveedor</h2>
        <button
          onClick={() => setMostrarFormulario(!mostrarFormulario)}
          className="bg-slate-800 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-slate-700"
        >
          {mostrarFormulario ? "Cancelar" : "+ Nueva devolución"}
        </button>
      </div>

      {mostrarFormulario && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            crearDevolucion.mutate();
          }}
          className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm mb-4 space-y-3"
        >
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Compra a corregir</label>
            <select
              required
              value={compraSeleccionadaId}
              onChange={(e) => {
                setCompraSeleccionadaId(e.target.value ? Number(e.target.value) : "");
                setCantidades({});
              }}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm w-full"
            >
              <option value="">Selecciona una compra...</option>
              {comprasDisponibles.map((c) => (
                <option key={c.id} value={c.id}>
                  Fact. {c.numeroFactura} — {c.proveedor.razonSocial} — ${c.total}
                </option>
              ))}
            </select>
            {comprasDisponibles.length === 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">No hay compras registradas todavía.</p>
            )}
          </div>

          {compraDetalle && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-md p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Indica cuánto se devuelve de cada producto (déjalo en 0 si no se devuelve):
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setCantidades(
                      Object.fromEntries(compraDetalle.detalles.map((d) => [d.productoId, disponibleParaDevolver(d)]))
                    )
                  }
                  className="text-red-600 dark:text-red-400 hover:underline text-xs font-medium shrink-0"
                >
                  Devolver todo lo disponible
                </button>
              </div>
              {compraDetalle.detalles.map((d) => {
                const disponible = disponibleParaDevolver(d);
                return (
                  <div key={d.id} className="flex items-center justify-between gap-2 py-1 text-sm">
                    <span className="text-gray-700 dark:text-gray-300">
                      {d.producto.nombre} (comprados: {d.cantidad}, disponibles para devolver: {disponible})
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={disponible}
                      disabled={disponible <= 0}
                      value={cantidades[d.productoId] ?? 0}
                      onChange={(e) => setCantidades({ ...cantidades, [d.productoId]: Number(e.target.value) })}
                      className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1 text-sm w-20 text-right disabled:opacity-40"
                    />
                  </div>
                );
              })}
            </div>
          )}

          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Motivo</label>
            <input
              type="text"
              required
              placeholder="Ej: Mercadería defectuosa"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm w-full"
            />
          </div>

          <button
            type="submit"
            disabled={crearDevolucion.isPending}
            className="bg-emerald-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            {crearDevolucion.isPending ? "Guardando..." : "Registrar devolución"}
          </button>
          {crearDevolucion.isError && (
            <p className="text-red-600 dark:text-red-400 text-sm">
              {(crearDevolucion.error as any)?.response?.data?.error ?? "Error al registrar la devolución"}
            </p>
          )}
        </form>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
            <tr>
              <th className="px-4 py-2">No.</th>
              <th className="px-4 py-2">Compra corregida</th>
              <th className="px-4 py-2">Proveedor</th>
              <th className="px-4 py-2">Motivo</th>
              <th className="px-4 py-2 text-right">Total</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">Cargando...</td>
              </tr>
            )}
            {devoluciones?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">
                  No hay devoluciones registradas
                </td>
              </tr>
            )}
            {devoluciones?.map((d) => (
              <tr key={d.id} className="border-t border-gray-100 dark:border-gray-700">
                <td className="px-4 py-2 font-mono text-xs">{d.secuencial}</td>
                <td className="px-4 py-2 font-mono text-xs">{d.compra.numeroFactura}</td>
                <td className="px-4 py-2">{d.compra.proveedor.razonSocial}</td>
                <td className="px-4 py-2">{d.motivo}</td>
                <td className="px-4 py-2 text-right">${d.total}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => abrirPdfEnNuevaPestana(`/devoluciones-compra/${d.id}/recibo`)}
                    className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium"
                  >
                    Ver PDF
                  </button>
                </td>
              </tr>
            ))}
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
    </div>
  );
}
