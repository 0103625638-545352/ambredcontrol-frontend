import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type TipoPrecio } from "../api/client";
import { useConfirm } from "../components/ConfirmProvider";
import { useToast } from "../components/ToastProvider";

// Catálogo de categorías de precio de venta (ej. "Mayorista", "Minorista A")
// — cada Cliente se asigna a una, y el precio de cada producto para esa
// categoría se calcula al vuelo como costoPromedioActual × (1 +
// porcentajeGanancia/100), nunca se guarda ni se edita a mano (ver
// utils/precios.ts en el backend). Mirror de CategoriasPage.tsx, con la
// columna extra de porcentaje. Solo ADMIN puede crear/editar/desactivar —
// esto fija el precio de venta real de todo el catálogo.
export function TiposPrecioPage() {
  const queryClient = useQueryClient();
  const confirmar = useConfirm();
  const { mostrarToast } = useToast();
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [porcentajeNuevo, setPorcentajeNuevo] = useState("");
  const [tipoPrecioEditandoId, setTipoPrecioEditandoId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ nombre: "", porcentajeGanancia: "" });

  const { data: tiposPrecio, isLoading } = useQuery({
    queryKey: ["tipos-precio"],
    queryFn: async () => (await api.get<TipoPrecio[]>("/tipos-precio")).data,
  });

  const crearTipoPrecio = useMutation({
    mutationFn: async () => api.post("/tipos-precio", { nombre: nombreNuevo, porcentajeGanancia: parseFloat(porcentajeNuevo) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tipos-precio"] });
      setNombreNuevo("");
      setPorcentajeNuevo("");
    },
    onError: (error: any) => {
      mostrarToast(error.response?.data?.error ?? "Error al crear la categoría de precio");
    },
  });

  const editarTipoPrecio = useMutation({
    mutationFn: async (id: number) =>
      api.put(`/tipos-precio/${id}`, { nombre: editForm.nombre, porcentajeGanancia: parseFloat(editForm.porcentajeGanancia) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tipos-precio"] });
      queryClient.invalidateQueries({ queryKey: ["clientes"] }); // el nombre puede aparecer en la tabla de clientes
      setTipoPrecioEditandoId(null);
    },
    onError: (error: any) => {
      mostrarToast(error.response?.data?.error ?? "Error al editar la categoría de precio");
    },
  });

  const desactivarTipoPrecio = useMutation({
    mutationFn: async (id: number) => api.delete(`/tipos-precio/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tipos-precio"] });
    },
    onError: (error: any) => {
      mostrarToast(error.response?.data?.error ?? "Error al desactivar la categoría de precio");
    },
  });

  function abrirEdicion(tp: TipoPrecio) {
    setEditForm({ nombre: tp.nombre, porcentajeGanancia: tp.porcentajeGanancia });
    setTipoPrecioEditandoId(tipoPrecioEditandoId === tp.id ? null : tp.id);
  }

  async function confirmarDesactivar(tp: TipoPrecio) {
    const ok = await confirmar(`¿Desactivar "${tp.nombre}"? Los clientes que ya la tienen asignada la conservan.`);
    if (ok) desactivarTipoPrecio.mutate(tp.id);
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Precios de Venta</h2>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (nombreNuevo.trim() && porcentajeNuevo !== "") crearTipoPrecio.mutate();
        }}
        className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm mb-4 flex gap-3 max-w-2xl"
      >
        <input
          placeholder="Nombre de la Categoria de Precio de Venta"
          required
          value={nombreNuevo}
          onChange={(e) => setNombreNuevo(e.target.value)}
          className="flex-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
        />
        <input
          type="number"
          step="0.01"
          min="0"
          placeholder="Porcentaje de Ganancia de Precio de Venta"
          required
          value={porcentajeNuevo}
          onChange={(e) => setPorcentajeNuevo(e.target.value)}
          className="flex-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={crearTipoPrecio.isPending}
          className="bg-brand-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-brand-700 disabled:opacity-50 whitespace-nowrap"
        >
          {crearTipoPrecio.isPending ? "Guardando..." : "+ Agregar"}
        </button>
      </form>

      <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden max-w-2xl">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
            <tr>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2">Porcentaje de Ganancia</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={3} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">Cargando...</td>
              </tr>
            )}
            {!isLoading && tiposPrecio?.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">Todavía no hay categorías de precio</td>
              </tr>
            )}
            {tiposPrecio?.map((tp) => (
              <tr key={tp.id} className="border-t border-gray-100 dark:border-gray-700">
                {tipoPrecioEditandoId === tp.id ? (
                  <td colSpan={3} className="px-4 py-2">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        editarTipoPrecio.mutate(tp.id);
                      }}
                      className="flex gap-2"
                    >
                      <input
                        autoFocus
                        required
                        value={editForm.nombre}
                        onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })}
                        className="flex-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1 text-sm"
                      />
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        value={editForm.porcentajeGanancia}
                        onChange={(e) => setEditForm({ ...editForm, porcentajeGanancia: e.target.value })}
                        className="w-28 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1 text-sm"
                      />
                      <button
                        type="submit"
                        disabled={editarTipoPrecio.isPending}
                        className="bg-slate-800 text-white px-3 py-1 rounded-md text-xs font-medium hover:bg-slate-700 disabled:opacity-50"
                      >
                        Guardar
                      </button>
                      <button
                        type="button"
                        onClick={() => setTipoPrecioEditandoId(null)}
                        className="bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 px-3 py-1 rounded-md text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-500"
                      >
                        Cancelar
                      </button>
                    </form>
                  </td>
                ) : (
                  <>
                    <td className="px-4 py-2 font-semibold text-gray-800 dark:text-gray-100">{tp.nombre}</td>
                    <td className="px-4 py-2">{tp.porcentajeGanancia}%</td>
                    <td className="px-4 py-2 text-right space-x-3">
                      <button
                        onClick={() => abrirEdicion(tp)}
                        className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => confirmarDesactivar(tp)}
                        className="text-red-600 dark:text-red-400 hover:underline text-xs font-medium"
                      >
                        Desactivar
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
