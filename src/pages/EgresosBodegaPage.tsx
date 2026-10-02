import { useState, useEffect, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Empleado, type Producto, type NumeroSerieProducto, type EgresoBodega, type EstadoEgresoBodegaDetalle } from "../api/client";
import { BuscadorCliente } from "../components/BuscadorCliente";
import { useToast } from "../components/ToastProvider";
import {
  CLASE_CAMPO,
  CLASE_SOLO_LECTURA,
  CLASE_ETIQUETA,
  CLASE_TH,
  CLASE_THEAD,
  MarcoDocumento,
  Sello,
  ConteoItems,
  CabeceraDocumento,
  EtiquetaCabecera,
  DetalleDocumento,
  FilaDetalleVacia,
  BotonConfirmar,
  BotonSecundario,
  fechaHoy,
  Resaltar,
} from "../components/FormatoDocumento";
import { useFiltrosListado, BarraBuscadorDocumentos } from "../components/BuscadorDocumentos";

// Este listado no pagina (trae todos los egresos que coinciden), así que el
// buscador no tiene página a la que volver.
function sinPaginacion() {}


interface ItemCarrito {
  numeroSerieProductoId: number;
  numeroSerie: string;
  productoNombre: string;
}

// Documento de egreso de bodega: lo que la bodeguera arma a primera hora
// del día para despacharle a un técnico los equipos puntuales (por número
// de serie) que va a llevar a sus visitas — ver el comentario del módulo en
// backend/prisma/schema.prisma (EgresoBodega). No mueve stock: es una
// bitácora de custodia física (quién tiene cada unidad ahora mismo), no una
// transacción de inventario — el equipo ya se contabilizó al comprarlo, y
// se vuelve a tocar recién si/cuando se factura de verdad.
export function EgresosBodegaPage() {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();

  const [mostrarForm, setMostrarForm] = useState(false);
  const [empleadoId, setEmpleadoId] = useState("");
  const [clienteDestinoId, setClienteDestinoId] = useState<number | "">("");
  const [observaciones, setObservaciones] = useState("");
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);

  const [productoElegidoId, setProductoElegidoId] = useState("");
  const [seriesElegidas, setSeriesElegidas] = useState<Set<number>>(new Set());

  const [expandidoId, setExpandidoId] = useState<number | null>(null);
  const [devolviendoId, setDevolviendoId] = useState<number | null>(null);
  const [imprimiendoId, setImprimiendoId] = useState<number | null>(null);

  const { data: empleados } = useQuery({
    queryKey: ["empleados-activos"],
    queryFn: async () => (await api.get<Empleado[]>("/empleados")).data.filter((e) => e.activo),
  });

  const { data: productos } = useQuery({
    queryKey: ["productos-con-serie"],
    // GET /productos ya filtra activo:true por su cuenta (ver routes/productos.ts).
    queryFn: async () => (await api.get<Producto[]>("/productos")).data.filter((p) => p.controlaNumeroSerie),
  });

  const { data: seriesDisponibles, isFetching: cargandoSeries } = useQuery({
    queryKey: ["series-en-bodega", productoElegidoId],
    queryFn: async () =>
      (await api.get<NumeroSerieProducto[]>(`/productos/${productoElegidoId}/series`, { params: { estado: "EN_BODEGA" } })).data,
    enabled: !!productoElegidoId,
  });

  // Buscador dinámico del listado (ver components/BuscadorDocumentos.tsx).
  const filtros = useFiltrosListado(sinPaginacion);

  const { data: egresos, isLoading: cargandoEgresos } = useQuery({
    queryKey: ["egresos-bodega", ...filtros.clave],
    queryFn: async () => (await api.get<EgresoBodega[]>("/egresos-bodega", { params: filtros.params })).data,
  });

  const crear = useMutation({
    mutationFn: async () =>
      api.post("/egresos-bodega", {
        empleadoId: Number(empleadoId),
        clienteDestinoId: clienteDestinoId || undefined,
        observaciones: observaciones || undefined,
        numerosSerieProductoIds: carrito.map((c) => c.numeroSerieProductoId),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["egresos-bodega"] });
      queryClient.invalidateQueries({ queryKey: ["series-en-bodega"] });
      mostrarToast("Egreso de bodega creado", "success");
      setMostrarForm(false);
      setEmpleadoId("");
      setClienteDestinoId("");
      setObservaciones("");
      setCarrito([]);
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "No se pudo crear el egreso"),
  });

  const devolver = useMutation({
    mutationFn: async (detalleId: number) => api.patch(`/egresos-bodega/detalles/${detalleId}/devolver`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["egresos-bodega"] });
      mostrarToast("Equipo devuelto a bodega", "success");
      setDevolviendoId(null);
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "No se pudo devolver el equipo"),
  });

  const nombreEmpresa = (() => {
    try {
      const guardado = localStorage.getItem("empresa");
      return guardado ? (JSON.parse(guardado).nombre as string) : "";
    } catch {
      return "";
    }
  })();

  const egresoImprimir = egresos?.find((e) => e.id === imprimiendoId);

  // Documento de respaldo físico del egreso: se imprime aparte (acotado por
  // ".imprimir-en-blanco", ver index.css), con espacio para que bodega y el
  // técnico firmen — es la constancia en papel de qué equipos salieron y
  // quién los recibió, más allá del registro en el sistema.
  useEffect(() => {
    if (imprimiendoId == null) return;
    document.body.classList.add("imprimiendo");
    window.print();
  }, [imprimiendoId]);

  useEffect(() => {
    const quitar = () => {
      document.body.classList.remove("imprimiendo");
      setImprimiendoId(null);
    };
    window.addEventListener("afterprint", quitar);
    return () => window.removeEventListener("afterprint", quitar);
  }, []);

  function agregarSeriesAlCarrito() {
    const producto = productos?.find((p) => p.id === Number(productoElegidoId));
    if (!producto || !seriesDisponibles) return;
    const nuevos = seriesDisponibles
      .filter((s) => seriesElegidas.has(s.id) && !carrito.some((c) => c.numeroSerieProductoId === s.id))
      .map((s) => ({ numeroSerieProductoId: s.id, numeroSerie: s.numeroSerie, productoNombre: producto.nombre }));
    setCarrito([...carrito, ...nuevos]);
    setSeriesElegidas(new Set());
    setProductoElegidoId("");
  }

  function quitarDelCarrito(id: number) {
    setCarrito(carrito.filter((c) => c.numeroSerieProductoId !== id));
  }

  const ETIQUETA_ESTADO_DETALLE: Record<EstadoEgresoBodegaDetalle, string> = {
    EN_TRANSITO: "En tránsito",
    ENTREGADO: "Entregado",
    DEVUELTO: "Devuelto",
  };
  const CLASE_ESTADO_DETALLE: Record<EstadoEgresoBodegaDetalle, string> = {
    EN_TRANSITO: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
    ENTREGADO: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
    DEVUELTO: "bg-stone-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400",
  };

  // Pie del listado (como el de Facturas): egresos y equipos que siguen
  // en manos de los técnicos (EN_TRANSITO), de lo filtrado.
  const equiposEnTransito = (egresos ?? []).reduce(
    (acumulado, eg) => acumulado + eg.detalles.filter((d) => d.estado === "EN_TRANSITO").length,
    0
  );
  const equiposTotales = (egresos ?? []).reduce((acumulado, eg) => acumulado + eg.detalles.length, 0);

  return (
    <div className="space-y-6">

      {mostrarForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (carrito.length === 0) return mostrarToast("Agregá al menos un equipo al egreso");
            crear.mutate();
          }}
        >
          <MarcoDocumento
            titulo="Nuevo egreso"
            sello={
              <>
                <ConteoItems cantidad={carrito.length} singular="equipo" plural="equipos" />
                <Sello>Borrador</Sello>
              </>
            }
            aviso="No mueve stock: registra quién tiene cada equipo. El técnico confirma la entrega desde el acta de la visita."
          >
            <CabeceraDocumento>
              <EtiquetaCabecera>Técnico</EtiquetaCabecera>
              <select required value={empleadoId} onChange={(e) => setEmpleadoId(e.target.value)} className={CLASE_CAMPO}>
                <option value="">Elegir técnico...</option>
                {empleados?.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.nombres} {emp.apellidos}
                  </option>
                ))}
              </select>
              <EtiquetaCabecera>Fecha</EtiquetaCabecera>
              <div className={`${CLASE_SOLO_LECTURA} font-mono`}>{fechaHoy()}</div>

              <EtiquetaCabecera>Cliente destino</EtiquetaCabecera>
              <div className="col-span-3 [&>div]:mb-0">
                <BuscadorCliente clienteId={clienteDestinoId} onSeleccionar={(id) => setClienteDestinoId(id)} />
              </div>

              <EtiquetaCabecera>Observaciones</EtiquetaCabecera>
              <input
                value={observaciones}
                placeholder="Opcional"
                onChange={(e) => setObservaciones(e.target.value)}
                className={`${CLASE_CAMPO} col-span-3`}
              />
            </CabeceraDocumento>

            {/* Línea de ingreso: producto con número de serie + las series en bodega */}
            <div className="mx-4 border border-stone-300 dark:border-gray-700 bg-stone-50 dark:bg-gray-900/40">
              <div className="flex items-end gap-2 p-2.5">
                <label className="flex flex-col gap-1 flex-1 min-w-0">
                  <span className={CLASE_ETIQUETA}>Agregar equipos · producto</span>
                  <select
                    value={productoElegidoId}
                    onChange={(e) => {
                      setProductoElegidoId(e.target.value);
                      setSeriesElegidas(new Set());
                    }}
                    className={CLASE_CAMPO}
                  >
                    <option value="">Elegir producto con número de serie...</option>
                    {productos?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                        {p.marca ? ` — ${p.marca}` : ""}
                        {p.modelo ? ` ${p.modelo}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={agregarSeriesAlCarrito}
                  disabled={seriesElegidas.size === 0}
                  className="bg-brand-700 text-white px-3 py-1.5 rounded-sm text-sm font-semibold hover:bg-brand-800 disabled:opacity-40"
                >
                  Agregar {seriesElegidas.size > 0 ? `${seriesElegidas.size} equipo(s)` : ""}
                </button>
              </div>

              {productoElegidoId && (
                <div className="border-t border-stone-300 dark:border-gray-700 bg-white dark:bg-gray-800 p-2.5">
                  {cargandoSeries && <p className="text-xs text-gray-400 dark:text-gray-500">Cargando series...</p>}
                  {!cargandoSeries && seriesDisponibles?.length === 0 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500">No hay ninguna unidad en bodega de este producto.</p>
                  )}
                  {!cargandoSeries && seriesDisponibles && seriesDisponibles.length > 0 && (
                    <>
                      <p className={`${CLASE_ETIQUETA} mb-1.5`}>Series en bodega · marca las que salen</p>
                      <div className="max-h-40 overflow-y-auto grid grid-cols-2 sm:grid-cols-4 gap-1">
                        {seriesDisponibles.map((s) => (
                          <label
                            key={s.id}
                            className={`flex items-center gap-1.5 text-xs border rounded-sm px-2 py-1 cursor-pointer ${
                              seriesElegidas.has(s.id)
                                ? "border-brand-600 bg-brand-50 dark:bg-brand-900/30 text-brand-800 dark:text-brand-200"
                                : "border-stone-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={seriesElegidas.has(s.id)}
                              onChange={(e) => {
                                const nuevo = new Set(seriesElegidas);
                                if (e.target.checked) nuevo.add(s.id);
                                else nuevo.delete(s.id);
                                setSeriesElegidas(nuevo);
                              }}
                            />
                            <span className="font-mono truncate">{s.numeroSerie}</span>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <DetalleDocumento>
              <thead>
                <tr className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700">
                  <th className={`${CLASE_TH} w-10`}>#</th>
                  <th className={CLASE_TH}>Producto</th>
                  <th className={`${CLASE_TH} w-64`}>N° de serie</th>
                  <th className={`${CLASE_TH} w-10`}></th>
                </tr>
              </thead>
              <tbody>
                {carrito.length === 0 && (
                  <FilaDetalleVacia columnas={4}>Elige un producto y marca las series que salen de bodega.</FilaDetalleVacia>
                )}
                {carrito.map((c, indice) => (
                  <tr key={c.numeroSerieProductoId} className="border-b border-stone-100 dark:border-gray-700/60 last:border-b-0">
                    <td className="px-3 py-1.5 font-mono text-xs text-gray-400">{indice + 1}</td>
                    <td className="px-3 py-1.5 text-gray-800 dark:text-gray-100 uppercase text-[13px]">{c.productoNombre}</td>
                    <td className="px-3 py-1.5 font-mono text-gray-700 dark:text-gray-200">{c.numeroSerie}</td>
                    <td className="px-2 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => quitarDelCarrito(c.numeroSerieProductoId)}
                        title="Quitar del egreso"
                        className="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DetalleDocumento>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4 p-4 items-start">
              <div />
              <BotonConfirmar type="submit" disabled={crear.isPending || carrito.length === 0}>
                {crear.isPending ? "Guardando..." : `Crear egreso (${carrito.length} equipo(s))`}
              </BotonConfirmar>
            </div>
          </MarcoDocumento>
        </form>
      )}

      <div className="bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-stone-300 dark:border-gray-700">
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-50">Egresos de bodega</h2>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-gray-400 dark:text-gray-500">
              {egresos ? `${egresos.length} egreso${egresos.length === 1 ? "" : "s"}` : ""}
            </span>
            <BotonSecundario onClick={() => setMostrarForm(!mostrarForm)}>
              {mostrarForm ? "Cancelar" : "+ Nuevo egreso"}
            </BotonSecundario>
          </div>
        </div>
        <div className="px-4 py-2 bg-stone-50 dark:bg-gray-900/40 border-b border-stone-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
          Despachá a un técnico los equipos puntuales (por número de serie) que va a llevar a sus visitas — al llegar donde el cliente, el
          técnico confirma la entrega desde el acta de la visita (o bodega puede cerrarla acá si vuelve sin usarlo).
        </div>
        <BarraBuscadorDocumentos
          filtros={filtros}
          etiquetaBusqueda="Buscar · técnico, cliente, n° de serie, equipo u observaciones"
          placeholder="Ej: Pérez, 48575443A1B2, ONU..."
          opcionesEstado={[
            { valor: "PENDIENTE", etiqueta: "Con equipos en tránsito" },
            { valor: "CERRADO", etiqueta: "Cerrado" },
          ]}
          mostrarPago={false}
        />
        <table className="w-full text-sm">
          <thead className={CLASE_THEAD}>
            <tr>
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Técnico</th>
              <th className="px-4 py-2">Cliente destino</th>
              <th className="px-4 py-2 text-right">Equipos</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {cargandoEgresos && (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">Cargando...</td>
              </tr>
            )}
            {!cargandoEgresos && egresos?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">{filtros.hayFiltros ? "Ningún documento coincide con la búsqueda." : "No hay egresos registrados todavía"}</td>
              </tr>
            )}
            {egresos?.map((eg) => {
              const enTransito = eg.detalles.filter((d) => d.estado === "EN_TRANSITO").length;
              return (
                <Fragment key={eg.id}>
                  <tr className="border-t border-stone-100 dark:border-gray-700 hover:bg-stone-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-2 whitespace-nowrap font-mono text-xs">{eg.createdAt.slice(0, 16).replace("T", " ")}</td>
                    <td className="px-4 py-2"><Resaltar texto={`${eg.empleado.nombres} ${eg.empleado.apellidos}`} termino={filtros.busquedaAplicada} /></td>
                    <td className="px-4 py-2">{eg.clienteDestino ? <Resaltar texto={eg.clienteDestino.razonSocial} termino={filtros.busquedaAplicada} /> : <span className="text-gray-400 dark:text-gray-500 italic">Sin definir</span>}</td>
                    <td className="px-4 py-2 text-right">
                      {eg.detalles.length}
                      {enTransito > 0 && <span className="ml-1 text-amber-600 dark:text-amber-400 text-xs">({enTransito} pendiente{enTransito === 1 ? "" : "s"})</span>}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button
                        onClick={() => setExpandidoId(expandidoId === eg.id ? null : eg.id)}
                        className="text-brand-700 dark:text-brand-300 hover:underline text-xs font-medium mr-3"
                      >
                        {expandidoId === eg.id ? "Ocultar" : "Ver detalle"}
                      </button>
                      <button
                        onClick={() => setImprimiendoId(eg.id)}
                        className="text-brand-700 dark:text-brand-300 hover:underline text-xs font-medium"
                      >
                        Imprimir
                      </button>
                    </td>
                  </tr>
                  {expandidoId === eg.id && (
                    <tr className="bg-stone-50 dark:bg-gray-700/40">
                      <td colSpan={5} className="px-4 py-3">
                        {eg.observaciones && <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Obs: {eg.observaciones}</p>}
                        <table className="w-full text-xs">
                          <thead className="text-left text-gray-500 dark:text-gray-400">
                            <tr>
                              <th className="pr-3 pb-1">Producto</th>
                              <th className="pr-3 pb-1">Serie</th>
                              <th className="pr-3 pb-1">Estado</th>
                              <th className="pr-3 pb-1">Cliente (si se entregó)</th>
                              <th className="pb-1"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {eg.detalles.map((d) => (
                              <tr key={d.id} className="border-t border-stone-300 dark:border-gray-600">
                                <td className="pr-3 py-1">
                                  {d.numeroSerieProducto.producto.nombre}
                                  {d.numeroSerieProducto.producto.marca && (
                                    <span className="text-gray-400 dark:text-gray-500"> ({d.numeroSerieProducto.producto.marca})</span>
                                  )}
                                </td>
                                <td className="pr-3 py-1 font-mono"><Resaltar texto={d.numeroSerieProducto.numeroSerie} termino={filtros.busquedaAplicada} /></td>
                                <td className="pr-3 py-1">
                                  <span className={`px-1.5 py-0.5 rounded-full font-medium ${CLASE_ESTADO_DETALLE[d.estado]}`}>
                                    {ETIQUETA_ESTADO_DETALLE[d.estado]}
                                  </span>
                                </td>
                                <td className="pr-3 py-1">{d.numeroSerieProducto.cliente?.razonSocial ?? "—"}</td>
                                <td className="py-1 text-right">
                                  {d.estado === "EN_TRANSITO" &&
                                    (devolviendoId === d.id ? (
                                      <span className="inline-flex items-center gap-2">
                                        <span className="text-red-600 dark:text-red-400">¿Seguro?</span>
                                        <button
                                          onClick={() => devolver.mutate(d.id)}
                                          disabled={devolver.isPending}
                                          className="text-red-600 dark:text-red-400 hover:underline font-medium disabled:opacity-50"
                                        >
                                          Sí, devolver
                                        </button>
                                        <button onClick={() => setDevolviendoId(null)} className="text-gray-500 dark:text-gray-400 hover:underline font-medium">
                                          No
                                        </button>
                                      </span>
                                    ) : (
                                      <button
                                        onClick={() => setDevolviendoId(d.id)}
                                        className="text-red-600 dark:text-red-400 hover:underline font-medium"
                                      >
                                        Devolver a bodega
                                      </button>
                                    ))}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {(egresos?.length ?? 0) > 0 && (
          <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 px-4 py-2.5 border-t-2 border-gray-900 dark:border-gray-200">
            <span className="font-mono text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {egresos?.length} egreso{egresos?.length === 1 ? "" : "s"} · {equiposTotales} equipo{equiposTotales === 1 ? "" : "s"}
              {filtros.hayFiltros ? " · según filtro" : ""}
            </span>
            <span className="text-sm font-bold text-gray-900 dark:text-gray-50">
              EQUIPOS EN TRÁNSITO <span className="font-mono tabular-nums ml-2">{equiposEnTransito}</span>
            </span>
          </div>
        )}
      </div>

      {egresoImprimir && (
        <div className="imprimir-en-blanco hidden print:block bg-white text-gray-900 p-8 text-sm">
          <div className="text-center mb-4">
            <p className="text-base font-bold uppercase">{nombreEmpresa}</p>
            <p className="text-lg font-bold uppercase mt-2">Egreso de Bodega N° {egresoImprimir.id}</p>
            <p className="text-xs text-gray-500">{new Date(egresoImprimir.createdAt).toLocaleString("es-EC")}</p>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
            <p><span className="font-semibold">Técnico:</span> {egresoImprimir.empleado.nombres} {egresoImprimir.empleado.apellidos}</p>
            <p><span className="font-semibold">Cliente destino:</span> {egresoImprimir.clienteDestino?.razonSocial ?? "No especificado"}</p>
            <p><span className="font-semibold">Entregado por:</span> {egresoImprimir.usuario?.nombre ?? "—"}</p>
            {egresoImprimir.observaciones && (
              <p className="col-span-2"><span className="font-semibold">Observaciones:</span> {egresoImprimir.observaciones}</p>
            )}
          </div>

          <table className="w-full text-xs border-collapse border border-gray-400 mb-10">
            <thead>
              <tr className="bg-stone-100">
                <th className="border border-gray-400 px-2 py-1 text-left">#</th>
                <th className="border border-gray-400 px-2 py-1 text-left">Producto</th>
                <th className="border border-gray-400 px-2 py-1 text-left">Marca</th>
                <th className="border border-gray-400 px-2 py-1 text-left">Modelo</th>
                <th className="border border-gray-400 px-2 py-1 text-left">N° Serie</th>
              </tr>
            </thead>
            <tbody>
              {egresoImprimir.detalles.map((d, i) => (
                <tr key={d.id}>
                  <td className="border border-gray-400 px-2 py-1">{i + 1}</td>
                  <td className="border border-gray-400 px-2 py-1">{d.numeroSerieProducto.producto.nombre}</td>
                  <td className="border border-gray-400 px-2 py-1">{d.numeroSerieProducto.producto.marca ?? "—"}</td>
                  <td className="border border-gray-400 px-2 py-1">{d.numeroSerieProducto.producto.modelo ?? "—"}</td>
                  <td className="border border-gray-400 px-2 py-1 font-mono">{d.numeroSerieProducto.numeroSerie}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="grid grid-cols-2 gap-8 mt-16 text-xs text-center">
            <div className="border-t border-gray-500 pt-1">Entrega bodega — {egresoImprimir.usuario?.nombre ?? ""}</div>
            <div className="border-t border-gray-500 pt-1">Recibe técnico — {egresoImprimir.empleado.nombres} {egresoImprimir.empleado.apellidos}</div>
          </div>
        </div>
      )}
    </div>
  );
}
