import { useState, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type PendienteSerie, type NumeroSerieProducto } from "../api/client";
import { BuscadorCliente } from "../components/BuscadorCliente";
import { useDebounce } from "../hooks/useDebounce";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmProvider";
import { useFiltrosListado, BarraBuscadorDocumentos, filtrarLocal, sinPaginacion } from "../components/BuscadorDocumentos";
import { CLASE_CAMPO, CLASE_ETIQUETA, Resaltar } from "../components/FormatoDocumento";

// Control de números de serie por unidad (ver Producto.controlaNumeroSerie):
// una pestaña para que bodega capture los seriales de lo que entró por
// Compras, otra para buscar un serial puntual y ver/editar a quién se le
// entregó — ver el comentario del modelo NumeroSerieProducto en
// schema.prisma sobre por qué "entregar" es una acción aparte, nunca
// obligatoria para completar una venta.
export function SeriesProductosPage() {
  const [pestana, setPestana] = useState<"pendientes" | "buscar">("pendientes");

  const pestanas: { id: "pendientes" | "buscar"; etiqueta: string }[] = [
    { id: "pendientes", etiqueta: "Pendientes por serializar" },
    { id: "buscar", etiqueta: "Buscar / asignar serie" },
  ];

  return (
    <div className="bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-stone-300 dark:border-gray-700">
        <h2 className="text-base font-bold text-gray-900 dark:text-gray-50">Números de serie</h2>
        <span className="font-mono text-[11px] text-gray-400 dark:text-gray-500">{pestanas.find((x) => x.id === pestana)?.etiqueta}</span>
      </div>
      <div className="px-4 py-2 bg-stone-50 dark:bg-gray-900/40 border-b border-stone-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
        Control por unidad de los productos que llevan número de serie: bodega captura los seriales de lo que entró por Compras, y acá
        también se busca un serial puntual para ver o cambiar a qué cliente se le entregó.
      </div>
      <div className="flex flex-wrap border-b border-stone-300 dark:border-gray-700 px-2">
        {pestanas.map((x) => (
          <button
            key={x.id}
            onClick={() => setPestana(x.id)}
            className={`px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px ${
              pestana === x.id
                ? "border-brand-600 text-brand-700 dark:text-brand-300"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            }`}
          >
            {x.etiqueta}
          </button>
        ))}
      </div>

      {pestana === "pendientes" ? <PanelPendientes /> : <PanelBuscar />}
    </div>
  );
}

// Líneas de compra de productos serializables a las que todavía les falta
// capturar algún serial — ver GET /compras/pendientes-serie.
function PanelPendientes() {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const [capturandoId, setCapturandoId] = useState<number | null>(null);
  const [texto, setTexto] = useState("");

  const { data: pendientes, isLoading } = useQuery({
    queryKey: ["series-pendientes"],
    queryFn: async () => (await api.get<PendienteSerie[]>("/compras/pendientes-serie")).data,
  });
  // Buscador compartido de los listados (en el navegador: la lista ya viene completa).
  const filtros = useFiltrosListado(sinPaginacion);
  const pendientesFiltrados =
    filtrarLocal(pendientes, filtros, {
      textos: (x) => [x.numeroFactura, x.proveedor, x.producto.nombre, x.producto.codigo],
      fecha: (x) => x.fechaEmision,
    }) ?? [];

  const capturar = useMutation({
    mutationFn: async ({ compraDetalleId, series }: { compraDetalleId: number; series: string[] }) =>
      api.post(`/compras/detalles/${compraDetalleId}/series`, { series }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["series-pendientes"] });
      setCapturandoId(null);
      setTexto("");
      mostrarToast("Series capturadas", "success");
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "No se pudieron capturar las series"),
  });

  function abrirCaptura(p: PendienteSerie) {
    setCapturandoId(capturandoId === p.compraDetalleId ? null : p.compraDetalleId);
    setTexto("");
  }

  const lineasTexto = texto.split("\n").map((l) => l.trim()).filter(Boolean);

  if (isLoading) return <p className="px-4 py-6 text-sm text-gray-400 dark:text-gray-500">Cargando...</p>;
  if (!pendientes || pendientes.length === 0) {
    return <p className="px-4 py-6 text-sm text-gray-400 dark:text-gray-500">No hay ninguna línea de compra pendiente de serializar.</p>;
  }

  return (
    <div>
      <BarraBuscadorDocumentos
        filtros={filtros}
        etiquetaBusqueda="Buscar · compra, proveedor o producto"
        placeholder="Ej: 001-001-000000123, ONU, Huawei..."
        mostrarPago={false}
      />
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700 text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 [&_th]:font-medium">
          <tr>
            <th className="px-4 py-2">Compra</th>
            <th className="px-4 py-2">Proveedor</th>
            <th className="px-4 py-2">Producto</th>
            <th className="px-4 py-2">Cantidad</th>
            <th className="px-4 py-2">Faltan</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {pendientesFiltrados.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">
                Ninguna línea pendiente coincide con la búsqueda.
              </td>
            </tr>
          )}
          {pendientesFiltrados.map((p) => (
            <Fragment key={p.compraDetalleId}>
              <tr className="border-t border-stone-100 dark:border-gray-700">
                <td className="px-4 py-2 font-mono text-xs"><Resaltar texto={p.numeroFactura} termino={filtros.busquedaAplicada} /></td>
                <td className="px-4 py-2 text-gray-600 dark:text-gray-300"><Resaltar texto={p.proveedor} termino={filtros.busquedaAplicada} /></td>
                <td className="px-4 py-2">
                  {p.producto.nombre} <span className="text-xs text-gray-400 dark:text-gray-500">({p.producto.codigo})</span>
                </td>
                <td className="px-4 py-2">{p.cantidad}</td>
                <td className="px-4 py-2 font-medium text-amber-600 dark:text-amber-400">{p.faltantes}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => abrirCaptura(p)} className="text-brand-700 dark:text-brand-300 hover:underline text-xs font-medium">
                    Capturar series
                  </button>
                </td>
              </tr>
              {capturandoId === p.compraDetalleId && (
                <tr className="border-t border-stone-100 dark:border-gray-700">
                  <td colSpan={6} className="px-4 py-3 bg-stone-50 dark:bg-gray-900/30">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">
                      Un número de serie por línea (podés escanear con lector de código de barras, cada escaneo cae en su propia línea). Faltan{" "}
                      {p.faltantes} — vas a enviar {lineasTexto.length}.
                    </p>
                    <textarea
                      autoFocus
                      rows={Math.min(Math.max(p.faltantes, 3), 10)}
                      value={texto}
                      onChange={(e) => setTexto(e.target.value)}
                      placeholder={"SN-0001\nSN-0002\n..."}
                      className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm font-mono"
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        disabled={capturar.isPending || lineasTexto.length === 0 || lineasTexto.length > p.faltantes}
                        onClick={() => capturar.mutate({ compraDetalleId: p.compraDetalleId, series: lineasTexto })}
                        className="bg-brand-700 text-white px-3 py-1.5 rounded-sm text-xs font-semibold hover:bg-brand-800 disabled:opacity-50"
                      >
                        {capturar.isPending ? "Guardando..." : `Guardar ${lineasTexto.length} serie(s)`}
                      </button>
                      <button
                        onClick={() => setCapturandoId(null)}
                        className="bg-stone-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-500"
                      >
                        Cancelar
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
      </div>
      {pendientesFiltrados.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 px-4 py-2.5 border-t-2 border-gray-900 dark:border-gray-200">
          <span className="font-mono text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {pendientesFiltrados.length} línea{pendientesFiltrados.length === 1 ? "" : "s"} de compra
            {filtros.hayFiltros ? " · según filtro" : ""}
          </span>
          <span className="text-sm font-bold text-gray-900 dark:text-gray-50">
            SERIALES POR CAPTURAR{" "}
            <span className="font-mono tabular-nums ml-2">{pendientesFiltrados.reduce((a, x) => a + x.faltantes, 0)}</span>
          </span>
        </div>
      )}
    </div>
  );
}

// Buscar por serial (parcial) en cualquier producto — responde "¿dónde está
// / a quién se le entregó este equipo?" y permite corregir una asignación.
function PanelBuscar() {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const confirmar = useConfirm();
  const [texto, setTexto] = useState("");
  const textoDebounced = useDebounce(texto);
  const [entregandoId, setEntregandoId] = useState<number | null>(null);
  const [clienteId, setClienteId] = useState<number | "">("");
  const [referencia, setReferencia] = useState("");

  const { data: resultados, isFetching } = useQuery({
    queryKey: ["series-buscar", textoDebounced],
    queryFn: async () => (await api.get<NumeroSerieProducto[]>("/productos/series/buscar", { params: { q: textoDebounced } })).data,
    enabled: textoDebounced.trim().length >= 2,
  });

  const entregar = useMutation({
    mutationFn: async ({ serieId, clienteId, referenciaDocumento }: { serieId: number; clienteId: number; referenciaDocumento: string }) =>
      api.post(`/productos/series/${serieId}/entregar`, { clienteId, referenciaDocumento: referenciaDocumento || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["series-buscar"] });
      setEntregandoId(null);
      setClienteId("");
      setReferencia("");
      mostrarToast("Serie entregada", "success");
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "No se pudo entregar la serie"),
  });

  const regresar = useMutation({
    mutationFn: async (serieId: number) => api.post(`/productos/series/${serieId}/regresar-a-bodega`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["series-buscar"] });
      mostrarToast("Serie devuelta a bodega", "success");
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "No se pudo regresar la serie a bodega"),
  });

  async function confirmarRegresar(s: NumeroSerieProducto) {
    const ok = await confirmar(`¿Regresar la serie "${s.numeroSerie}" a bodega? Queda libre para entregarse a otro cliente.`);
    if (ok) regresar.mutate(s.id);
  }

  return (
    <div>
      <div className="p-3 bg-stone-50 dark:bg-gray-900/40 border-b border-stone-300 dark:border-gray-700">
        <label className="flex flex-col gap-1 max-w-xl">
          <span className={CLASE_ETIQUETA}>Buscar · número de serie (mínimo 2 caracteres)</span>
          <input
            type="text"
            placeholder="Ej: 48575443A1B2..."
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            className={`${CLASE_CAMPO} font-mono`}
            autoFocus
          />
        </label>
      </div>

      {textoDebounced.trim().length < 2 && <p className="px-4 py-4 text-sm text-gray-400 dark:text-gray-500">Escribe al menos 2 caracteres.</p>}
      {isFetching && <p className="px-4 py-4 text-sm text-gray-400 dark:text-gray-500">Buscando...</p>}
      {!isFetching && textoDebounced.trim().length >= 2 && resultados?.length === 0 && (
        <p className="px-4 py-4 text-sm text-gray-400 dark:text-gray-500">Sin resultados para "{textoDebounced}"</p>
      )}

      {resultados && resultados.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700 text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 [&_th]:font-medium">
              <tr>
                <th className="px-4 py-2">Serie</th>
                <th className="px-4 py-2">Producto</th>
                <th className="px-4 py-2">Origen (compra)</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {resultados.map((s) => (
                <Fragment key={s.id}>
                  <tr className="border-t border-stone-100 dark:border-gray-700">
                    <td className="px-4 py-2 font-mono"><Resaltar texto={s.numeroSerie} termino={textoDebounced} /></td>
                    <td className="px-4 py-2">{s.producto.nombre}</td>
                    <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
                      {s.compraDetalle ? `${s.compraDetalle.compra.numeroFactura} — ${s.compraDetalle.compra.proveedor.razonSocial}` : "—"}
                    </td>
                    <td className="px-4 py-2">
                      {s.estado === "EN_BODEGA" && <span className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">En bodega</span>}
                      {s.estado === "EN_TRANSITO" && (
                        <div>
                          <span className="text-amber-600 dark:text-amber-400 text-xs font-medium">En tránsito</span>
                          {s.egresosDetalle?.[0] && (
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              Con {s.egresosDetalle[0].egreso.empleado.nombres} {s.egresosDetalle[0].egreso.empleado.apellidos}
                            </div>
                          )}
                        </div>
                      )}
                      {s.estado === "ENTREGADO" && (
                        <div>
                          <span className="text-sky-600 dark:text-sky-400 text-xs font-medium">Entregado</span>
                          {s.cliente && <div className="text-xs text-gray-500 dark:text-gray-400">{s.cliente.razonSocial}</div>}
                          {s.referenciaDocumento && <div className="text-xs text-gray-400 dark:text-gray-500">{s.referenciaDocumento}</div>}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {s.estado === "EN_BODEGA" ? (
                        <button
                          onClick={() => setEntregandoId(entregandoId === s.id ? null : s.id)}
                          className="text-brand-700 dark:text-brand-300 hover:underline text-xs font-medium"
                        >
                          Entregar
                        </button>
                      ) : (
                        <>
                          {s.estado === "EN_TRANSITO" && (
                            <button
                              onClick={() => setEntregandoId(entregandoId === s.id ? null : s.id)}
                              className="text-brand-700 dark:text-brand-300 hover:underline text-xs font-medium mr-3"
                            >
                              Entregar
                            </button>
                          )}
                          <button
                            onClick={() => confirmarRegresar(s)}
                            className="text-red-600 dark:text-red-400 hover:underline text-xs font-medium"
                          >
                            Regresar a bodega
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                  {entregandoId === s.id && (
                    <tr className="border-t border-stone-100 dark:border-gray-700">
                      <td colSpan={5} className="px-4 py-3 bg-stone-50 dark:bg-gray-900/30">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Entregar "{s.numeroSerie}" a:</p>
                        <BuscadorCliente clienteId={clienteId} onSeleccionar={(id) => setClienteId(id)} />
                        <input
                          type="text"
                          placeholder="Referencia (opcional, ej. Factura 001-001-000123)"
                          value={referencia}
                          onChange={(e) => setReferencia(e.target.value)}
                          className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm w-full mb-2"
                        />
                        <div className="flex gap-2">
                          <button
                            disabled={!clienteId || entregar.isPending}
                            onClick={() => clienteId && entregar.mutate({ serieId: s.id, clienteId, referenciaDocumento: referencia })}
                            className="bg-brand-700 text-white px-3 py-1.5 rounded-sm text-xs font-semibold hover:bg-brand-800 disabled:opacity-50"
                          >
                            {entregar.isPending ? "Guardando..." : "Confirmar entrega"}
                          </button>
                          <button
                            onClick={() => {
                              setEntregandoId(null);
                              setClienteId("");
                              setReferencia("");
                            }}
                            className="bg-stone-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-500"
                          >
                            Cancelar
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
