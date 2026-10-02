import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Banco } from "../api/client";
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

// Catálogo de bancos EXTERNOS (Pichincha, Guayaquil, Produbanco, etc.) — de
// dónde vino/salió el dinero de un cobro/pago (banco de procedencia en
// TRANSFERENCIA, banco emisor en TARJETA/CHEQUE), NO las cuentas PROPIAS de
// la empresa (eso es CuentasBancariasPage.tsx). Existe para que el vendedor
// elija de una lista en ModalRegistrarPago.tsx/PuntoDeVentaPage.tsx en vez
// de escribir el nombre a mano. Mirror de TiposPrecioPage.tsx. Solo ADMIN
// puede crear/editar/desactivar — cualquier usuario que cobre puede elegir uno.
export function BancosPage() {
  const queryClient = useQueryClient();
  const confirmar = useConfirm();
  const { mostrarToast } = useToast();
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [bancoEditandoId, setBancoEditandoId] = useState<number | null>(null);
  const [nombreEdit, setNombreEdit] = useState("");

  const { data: bancos, isLoading } = useQuery({
    queryKey: ["bancos"],
    queryFn: async () => (await api.get<Banco[]>("/bancos")).data,
  });

  const crearBanco = useMutation({
    mutationFn: async () => api.post("/bancos", { nombre: nombreNuevo }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bancos"] });
      setNombreNuevo("");
    },
    onError: (error: any) => {
      mostrarToast(error.response?.data?.error ?? "Error al crear el banco");
    },
  });

  const editarBanco = useMutation({
    mutationFn: async (id: number) => api.put(`/bancos/${id}`, { nombre: nombreEdit }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bancos"] });
      setBancoEditandoId(null);
    },
    onError: (error: any) => {
      mostrarToast(error.response?.data?.error ?? "Error al editar el banco");
    },
  });

  const desactivarBanco = useMutation({
    mutationFn: async (id: number) => api.delete(`/bancos/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bancos"] });
    },
    onError: (error: any) => {
      mostrarToast(error.response?.data?.error ?? "Error al desactivar el banco");
    },
  });

  function abrirEdicion(b: Banco) {
    setNombreEdit(b.nombre);
    setBancoEditandoId(bancoEditandoId === b.id ? null : b.id);
  }

  async function confirmarDesactivar(b: Banco) {
    const ok = await confirmar(`¿Desactivar "${b.nombre}"? Los pagos ya registrados con este banco lo conservan.`);
    if (ok) desactivarBanco.mutate(b.id);
  }

  // Buscador del catálogo (en el navegador: la lista ya viene completa).
  const filtros = useFiltrosListado(sinPaginacion);
  const bancosFiltrados = filtrarLocal(bancos, filtros, {
    textos: (b) => [b.nombre],
    fecha: (b) => b.createdAt,
  });

  return (
    <div>
      <PanelListado
        titulo="Bancos"
        conteo={bancos?.length}
        singular="banco"
        plural="bancos"
        aviso="Catálogo de bancos externos (de dónde viene el dinero de un cobro). Se elige al registrar un pago por transferencia, tarjeta o cheque, para evitar que cada vendedor escriba el nombre del banco a mano."
      >
        {/* Línea de ingreso: nuevo banco */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (nombreNuevo.trim()) crearBanco.mutate();
          }}
          className="flex items-end gap-2 p-3 border-b border-stone-300 dark:border-gray-700"
        >
          <label className="flex flex-col gap-1 flex-1 min-w-0">
            <span className={CLASE_ETIQUETA}>Nuevo banco</span>
            <input
              placeholder="Ej: Banco Pichincha"
              required
              value={nombreNuevo}
              onChange={(e) => setNombreNuevo(e.target.value)}
              className={CLASE_CAMPO}
            />
          </label>
          <button
            type="submit"
            disabled={crearBanco.isPending}
            className="bg-brand-700 text-white px-4 py-1.5 rounded-sm text-sm font-semibold hover:bg-brand-800 disabled:opacity-50 whitespace-nowrap"
          >
            {crearBanco.isPending ? "Guardando..." : "Agregar ↵"}
          </button>
        </form>

        <BarraBuscadorDocumentos filtros={filtros} etiquetaBusqueda="Buscar · nombre del banco" placeholder="Ej: Pichincha..." mostrarPago={false} />

        <table className="w-full text-sm">
          <thead className={CLASE_THEAD}>
            <tr>
              <th className="px-4 py-2 w-10">#</th>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2 w-40"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-400 dark:text-gray-500">
                  Cargando...
                </td>
              </tr>
            )}
            {!isLoading && bancosFiltrados?.length === 0 && (
              <FilaSinResultados columnas={3} hayFiltros={filtros.hayFiltros} vacio="Todavía no hay bancos." />
            )}
            {bancosFiltrados?.map((b, indice) => (
              <tr key={b.id} className="border-t border-stone-100 dark:border-gray-700 hover:bg-stone-50 dark:hover:bg-gray-700/30">
                {bancoEditandoId === b.id ? (
                  <td colSpan={3} className="px-4 py-2">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        editarBanco.mutate(b.id);
                      }}
                      className="flex gap-2"
                    >
                      <input
                        autoFocus
                        required
                        value={nombreEdit}
                        onChange={(e) => setNombreEdit(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setBancoEditandoId(null);
                        }}
                        className={`${CLASE_CAMPO_CELDA} flex-1 text-left font-sans`}
                      />
                      <button
                        type="submit"
                        disabled={editarBanco.isPending}
                        className="bg-brand-700 text-white px-3 py-1 rounded-sm text-xs font-semibold hover:bg-brand-800 disabled:opacity-50"
                      >
                        Guardar
                      </button>
                      <button type="button" onClick={() => setBancoEditandoId(null)} className={CLASE_ACCION}>
                        Cancelar
                      </button>
                    </form>
                  </td>
                ) : (
                  <>
                    <td className="px-4 py-2 font-mono text-xs text-gray-400">{indice + 1}</td>
                    <td className="px-4 py-2 uppercase text-[13px] font-semibold text-gray-800 dark:text-gray-100">
                      <Resaltar texto={b.nombre} termino={filtros.busquedaAplicada} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-3">
                        <button onClick={() => abrirEdicion(b)} className={CLASE_ACCION}>
                          Editar
                        </button>
                        <button onClick={() => confirmarDesactivar(b)} className={CLASE_ACCION_PELIGRO}>
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
        {/* Pie (como el de Facturas emitidas): cuántos bancos hay en lo filtrado */}
        {bancosFiltrados && bancosFiltrados.length > 0 && (
          <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 px-4 py-2.5 border-t-2 border-gray-900 dark:border-gray-200">
            <span className="font-mono text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {filtros.hayFiltros ? "Según filtro" : "Catálogo completo"}
            </span>
            <span className="text-sm font-bold text-gray-900 dark:text-gray-50">
              BANCOS <span className="font-mono tabular-nums ml-2">{bancosFiltrados.length}</span>
            </span>
          </div>
        )}
      </PanelListado>
    </div>
  );
}
