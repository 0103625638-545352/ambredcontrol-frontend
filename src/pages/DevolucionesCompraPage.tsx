import { useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api, abrirPdfEnNuevaPestana, type Compra, type CompraConDetalle, type DevolucionCompra } from "../api/client";
import { Paginacion } from "../components/Paginacion";
import {
  CLASE_CAMPO,
  CLASE_SOLO_LECTURA,
  CLASE_TH,
  CLASE_THEAD,
  CLASE_CAMPO_CELDA,
  MarcoDocumento,
  Sello,
  CabeceraDocumento,
  EtiquetaCabecera,
  DetalleDocumento,
  FilaDetalleVacia,
  BotonConfirmar,
  MensajeError,
  fechaHoy,
  Resaltar,
  EncabezadoListado,
  CLASE_BOTON_ENCABEZADO,
} from "../components/FormatoDocumento";
import {
  useFiltrosListado,
  BarraBuscadorDocumentos,
  PieResumenListado,
  type RespuestaConResumen,
} from "../components/BuscadorDocumentos";

const TAMANO_PAGINA = 20;

export function DevolucionesCompraPage() {
  const queryClient = useQueryClient();
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [compraSeleccionadaId, setCompraSeleccionadaId] = useState<number | "">("");
  const [motivo, setMotivo] = useState("");
  // Cantidades a devolver por producto: { [productoId]: cantidad }
  const [cantidades, setCantidades] = useState<Record<number, number>>({});
  const [pagina, setPagina] = useState(1);
  // Buscador dinámico del listado (ver components/BuscadorDocumentos.tsx).
  const filtros = useFiltrosListado(setPagina);

  const { data: respuesta, isLoading } = useQuery({
    queryKey: ["devoluciones-compra", pagina, ...filtros.clave],
    queryFn: async () =>
      (await api.get<RespuestaConResumen<DevolucionCompra>>("/devoluciones-compra", { params: { page: pagina, pageSize: TAMANO_PAGINA, ...filtros.params } })).data,
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

  const compraElegida = comprasDisponibles.find((c) => c.id === compraSeleccionadaId);
  const unidadesADevolver = Object.values(cantidades).reduce((acumulado, n) => acumulado + (n > 0 ? n : 0), 0);

  return (
    <div className="space-y-6">
      {mostrarFormulario && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            crearDevolucion.mutate();
          }}
        >
          <MarcoDocumento
            titulo="Nueva devolución"
            sello={<Sello>Borrador</Sello>}
            aviso="Devuelve al proveedor mercadería de una compra registrada. Descuenta el stock que esa compra había sumado."
          >
            <CabeceraDocumento>
              <EtiquetaCabecera>Compra a corregir</EtiquetaCabecera>
              <div className="col-span-3">
                <select
                  required
                  value={compraSeleccionadaId}
                  onChange={(e) => {
                    setCompraSeleccionadaId(e.target.value ? Number(e.target.value) : "");
                    setCantidades({});
                  }}
                  className={CLASE_CAMPO}
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

              <EtiquetaCabecera>Proveedor</EtiquetaCabecera>
              <div className={CLASE_SOLO_LECTURA}>{compraElegida?.proveedor.razonSocial ?? "—"}</div>
              <EtiquetaCabecera>Fecha</EtiquetaCabecera>
              <div className={`${CLASE_SOLO_LECTURA} font-mono`}>{fechaHoy()}</div>

              <EtiquetaCabecera>Motivo</EtiquetaCabecera>
              <input
                type="text"
                required
                placeholder="Ej: Mercadería defectuosa"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                className={`${CLASE_CAMPO} col-span-3`}
              />
            </CabeceraDocumento>

            <div className="mx-4 flex items-center justify-between gap-2 border border-stone-300 dark:border-gray-700 bg-stone-50 dark:bg-gray-900/40 px-3 py-2">
              <span className="font-mono text-[10.5px] uppercase tracking-[0.15em] text-gray-600 dark:text-gray-300">
                Detalle de la compra
              </span>
              {compraDetalle && (
                <button
                  type="button"
                  onClick={() =>
                    setCantidades(
                      Object.fromEntries(compraDetalle.detalles.map((d) => [d.productoId, disponibleParaDevolver(d)]))
                    )
                  }
                  className="text-red-600 dark:text-red-400 hover:underline text-xs font-semibold"
                >
                  Devolver todo lo disponible
                </button>
              )}
            </div>
            <DetalleDocumento>
              <thead>
                <tr className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700">
                  <th className={`${CLASE_TH} w-10`}>#</th>
                  <th className={CLASE_TH}>Producto</th>
                  <th className={`${CLASE_TH} w-24 text-right`}>Comprado</th>
                  <th className={`${CLASE_TH} w-28 text-right`}>Ya devuelto</th>
                  <th className={`${CLASE_TH} w-24 text-right`}>Disponible</th>
                  <th className={`${CLASE_TH} w-28 text-right`}>A devolver</th>
                </tr>
              </thead>
              <tbody>
                {!compraDetalle && (
                  <FilaDetalleVacia columnas={6}>Elige la compra a corregir para ver su detalle.</FilaDetalleVacia>
                )}
                {compraDetalle?.detalles.map((d, indice) => {
                  const disponible = disponibleParaDevolver(d);
                  return (
                    <tr key={d.id} className="border-b border-stone-100 dark:border-gray-700/60 last:border-b-0">
                      <td className="px-3 py-1.5 font-mono text-xs text-gray-400">{indice + 1}</td>
                      <td className="px-3 py-1.5 text-gray-800 dark:text-gray-100 uppercase text-[13px]">{d.producto.nombre}</td>
                      <td className="px-3 py-1.5 font-mono text-right text-gray-600 dark:text-gray-300">{d.cantidad}</td>
                      <td className="px-3 py-1.5 font-mono text-right text-gray-400">{d.cantidad - disponible}</td>
                      <td className="px-3 py-1.5 font-mono text-right text-gray-600 dark:text-gray-300">{disponible}</td>
                      <td className="px-3 py-1 text-right">
                        <input
                          type="number"
                          min={0}
                          max={disponible}
                          disabled={disponible <= 0}
                          value={cantidades[d.productoId] ?? 0}
                          onChange={(e) => setCantidades({ ...cantidades, [d.productoId]: Number(e.target.value) })}
                          className={`${CLASE_CAMPO_CELDA} w-20 disabled:opacity-40`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </DetalleDocumento>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4 p-4 items-start">
              <div />
              <div className="space-y-3">
                <div className="border border-stone-300 dark:border-gray-700 text-sm">
                  <div className="flex justify-between px-3 py-2.5 font-bold text-base text-gray-900 dark:text-gray-50">
                    <span>UNIDADES A DEVOLVER</span>
                    <span className="font-mono tabular-nums">{unidadesADevolver}</span>
                  </div>
                </div>
                <BotonConfirmar type="submit" disabled={crearDevolucion.isPending}>
                  {crearDevolucion.isPending ? "Guardando..." : "Registrar devolución"}
                </BotonConfirmar>
                {crearDevolucion.isError && (
                  <MensajeError>
                    {(crearDevolucion.error as any)?.response?.data?.error ?? "Error al registrar la devolución"}
                  </MensajeError>
                )}
              </div>
            </div>
          </MarcoDocumento>
        </form>
      )}

      <div className="bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700 overflow-hidden">
        <EncabezadoListado
          titulo="Devoluciones a proveedor"
          conteo={respuesta?.paginacion.total}
          singular="devolución"
          plural="devoluciones"
          aviso="Devuelve al proveedor mercadería de una compra registrada. Descuenta el stock que esa compra había sumado."
          acciones={
            <button onClick={() => setMostrarFormulario(!mostrarFormulario)} className={CLASE_BOTON_ENCABEZADO}>
              {mostrarFormulario ? "Cancelar" : "+ Nueva devolución"}
            </button>
          }
        />
        <BarraBuscadorDocumentos
          filtros={filtros}
          etiquetaBusqueda="Buscar · número, compra, proveedor o motivo"
          placeholder="Ej: 000000003, defectuosa..."
          mostrarPago={false}
        />
        <table className="w-full text-sm">
          <thead className={CLASE_THEAD}>
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
                  {filtros.hayFiltros ? "Ningún documento coincide con la búsqueda." : "No hay devoluciones registradas"}
                </td>
              </tr>
            )}
            {devoluciones?.map((d) => (
              <tr key={d.id} className="border-t border-stone-100 dark:border-gray-700 hover:bg-stone-50 dark:hover:bg-gray-700/30">
                <td className="px-4 py-2 font-mono text-xs"><Resaltar texto={d.secuencial} termino={filtros.busquedaAplicada} /></td>
                <td className="px-4 py-2 font-mono text-xs"><Resaltar texto={d.compra.numeroFactura} termino={filtros.busquedaAplicada} /></td>
                <td className="px-4 py-2"><Resaltar texto={d.compra.proveedor.razonSocial} termino={filtros.busquedaAplicada} /></td>
                <td className="px-4 py-2"><Resaltar texto={d.motivo} termino={filtros.busquedaAplicada} /></td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">{d.total}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => abrirPdfEnNuevaPestana(`/devoluciones-compra/${d.id}/recibo`)}
                    className="text-brand-700 dark:text-brand-300 hover:underline text-xs font-medium"
                  >
                    Ver PDF
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <PieResumenListado resumen={respuesta?.resumen} hayFiltros={filtros.hayFiltros} />
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
