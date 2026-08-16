import { useState, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type PendienteSerie, type NumeroSerieProducto } from "../api/client";
import { BuscadorCliente } from "../components/BuscadorCliente";
import { useDebounce } from "../hooks/useDebounce";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmProvider";

// Control de números de serie por unidad (ver Producto.controlaNumeroSerie):
// una pestaña para que bodega capture los seriales de lo que entró por
// Compras, otra para buscar un serial puntual y ver/editar a quién se le
// entregó — ver el comentario del modelo NumeroSerieProducto en
// schema.prisma sobre por qué "entregar" es una acción aparte, nunca
// obligatoria para completar una venta.
export function SeriesProductosPage() {
  const [pestana, setPestana] = useState<"pendientes" | "buscar">("pendientes");

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Números de Serie</h2>
      <div className="flex gap-2 mb-4 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setPestana("pendientes")}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
            pestana === "pendientes"
              ? "border-slate-800 dark:border-slate-300 text-slate-800 dark:text-slate-100"
              : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          }`}
        >
          Pendientes por serializar
        </button>
        <button
          onClick={() => setPestana("buscar")}
          className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
            pestana === "buscar"
              ? "border-slate-800 dark:border-slate-300 text-slate-800 dark:text-slate-100"
              : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          }`}
        >
          Buscar / asignar serie
        </button>
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

  if (isLoading) return <p className="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>;
  if (!pendientes || pendientes.length === 0) {
    return <p className="text-sm text-gray-400 dark:text-gray-500">No hay ninguna línea de compra pendiente de serializar.</p>;
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
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
          {pendientes.map((p) => (
            <Fragment key={p.compraDetalleId}>
              <tr className="border-t border-gray-100 dark:border-gray-700">
                <td className="px-4 py-2">{p.numeroFactura}</td>
                <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{p.proveedor}</td>
                <td className="px-4 py-2">
                  {p.producto.nombre} <span className="text-xs text-gray-400 dark:text-gray-500">({p.producto.codigo})</span>
                </td>
                <td className="px-4 py-2">{p.cantidad}</td>
                <td className="px-4 py-2 font-medium text-amber-600 dark:text-amber-400">{p.faltantes}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => abrirCaptura(p)} className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium">
                    Capturar series
                  </button>
                </td>
              </tr>
              {capturandoId === p.compraDetalleId && (
                <tr className="border-t border-gray-100 dark:border-gray-700">
                  <td colSpan={6} className="px-4 py-3 bg-gray-50 dark:bg-gray-900/30">
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
                      className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm font-mono"
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        disabled={capturar.isPending || lineasTexto.length === 0 || lineasTexto.length > p.faltantes}
                        onClick={() => capturar.mutate({ compraDetalleId: p.compraDetalleId, series: lineasTexto })}
                        className="bg-brand-600 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-brand-700 disabled:opacity-50"
                      >
                        {capturar.isPending ? "Guardando..." : `Guardar ${lineasTexto.length} serie(s)`}
                      </button>
                      <button
                        onClick={() => setCapturandoId(null)}
                        className="bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 px-3 py-1.5 rounded-md text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-500"
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
      <input
        type="text"
        placeholder="Buscar por número de serie..."
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm w-full max-w-md mb-4"
      />

      {textoDebounced.trim().length < 2 && <p className="text-sm text-gray-400 dark:text-gray-500">Escribe al menos 2 caracteres.</p>}
      {isFetching && <p className="text-sm text-gray-400 dark:text-gray-500">Buscando...</p>}
      {!isFetching && textoDebounced.trim().length >= 2 && resultados?.length === 0 && (
        <p className="text-sm text-gray-400 dark:text-gray-500">Sin resultados para "{textoDebounced}"</p>
      )}

      {resultados && resultados.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
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
                  <tr className="border-t border-gray-100 dark:border-gray-700">
                    <td className="px-4 py-2 font-mono">{s.numeroSerie}</td>
                    <td className="px-4 py-2">{s.producto.nombre}</td>
                    <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
                      {s.compraDetalle ? `${s.compraDetalle.compra.numeroFactura} — ${s.compraDetalle.compra.proveedor.razonSocial}` : "—"}
                    </td>
                    <td className="px-4 py-2">
                      {s.estado === "EN_BODEGA" ? (
                        <span className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">En bodega</span>
                      ) : (
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
                          className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium"
                        >
                          Entregar
                        </button>
                      ) : (
                        <button
                          onClick={() => confirmarRegresar(s)}
                          className="text-red-600 dark:text-red-400 hover:underline text-xs font-medium"
                        >
                          Regresar a bodega
                        </button>
                      )}
                    </td>
                  </tr>
                  {entregandoId === s.id && (
                    <tr className="border-t border-gray-100 dark:border-gray-700">
                      <td colSpan={5} className="px-4 py-3 bg-gray-50 dark:bg-gray-900/30">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Entregar "{s.numeroSerie}" a:</p>
                        <BuscadorCliente clienteId={clienteId} onSeleccionar={(id) => setClienteId(id)} />
                        <input
                          type="text"
                          placeholder="Referencia (opcional, ej. Factura 001-001-000123)"
                          value={referencia}
                          onChange={(e) => setReferencia(e.target.value)}
                          className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm w-full mb-2"
                        />
                        <div className="flex gap-2">
                          <button
                            disabled={!clienteId || entregar.isPending}
                            onClick={() => clienteId && entregar.mutate({ serieId: s.id, clienteId, referenciaDocumento: referencia })}
                            className="bg-brand-600 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-brand-700 disabled:opacity-50"
                          >
                            {entregar.isPending ? "Guardando..." : "Confirmar entrega"}
                          </button>
                          <button
                            onClick={() => {
                              setEntregandoId(null);
                              setClienteId("");
                              setReferencia("");
                            }}
                            className="bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 px-3 py-1.5 rounded-md text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-500"
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
