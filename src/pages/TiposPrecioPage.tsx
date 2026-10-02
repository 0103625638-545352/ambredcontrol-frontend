import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type TipoPrecio } from "../api/client";
import { useConfirm } from "../components/ConfirmProvider";
import { useToast } from "../components/ToastProvider";
import { useFiltrosListado, BarraBuscadorDocumentos, filtrarLocal, sinPaginacion } from "../components/BuscadorDocumentos";
import {
  CLASE_CAMPO,
  CLASE_ETIQUETA,
  CLASE_THEAD,
  CLASE_CAMPO_CELDA,
  CLASE_ACCION,
  CLASE_ACCION_PELIGRO,
  PanelListado,
  FilaSinResultados,
  Resaltar,
} from "../components/FormatoDocumento";

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

  // Buscador del catálogo (en el navegador: la lista ya viene completa).
  const filtros = useFiltrosListado(sinPaginacion);
  const tiposFiltrados = filtrarLocal(tiposPrecio, filtros, {
    textos: (tp) => [tp.nombre, tp.porcentajeGanancia],
    fecha: (tp) => tp.createdAt,
  });

  return (
    <div>
      <PanelListado
        titulo="Precios de venta"
        conteo={tiposPrecio?.length}
        singular="categoría"
        plural="categorías"
        aviso="Cada categoría define el porcentaje de ganancia sobre el costo promedio. El precio que ve cada cliente depende de la categoría que tenga asignada."
      >
        {/* Línea de ingreso: nueva categoría de precio */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (nombreNuevo.trim() && porcentajeNuevo !== "") crearTipoPrecio.mutate();
          }}
          className="flex flex-wrap items-end gap-2 p-3 border-b border-stone-300 dark:border-gray-700"
        >
          <label className="flex flex-col gap-1 flex-[2_1_220px] min-w-0">
            <span className={CLASE_ETIQUETA}>Nueva categoría de precio</span>
            <input
              placeholder="Ej: Mayorista, Distribuidor..."
              required
              value={nombreNuevo}
              onChange={(e) => setNombreNuevo(e.target.value)}
              className={CLASE_CAMPO}
            />
          </label>
          <label className="flex flex-col gap-1 w-40">
            <span className={CLASE_ETIQUETA}>% de ganancia</span>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              required
              value={porcentajeNuevo}
              onChange={(e) => setPorcentajeNuevo(e.target.value)}
              className={`${CLASE_CAMPO} text-right font-mono`}
            />
          </label>
          <button
            type="submit"
            disabled={crearTipoPrecio.isPending}
            className="bg-brand-700 text-white px-4 py-1.5 rounded-sm text-sm font-semibold hover:bg-brand-800 disabled:opacity-50 whitespace-nowrap"
          >
            {crearTipoPrecio.isPending ? "Guardando..." : "Agregar ↵"}
          </button>
        </form>

        <BarraBuscadorDocumentos
          filtros={filtros}
          etiquetaBusqueda="Buscar · nombre o porcentaje"
          placeholder="Ej: Mayorista, 22..."
          mostrarPago={false}
        />

        <table className="w-full text-sm">
          <thead className={CLASE_THEAD}>
            <tr>
              <th className="px-4 py-2 w-10">#</th>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2 text-right w-36">% de ganancia</th>
              <th className="px-4 py-2 w-40"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400 dark:text-gray-500">
                  Cargando...
                </td>
              </tr>
            )}
            {!isLoading && tiposFiltrados?.length === 0 && (
              <FilaSinResultados columnas={4} hayFiltros={filtros.hayFiltros} vacio="Todavía no hay categorías de precio." />
            )}
            {tiposFiltrados?.map((tp, indice) => (
              <tr key={tp.id} className="border-t border-stone-100 dark:border-gray-700 hover:bg-stone-50 dark:hover:bg-gray-700/30">
                {tipoPrecioEditandoId === tp.id ? (
                  <td colSpan={4} className="px-4 py-2">
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
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setTipoPrecioEditandoId(null);
                        }}
                        className={`${CLASE_CAMPO_CELDA} flex-1 text-left font-sans`}
                      />
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        value={editForm.porcentajeGanancia}
                        onChange={(e) => setEditForm({ ...editForm, porcentajeGanancia: e.target.value })}
                        className={`${CLASE_CAMPO_CELDA} w-28`}
                      />
                      <button
                        type="submit"
                        disabled={editarTipoPrecio.isPending}
                        className="bg-brand-700 text-white px-3 py-1 rounded-sm text-xs font-semibold hover:bg-brand-800 disabled:opacity-50"
                      >
                        Guardar
                      </button>
                      <button type="button" onClick={() => setTipoPrecioEditandoId(null)} className={CLASE_ACCION}>
                        Cancelar
                      </button>
                    </form>
                  </td>
                ) : (
                  <>
                    <td className="px-4 py-2 font-mono text-xs text-gray-400">{indice + 1}</td>
                    <td className="px-4 py-2 uppercase text-[13px] font-semibold text-gray-800 dark:text-gray-100">
                      <Resaltar texto={tp.nombre} termino={filtros.busquedaAplicada} />
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums">{tp.porcentajeGanancia}%</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-3">
                        <button onClick={() => abrirEdicion(tp)} className={CLASE_ACCION}>
                          Editar
                        </button>
                        <button onClick={() => confirmarDesactivar(tp)} className={CLASE_ACCION_PELIGRO}>
                          Desactivar
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {/* Pie (como el de Facturas emitidas) */}
        {tiposFiltrados && tiposFiltrados.length > 0 && (
          <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 px-4 py-2.5 border-t-2 border-gray-900 dark:border-gray-200">
            <span className="font-mono text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {tiposFiltrados.length} categoría{tiposFiltrados.length === 1 ? "" : "s"}
              {filtros.hayFiltros ? " · según filtro" : ""}
            </span>
            <span className="text-sm font-bold text-gray-900 dark:text-gray-50">
              GANANCIA PROMEDIO{" "}
              <span className="font-mono tabular-nums ml-2">
                {(tiposFiltrados.reduce((a, tp) => a + Number(tp.porcentajeGanancia), 0) / tiposFiltrados.length).toFixed(2)}%
              </span>
            </span>
          </div>
        )}
      </PanelListado>
    </div>
  );
}
