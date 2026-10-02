import { useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api, type Producto, type Sucursal, type Bodega, type Traslado } from "../api/client";
import { Paginacion } from "../components/Paginacion";
import { useToast } from "../components/ToastProvider";
import { useMiSucursal } from "../context/AuthContext";
import {
  CLASE_CAMPO,
  CLASE_SOLO_LECTURA,
  CLASE_TH,
  CLASE_THEAD,
  CLASE_CAMPO_CELDA,
  MarcoDocumento,
  Sello,
  ConteoItems,
  CabeceraDocumento,
  EtiquetaCabecera,
  BuscadorProductosDocumento,
  DetalleDocumento,
  FilaDetalleVacia,
  BotonConfirmar,
  MensajeError,
  SeccionListado,
  fechaHoy,
  Resaltar,
} from "../components/FormatoDocumento";
import {
  useFiltrosListado,
  BarraBuscadorDocumentos,
  type RespuestaConResumen,
} from "../components/BuscadorDocumentos";

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
  // Buscador dinámico del listado (ver components/BuscadorDocumentos.tsx).
  const filtros = useFiltrosListado(setPagina);

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
    queryKey: ["traslados", pagina, ...filtros.clave],
    queryFn: async () =>
      (await api.get<RespuestaConResumen<Traslado>>("/traslados", { params: { page: pagina, pageSize: TAMANO_PAGINA, ...filtros.params } })).data,
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

  const unidadesATrasladar = carrito.reduce((acumulado, item) => acumulado + item.cantidad, 0);

  return (
    <div className="space-y-6">
      <MarcoDocumento
        titulo="Traslado entre bodegas"
        sello={
          <>
            <ConteoItems cantidad={carrito.length} />
            <Sello>Borrador</Sello>
          </>
        }
        aviso="Solo productos sin lote. Puede ser dentro de tu sucursal o hacia una bodega de otra sucursal."
      >
        <CabeceraDocumento>
          <EtiquetaCabecera>Sucursal origen</EtiquetaCabecera>
          <div className={CLASE_SOLO_LECTURA}>{miSucursal?.nombre ?? "Tu usuario no tiene sucursal asignada"}</div>
          <EtiquetaCabecera>Fecha</EtiquetaCabecera>
          <div className={`${CLASE_SOLO_LECTURA} font-mono`}>{fechaHoy()}</div>

          <EtiquetaCabecera>Bodega origen</EtiquetaCabecera>
          <select
            value={bodegaOrigenId}
            onChange={(e) => {
              setBodegaOrigenId(e.target.value ? Number(e.target.value) : "");
              setCarrito([]);
            }}
            className={CLASE_CAMPO}
          >
            <option value="">Selecciona...</option>
            {bodegasOrigen?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nombre}
              </option>
            ))}
          </select>
          <EtiquetaCabecera>Bodega destino</EtiquetaCabecera>
          <select
            value={bodegaDestinoId}
            onChange={(e) => setBodegaDestinoId(e.target.value ? Number(e.target.value) : "")}
            className={CLASE_CAMPO}
          >
            <option value="">Selecciona...</option>
            {sucursales?.map((s) => {
              const bodegasDeEsaSucursal = bodegasDestinoPorSucursal.get(s.id);
              if (!bodegasDeEsaSucursal || bodegasDeEsaSucursal.length === 0) return null;
              return (
                <optgroup key={s.id} label={s.nombre}>
                  {bodegasDeEsaSucursal.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nombre}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>

          <EtiquetaCabecera>Motivo</EtiquetaCabecera>
          <input
            type="text"
            placeholder="Opcional"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            className={`${CLASE_CAMPO} col-span-3`}
          />
        </CabeceraDocumento>

        <BuscadorProductosDocumento
          busqueda={busquedaProducto}
          onBusqueda={setBusquedaProducto}
          productos={productosFiltrados}
          onElegir={(p) => {
            agregarAlCarrito(p);
            setBusquedaProducto("");
          }}
          deshabilitado={(p) => !bodegaOrigenId || stockEnBodegaOrigen(p) <= 0}
          infoDerecha={(p) => (bodegaOrigenId ? `Stock ${stockEnBodegaOrigen(p)}` : "")}
          aviso={!bodegaOrigenId ? "Elige primero la bodega de origen para ver su stock." : undefined}
        />

        <DetalleDocumento>
          <thead>
            <tr className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700">
              <th className={`${CLASE_TH} w-10`}>#</th>
              <th className={`${CLASE_TH} w-32`}>Código</th>
              <th className={CLASE_TH}>Descripción</th>
              <th className={`${CLASE_TH} w-28 text-right`}>Stock origen</th>
              <th className={`${CLASE_TH} w-28 text-right`}>A trasladar</th>
              <th className={`${CLASE_TH} w-10`}></th>
            </tr>
          </thead>
          <tbody>
            {carrito.length === 0 && (
              <FilaDetalleVacia columnas={6}>Agrega productos con el buscador o el catálogo.</FilaDetalleVacia>
            )}
            {carrito.map((item, indice) => {
              const stock = stockEnBodegaOrigen(item.producto);
              const excede = item.cantidad > stock;
              return (
                <tr key={item.producto.id} className="border-b border-stone-100 dark:border-gray-700/60 last:border-b-0">
                  <td className="px-3 py-1.5 font-mono text-xs text-gray-400">{indice + 1}</td>
                  <td className="px-3 py-1.5 font-mono text-xs text-gray-600 dark:text-gray-300">{item.producto.codigo}</td>
                  <td className="px-3 py-1.5 text-gray-800 dark:text-gray-100 uppercase text-[13px]">{item.producto.nombre}</td>
                  <td className="px-3 py-1.5 font-mono text-right text-gray-500 dark:text-gray-400">{stock}</td>
                  <td className="px-3 py-1 text-right">
                    <input
                      type="number"
                      min={1}
                      max={stock}
                      value={item.cantidad}
                      onChange={(e) => cambiarCantidad(item.producto.id, Number(e.target.value))}
                      title={excede ? `Máximo ${stock}` : undefined}
                      className={`${CLASE_CAMPO_CELDA} w-20 ${excede ? "border-red-500 text-red-700 dark:text-red-400" : ""}`}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <button
                      onClick={() => quitarDelCarrito(item.producto.id)}
                      title="Quitar del detalle"
                      className="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                    >
                      ✕
                    </button>
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
              <div className="flex justify-between px-3 py-1.5 text-gray-700 dark:text-gray-300">
                <span>Productos</span>
                <span className="font-mono tabular-nums">{carrito.length}</span>
              </div>
              <div className="flex justify-between px-3 py-2.5 border-t-2 border-gray-900 dark:border-gray-200 font-bold text-base text-gray-900 dark:text-gray-50">
                <span>UNIDADES</span>
                <span className="font-mono tabular-nums">{unidadesATrasladar}</span>
              </div>
            </div>
            <BotonConfirmar
              onClick={() => registrarTraslado.mutate()}
              disabled={!carritoValido || !bodegaOrigenId || !bodegaDestinoId || registrarTraslado.isPending}
            >
              {registrarTraslado.isPending ? "Registrando..." : "Registrar traslado"}
            </BotonConfirmar>
            {registrarTraslado.isError && (
              <MensajeError>
                {(registrarTraslado.error as any)?.response?.data?.error ?? "Error al registrar el traslado"}
              </MensajeError>
            )}
          </div>
        </div>
      </MarcoDocumento>

      <SeccionListado titulo="Historial de traslados">
        <BarraBuscadorDocumentos
          filtros={filtros}
          etiquetaBusqueda="Buscar · bodega, sucursal, producto, usuario o motivo"
          placeholder="Ej: Bodega principal, cable UTP..."
          mostrarPago={false}
        />
          <table className="w-full text-sm">
            <thead className={CLASE_THEAD}>
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
                  <td colSpan={5} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">{filtros.hayFiltros ? "Ningún documento coincide con la búsqueda." : "No hay traslados registrados"}</td>
                </tr>
              )}
              {traslados?.map((t) => (
                <tr key={t.id} className="border-t border-stone-100 dark:border-gray-700 hover:bg-stone-50 dark:hover:bg-gray-700/30">
                  <td className="px-4 py-2">{new Date(t.createdAt).toLocaleDateString("es-EC")}</td>
                  <td className="px-4 py-2">{t.bodegaOrigen.nombre} <span className="text-gray-400 dark:text-gray-500 text-xs">({t.sucursalOrigen.nombre})</span></td>
                  <td className="px-4 py-2">{t.bodegaDestino.nombre} <span className="text-gray-400 dark:text-gray-500 text-xs">({t.sucursalDestino.nombre})</span></td>
                  <td className="px-4 py-2"><Resaltar texto={t.usuario?.nombre ?? "—"} termino={filtros.busquedaAplicada} /></td>
                  <td className="px-4 py-2 text-gray-500 dark:text-gray-400"><Resaltar texto={t.motivo ?? "—"} termino={filtros.busquedaAplicada} /></td>
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
      </SeccionListado>
    </div>
  );
}
