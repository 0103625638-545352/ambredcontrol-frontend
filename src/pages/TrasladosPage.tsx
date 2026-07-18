import { useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api, type Producto, type Sucursal, type Bodega, type Traslado, type RespuestaPaginada } from "../api/client";
import { ImagenProducto } from "../components/ImagenProducto";
import { Paginacion } from "../components/Paginacion";
import { useToast } from "../components/ToastProvider";
import { useMiSucursal } from "../context/AuthContext";

const TAMANO_PAGINA = 20;

interface ItemTraslado {
  producto: Producto;
  cantidad: number;
}

export function TrasladosPage() {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const miSucursal = useMiSucursal();
  const [carrito, setCarrito] = useState<ItemTraslado[]>([]);
  const [bodegaOrigenId, setBodegaOrigenId] = useState<number | "">("");
  const [bodegaDestinoId, setBodegaDestinoId] = useState<number | "">("");
  const [motivo, setMotivo] = useState("");
  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [pagina, setPagina] = useState(1);

  // Bodegas de la sucursal del usuario, para elegir el origen — solo puede
  // sacar stock de una bodega de su propia sucursal (el backend re-valida esto).
  const { data: bodegasOrigen } = useQuery({
    queryKey: ["bodegas", miSucursal?.id],
    queryFn: async () => (await api.get<Bodega[]>("/bodegas", { params: { sucursalId: miSucursal!.id } })).data,
    enabled: !!miSucursal,
  });

  // Todas las bodegas activas (de cualquier sucursal), para elegir el destino
  // — un traslado puede ser dentro de la misma sucursal o hacia otra.
  const { data: todasLasBodegas } = useQuery({
    queryKey: ["bodegas"],
    queryFn: async () => (await api.get<Bodega[]>("/bodegas")).data,
  });
  const { data: sucursales } = useQuery({
    queryKey: ["sucursales"],
    queryFn: async () => (await api.get<Sucursal[]>("/sucursales")).data,
  });
  const bodegasDestinoPorSucursal = new Map<number, Bodega[]>();
  todasLasBodegas
    ?.filter((b) => b.id !== bodegaOrigenId)
    .forEach((b) => {
      const lista = bodegasDestinoPorSucursal.get(b.sucursalId) ?? [];
      lista.push(b);
      bodegasDestinoPorSucursal.set(b.sucursalId, lista);
    });

  // Los traslados solo admiten productos sin lote (ver backend/src/routes/traslados.ts).
  const { data: productos } = useQuery({
    queryKey: ["productos"],
    queryFn: async () => (await api.get<Producto[]>("/productos")).data,
  });
  const textoBusqueda = busquedaProducto.trim().toLowerCase();
  const productosFiltrados = productos?.filter(
    (p) =>
      !p.manejaLotes &&
      (!textoBusqueda ||
        p.nombre.toLowerCase().includes(textoBusqueda) ||
        p.codigo.toLowerCase().includes(textoBusqueda) ||
        (p.codigoBarras && p.codigoBarras.toLowerCase().includes(textoBusqueda)))
  );

  function stockEnBodegaOrigen(p: Producto): number {
    return p.stockPorBodega.find((s) => s.bodegaId === bodegaOrigenId)?.cantidad ?? 0;
  }

  const { data: respuestaTraslados, isLoading: cargandoTraslados } = useQuery({
    queryKey: ["traslados", pagina],
    queryFn: async () =>
      (await api.get<RespuestaPaginada<Traslado>>("/traslados", { params: { page: pagina, pageSize: TAMANO_PAGINA } })).data,
    placeholderData: keepPreviousData,
  });
  const traslados = respuestaTraslados?.datos;

  function agregarAlCarrito(producto: Producto) {
    setCarrito((actual) => {
      if (actual.some((item) => item.producto.id === producto.id)) return actual;
      return [...actual, { producto, cantidad: 1 }];
    });
  }

  function cambiarCantidad(productoId: number, cantidad: number) {
    setCarrito((actual) =>
      actual.map((item) => (item.producto.id === productoId ? { ...item, cantidad: Math.max(1, Math.trunc(cantidad) || 1) } : item))
    );
  }

  function quitarDelCarrito(productoId: number) {
    setCarrito((actual) => actual.filter((item) => item.producto.id !== productoId));
  }

  const carritoValido = carrito.length > 0 && carrito.every((item) => item.cantidad > 0 && item.cantidad <= stockEnBodegaOrigen(item.producto));

  const registrarTraslado = useMutation({
    mutationFn: async () =>
      api.post("/traslados", {
        bodegaOrigenId,
        bodegaDestinoId,
        motivo: motivo || undefined,
        items: carrito.map((item) => ({ productoId: item.producto.id, cantidad: item.cantidad })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["traslados"] });
      queryClient.invalidateQueries({ queryKey: ["productos"] }); // el stock por bodega/sucursal cambió
      setCarrito([]);
      setMotivo("");
      mostrarToast("Traslado registrado", "success");
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al registrar el traslado"),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Traslado entre bodegas</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">Productos (sin lote)</h3>
            <input
              type="text"
              placeholder="Buscar por nombre o código..."
              value={busquedaProducto}
              onChange={(e) => setBusquedaProducto(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm w-full mb-3"
            />
            {productosFiltrados?.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-gray-500">Sin resultados</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {productosFiltrados?.map((p) => (
                <button
                  key={p.id}
                  onClick={() => agregarAlCarrito(p)}
                  disabled={!bodegaOrigenId || stockEnBodegaOrigen(p) <= 0}
                  className="flex items-center gap-3 text-left border border-gray-200 dark:border-gray-700 rounded-md p-3 hover:border-slate-400 dark:hover:border-slate-500 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:hover:border-gray-200"
                >
                  <ImagenProducto producto={p} tamano={40} />
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{p.nombre}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {bodegaOrigenId ? `Stock en esa bodega: ${stockEnBodegaOrigen(p)}` : "Elige una bodega de origen"}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 flex flex-col">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">Datos del traslado</h3>

            <div className="text-sm mb-3">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Desde (tu sucursal)</label>
              <p className="border border-gray-200 dark:border-gray-700 rounded-md px-3 py-2 bg-gray-50 dark:bg-gray-900/40 text-gray-700 dark:text-gray-300">
                {miSucursal?.nombre ?? "Tu usuario no tiene sucursal asignada"}
              </p>
            </div>

            <select
              value={bodegaOrigenId}
              onChange={(e) => {
                setBodegaOrigenId(e.target.value ? Number(e.target.value) : "");
                setCarrito([]);
              }}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm mb-3"
            >
              <option value="">Bodega de origen...</option>
              {bodegasOrigen?.map((b) => (
                <option key={b.id} value={b.id}>{b.nombre}</option>
              ))}
            </select>

            <select
              value={bodegaDestinoId}
              onChange={(e) => setBodegaDestinoId(e.target.value ? Number(e.target.value) : "")}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm mb-3"
            >
              <option value="">Bodega de destino...</option>
              {sucursales?.map((s) => {
                const bodegasDeEsaSucursal = bodegasDestinoPorSucursal.get(s.id);
                if (!bodegasDeEsaSucursal || bodegasDeEsaSucursal.length === 0) return null;
                return (
                  <optgroup key={s.id} label={s.nombre}>
                    {bodegasDeEsaSucursal.map((b) => (
                      <option key={b.id} value={b.id}>{b.nombre}</option>
                    ))}
                  </optgroup>
                );
              })}
            </select>

            <input
              type="text"
              placeholder="Motivo (opcional)"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm mb-3"
            />

            <div className="flex-1 space-y-3 mb-3">
              {carrito.length === 0 && <p className="text-sm text-gray-400 dark:text-gray-500">Sin productos agregados</p>}
              {carrito.map((item) => (
                <div key={item.producto.id} className="border-b border-gray-100 dark:border-gray-700 pb-2">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <p className="font-medium text-gray-800 dark:text-gray-100">{item.producto.nombre}</p>
                    <button
                      onClick={() => quitarDelCarrito(item.producto.id)}
                      className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                    >
                      ✕
                    </button>
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 dark:text-gray-400">
                      Cantidad (máx. {stockEnBodegaOrigen(item.producto)})
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={stockEnBodegaOrigen(item.producto)}
                      value={item.cantidad}
                      onChange={(e) => cambiarCantidad(item.producto.id, Number(e.target.value))}
                      className="w-20 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-1 py-1 text-center text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
              <button
                onClick={() => registrarTraslado.mutate()}
                disabled={!carritoValido || !bodegaOrigenId || !bodegaDestinoId || registrarTraslado.isPending}
                className="w-full bg-emerald-600 text-white py-2 rounded-md text-sm font-medium hover:bg-emerald-700 disabled:opacity-40"
              >
                {registrarTraslado.isPending ? "Registrando..." : "Registrar traslado"}
              </button>
              {registrarTraslado.isError && (
                <p className="text-red-600 dark:text-red-400 text-sm mt-2">
                  {(registrarTraslado.error as any)?.response?.data?.error ?? "Error al registrar el traslado"}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Historial de traslados</h2>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
              <tr>
                <th className="px-4 py-2">Fecha</th>
                <th className="px-4 py-2">De</th>
                <th className="px-4 py-2">A</th>
                <th className="px-4 py-2">Usuario</th>
                <th className="px-4 py-2">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {cargandoTraslados && (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">Cargando...</td>
                </tr>
              )}
              {!cargandoTraslados && traslados?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">No hay traslados registrados</td>
                </tr>
              )}
              {traslados?.map((t) => (
                <tr key={t.id} className="border-t border-gray-100 dark:border-gray-700">
                  <td className="px-4 py-2">{new Date(t.createdAt).toLocaleDateString("es-EC")}</td>
                  <td className="px-4 py-2">{t.bodegaOrigen.nombre} <span className="text-gray-400 dark:text-gray-500 text-xs">({t.sucursalOrigen.nombre})</span></td>
                  <td className="px-4 py-2">{t.bodegaDestino.nombre} <span className="text-gray-400 dark:text-gray-500 text-xs">({t.sucursalDestino.nombre})</span></td>
                  <td className="px-4 py-2">{t.usuario?.nombre ?? "—"}</td>
                  <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{t.motivo ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {respuestaTraslados && (
            <Paginacion
              page={respuestaTraslados.paginacion.page}
              totalPaginas={respuestaTraslados.paginacion.totalPaginas}
              total={respuestaTraslados.paginacion.total}
              onCambiarPagina={setPagina}
            />
          )}
        </div>
      </div>
    </div>
  );
}
