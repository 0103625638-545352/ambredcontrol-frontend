import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Categoria } from "../api/client";
import { useConfirm } from "../components/ConfirmProvider";

// Catálogo simple: el modelo Categoria existía desde el inicio (Producto ya
// se puede asignar a una), pero nunca tuvo pantalla propia. Al ser una lista
// corta por naturaleza, no necesita búsqueda ni paginación como Productos/Clientes.
export function CategoriasPage() {
  const queryClient = useQueryClient();
  const confirmar = useConfirm();
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [categoriaEditandoId, setCategoriaEditandoId] = useState<number | null>(null);
  const [nombreEditado, setNombreEditado] = useState("");

  const { data: categorias, isLoading } = useQuery({
    queryKey: ["categorias"],
    queryFn: async () => (await api.get<Categoria[]>("/categorias")).data,
  });

  const crearCategoria = useMutation({
    mutationFn: async () => api.post("/categorias", { nombre: nombreNuevo }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categorias"] });
      setNombreNuevo("");
    },
  });

  const editarCategoria = useMutation({
    mutationFn: async (id: number) => api.put(`/categorias/${id}`, { nombre: nombreEditado }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categorias"] });
      queryClient.invalidateQueries({ queryKey: ["productos"] }); // el nombre puede aparecer en la tabla de productos
      setCategoriaEditandoId(null);
    },
  });

  const desactivarCategoria = useMutation({
    mutationFn: async (id: number) => api.delete(`/categorias/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categorias"] });
    },
  });

  function abrirEdicion(c: Categoria) {
    setNombreEditado(c.nombre);
    setCategoriaEditandoId(categoriaEditandoId === c.id ? null : c.id);
  }

  async function confirmarDesactivar(c: Categoria) {
    const ok = await confirmar(`¿Desactivar la categoría "${c.nombre}"? Los productos que ya la tienen asignada la conservan.`);
    if (ok) desactivarCategoria.mutate(c.id);
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Categorías</h2>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (nombreNuevo.trim()) crearCategoria.mutate();
        }}
        className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm mb-4 flex gap-3 max-w-lg"
      >
        <input
          placeholder="Nombre de la categoría"
          required
          value={nombreNuevo}
          onChange={(e) => setNombreNuevo(e.target.value)}
          className="flex-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={crearCategoria.isPending}
          className="bg-emerald-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
        >
          {crearCategoria.isPending ? "Guardando..." : "+ Agregar"}
        </button>
      </form>
      {crearCategoria.isError && (
        <p className="text-red-600 dark:text-red-400 text-sm mb-4">Error al crear la categoría.</p>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden max-w-lg">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
            <tr>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={2} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">Cargando...</td>
              </tr>
            )}
            {!isLoading && categorias?.length === 0 && (
              <tr>
                <td colSpan={2} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">Todavía no hay categorías</td>
              </tr>
            )}
            {categorias?.map((c) => (
              <tr key={c.id} className="border-t border-gray-100 dark:border-gray-700">
                <td className="px-4 py-2">
                  {categoriaEditandoId === c.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        editarCategoria.mutate(c.id);
                      }}
                      className="flex gap-2"
                    >
                      <input
                        autoFocus
                        required
                        value={nombreEditado}
                        onChange={(e) => setNombreEditado(e.target.value)}
                        className="flex-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1 text-sm"
                      />
                      <button
                        type="submit"
                        disabled={editarCategoria.isPending}
                        className="bg-slate-800 text-white px-3 py-1 rounded-md text-xs font-medium hover:bg-slate-700 disabled:opacity-50"
                      >
                        Guardar
                      </button>
                      <button
                        type="button"
                        onClick={() => setCategoriaEditandoId(null)}
                        className="bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 px-3 py-1 rounded-md text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-500"
                      >
                        Cancelar
                      </button>
                    </form>
                  ) : (
                    c.nombre
                  )}
                </td>
                <td className="px-4 py-2 text-right space-x-3">
                  <button
                    onClick={() => abrirEdicion(c)}
                    className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium"
                  >
                    {categoriaEditandoId === c.id ? "Cancelar" : "Editar"}
                  </button>
                  <button
                    onClick={() => confirmarDesactivar(c)}
                    className="text-red-600 dark:text-red-400 hover:underline text-xs font-medium"
                  >
                    Desactivar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
