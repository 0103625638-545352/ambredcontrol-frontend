import { useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api, type Categoria } from "../api/client";
import { useConfirm } from "../components/ConfirmProvider";
import { useFiltrosListado, BarraBuscadorDocumentos } from "../components/BuscadorDocumentos";
import {
  CLASE_CAMPO,
  CLASE_ETIQUETA,
  CLASE_THEAD,
  CLASE_CAMPO_CELDA,
  CLASE_ACCION,
  CLASE_ACCION_PELIGRO,
  MensajeError,
  Resaltar,
} from "../components/FormatoDocumento";

// Catálogo corto por naturaleza (no pagina), así que el buscador no tiene
// página a la que volver.
function sinPaginacion() {}

// Catálogo simple: el modelo Categoria existía desde el inicio (Producto ya
// se puede asignar a una), pero nunca tuvo pantalla propia. Con el buscador
// compartido de los listados (ver components/BuscadorDocumentos.tsx):
// nombre, fecha de creación y si tiene o no productos asignados.
export function CategoriasPage() {
  const queryClient = useQueryClient();
  const confirmar = useConfirm();
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [categoriaEditandoId, setCategoriaEditandoId] = useState<number | null>(null);
  const [nombreEditado, setNombreEditado] = useState("");

  const filtros = useFiltrosListado(sinPaginacion);

  const { data: categorias, isLoading, isFetching } = useQuery({
    queryKey: ["categorias", ...filtros.clave],
    queryFn: async () => (await api.get<Categoria[]>("/categorias", { params: filtros.params })).data,
    placeholderData: keepPreviousData,
  });
  // Mientras llega el resultado de una búsqueda nueva, la tabla anterior
  // queda visible pero atenuada (en vez de parpadear en blanco).
  const buscando = isFetching && !isLoading;

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

  const totalProductos = categorias?.reduce((acumulado, c) => acumulado + (c._count?.productos ?? 0), 0) ?? 0;

  return (
    <div>
      <div className="bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-stone-300 dark:border-gray-700">
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-50">Categorías</h2>
          <span className="font-mono text-[11px] text-gray-400 dark:text-gray-500">
            {categorias ? `${categorias.length} categoría${categorias.length === 1 ? "" : "s"}` : ""}
          </span>
        </div>

        {/* Línea de ingreso: nueva categoría */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (nombreNuevo.trim()) crearCategoria.mutate();
          }}
          className="flex items-end gap-2 p-3 border-b border-stone-300 dark:border-gray-700"
        >
          <label className="flex flex-col gap-1 flex-1 min-w-0">
            <span className={CLASE_ETIQUETA}>Nueva categoría</span>
            <input
              placeholder="Nombre de la categoría"
              required
              value={nombreNuevo}
              onChange={(e) => setNombreNuevo(e.target.value)}
              className={CLASE_CAMPO}
            />
          </label>
          <button
            type="submit"
            disabled={crearCategoria.isPending}
            className="bg-brand-700 text-white px-4 py-1.5 rounded-sm text-sm font-semibold hover:bg-brand-800 disabled:opacity-50"
          >
            {crearCategoria.isPending ? "Guardando..." : "Agregar ↵"}
          </button>
        </form>
        {crearCategoria.isError && (
          <div className="px-3 pt-2">
            <MensajeError>Error al crear la categoría.</MensajeError>
          </div>
        )}

        <BarraBuscadorDocumentos
          filtros={filtros}
          etiquetaBusqueda="Buscar · nombre de la categoría"
          placeholder="Ej: Cables, Routers..."
          mostrarPago={false}
          extras={
            <label className="flex flex-col gap-1 w-36">
              <span className={CLASE_ETIQUETA}>Productos</span>
              <select
                value={filtros.extra.productos ?? ""}
                onChange={(e) => filtros.setExtra("productos", e.target.value)}
                className={CLASE_CAMPO}
              >
                <option value="">Todas</option>
                <option value="con">Con productos</option>
                <option value="sin">Sin productos</option>
              </select>
            </label>
          }
        />

        <table className="w-full text-sm">
          <thead className={CLASE_THEAD}>
            <tr>
              <th className="px-4 py-2 w-10">#</th>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2 text-right w-28">Productos</th>
              <th className="px-4 py-2 w-28">Creada</th>
              <th className="px-4 py-2 w-40"></th>
            </tr>
          </thead>
          <tbody className={buscando ? "opacity-60 transition-opacity" : "transition-opacity"}>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400 dark:text-gray-500">
                  Cargando...
                </td>
              </tr>
            )}
            {!isLoading && categorias?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">
                  {filtros.hayFiltros ? "Ninguna categoría coincide con la búsqueda." : "Todavía no hay categorías."}
                </td>
              </tr>
            )}
            {categorias?.map((c, indice) => (
              <tr key={c.id} className="border-t border-stone-100 dark:border-gray-700 hover:bg-stone-50 dark:hover:bg-gray-700/30">
                <td className="px-4 py-2 font-mono text-xs text-gray-400">{indice + 1}</td>
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
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setCategoriaEditandoId(null);
                        }}
                        className={`${CLASE_CAMPO_CELDA} flex-1 text-left font-sans`}
                      />
                      <button
                        type="submit"
                        disabled={editarCategoria.isPending}
                        className="bg-brand-700 text-white px-3 py-1 rounded-sm text-xs font-semibold hover:bg-brand-800 disabled:opacity-50"
                      >
                        Guardar
                      </button>
                    </form>
                  ) : (
                    <span className="uppercase text-[13px] text-gray-800 dark:text-gray-100">
                      <Resaltar texto={c.nombre} termino={filtros.busquedaAplicada} />
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">
                  {c._count ? (
                    c._count.productos > 0 ? (
                      c._count.productos
                    ) : (
                      <span className="text-gray-300 dark:text-gray-600">0</span>
                    )
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-2 font-mono text-xs text-gray-500 dark:text-gray-400">
                  {c.createdAt ? new Date(c.createdAt).toLocaleDateString("es-EC") : "—"}
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-3">
                    <button onClick={() => abrirEdicion(c)} className={CLASE_ACCION}>
                      {categoriaEditandoId === c.id ? "Cancelar" : "Editar"}
                    </button>
                    <button onClick={() => confirmarDesactivar(c)} className={CLASE_ACCION_PELIGRO}>
                      Desactivar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {categorias && categorias.length > 0 && (
          <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 px-4 py-2.5 border-t-2 border-gray-900 dark:border-gray-200">
            <span className="font-mono text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {categorias.length} categoría{categorias.length === 1 ? "" : "s"}
              {filtros.hayFiltros ? " · según filtro" : ""}
            </span>
            <span className="text-sm font-bold text-gray-900 dark:text-gray-50">
              PRODUCTOS ASIGNADOS <span className="font-mono tabular-nums ml-2">{totalProductos}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
