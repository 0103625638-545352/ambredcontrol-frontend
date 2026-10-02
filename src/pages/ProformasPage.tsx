import { useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api, abrirPdfEnNuevaPestana, type Producto, type Cliente, type Proforma, type ProformaConDetalle } from "../api/client";
import { BuscadorCliente } from "../components/BuscadorCliente";
import { EstadoBadge } from "../components/EstadoBadge";
import { Paginacion } from "../components/Paginacion";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmProvider";
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
  CuadroTotales,
  FilaTotal,
  BotonConfirmar,
  MensajeError,
  SeccionListado,
  fechaHoy,
  Resaltar,
} from "../components/FormatoDocumento";
import {
  useFiltrosListado,
  BarraBuscadorDocumentos,
  PieResumenListado,
  type RespuestaConResumen,
} from "../components/BuscadorDocumentos";

const TAMANO_PAGINA = 20;

interface ItemProforma {
  producto: Producto;
  cantidad: number;
}

export function ProformasPage() {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const confirmar = useConfirm();
  const [carrito, setCarrito] = useState<ItemProforma[]>([]);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [clienteId, setClienteId] = useState<number | "">("");
  // Solo se usa para estimar el precio en pantalla (según la categoría de
  // precio del cliente) — el monto real lo calcula el backend.
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);
  const [validaHasta, setValidaHasta] = useState("");
  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [pagina, setPagina] = useState(1);
  // Buscador dinámico del listado (ver components/BuscadorDocumentos.tsx).
  const filtros = useFiltrosListado(setPagina);

  const { data: productos } = useQuery({
    queryKey: ["productos"],
    queryFn: async () => (await api.get<Producto[]>("/productos")).data,
  });
  const textoBusqueda = busquedaProducto.trim().toLowerCase();
  const productosFiltrados = productos?.filter(
    (p) =>
      !textoBusqueda ||
      p.nombre.toLowerCase().includes(textoBusqueda) ||
      p.codigo.toLowerCase().includes(textoBusqueda) ||
      (p.codigoBarras && p.codigoBarras.toLowerCase().includes(textoBusqueda))
  );

  const { data: respuestaProformas, isLoading: cargandoProformas } = useQuery({
    queryKey: ["proformas", pagina, ...filtros.clave],
    queryFn: async () =>
      (await api.get<RespuestaConResumen<Proforma>>("/proformas", { params: { page: pagina, pageSize: TAMANO_PAGINA, ...filtros.params } })).data,
    placeholderData: keepPreviousData,
  });
  const proformas = respuestaProformas?.datos;

  function agregarAlCarrito(producto: Producto) {
    setCarrito((actual) => {
      if (actual.some((item) => item.producto.id === producto.id)) return actual;
      return [...actual, { producto, cantidad: 1 }];
    });
  }

  function cambiarCantidad(productoId: number, cantidad: number) {
    // Una proforma NO reserva stock: no limitamos la cantidad al stock actual
    // (se puede cotizar más de lo que hay hoy, pensando en un reabastecimiento).
    setCarrito((actual) =>
      actual.map((item) => (item.producto.id === productoId ? { ...item, cantidad: Math.max(1, Math.trunc(cantidad) || 1) } : item))
    );
  }

  function quitarDelCarrito(productoId: number) {
    setCarrito((actual) => actual.filter((item) => item.producto.id !== productoId));
  }

  // Precio a MOSTRAR según la categoría de precio del cliente elegido —
  // costoPromedioActual × (1 + %/100), mismo cálculo que el backend (ver
  // utils/precios.ts) — el precio real que se cotiza siempre lo decide el
  // backend (ver POST /proformas), esto es solo para que la pantalla no
  // muestre un total distinto al del PDF/factura final. null = el producto
  // todavía no tiene costo conocido.
  function precioMostrado(producto: Producto): number | null {
    if (!producto.costoPromedioActual || !clienteSeleccionado?.tipoPrecio) return null;
    return Number(producto.costoPromedioActual) * (1 + Number(clienteSeleccionado.tipoPrecio.porcentajeGanancia) / 100);
  }

  const totalCarrito = carrito.reduce((acumulado, item) => {
    const precioUnitario = precioMostrado(item.producto) ?? 0;
    const subtotalItem = precioUnitario * item.cantidad;
    const ivaPorcentaje = parseFloat(item.producto.ivaPorcentaje);
    return acumulado + subtotalItem + subtotalItem * (ivaPorcentaje / 100);
  }, 0);

  const crearProforma = useMutation({
    mutationFn: async () => {
      return api.post("/proformas", {
        clienteId,
        items: carrito.map((item) => ({ productoId: item.producto.id, cantidad: item.cantidad })),
        validaHasta: validaHasta || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proformas"] });
      setCarrito([]);
      setClienteId("");
      setClienteSeleccionado(null);
      setValidaHasta("");
    },
  });

  const editarProforma = useMutation({
    mutationFn: async () => {
      return api.put(`/proformas/${editandoId}`, {
        clienteId,
        items: carrito.map((item) => ({ productoId: item.producto.id, cantidad: item.cantidad })),
        validaHasta: validaHasta || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proformas"] });
      setCarrito([]);
      setClienteId("");
      setClienteSeleccionado(null);
      setValidaHasta("");
      setEditandoId(null);
    },
  });

  async function iniciarEdicion(p: Proforma) {
    const { data: proforma } = await api.get<ProformaConDetalle>(`/proformas/${p.id}`);
    setCarrito(proforma.detalles.map((d) => ({ producto: d.producto, cantidad: d.cantidad })));
    setClienteId(proforma.cliente.id);
    setClienteSeleccionado(proforma.cliente);
    setValidaHasta(proforma.validaHasta ? proforma.validaHasta.slice(0, 10) : "");
    setEditandoId(proforma.id);
  }

  function cancelarEdicion() {
    setCarrito([]);
    setClienteId("");
    setClienteSeleccionado(null);
    setValidaHasta("");
    setEditandoId(null);
  }

  const anularProforma = useMutation({
    mutationFn: async (id: number) => api.patch(`/proformas/${id}/anular`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["proformas"] }),
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al anular la proforma"),
  });

  const convertirAFactura = useMutation({
    mutationFn: async (id: number) => api.post(`/proformas/${id}/convertir-factura`),
    onSuccess: (respuesta) => {
      queryClient.invalidateQueries({ queryKey: ["proformas"] });
      queryClient.invalidateQueries({ queryKey: ["productos"] });
      queryClient.invalidateQueries({ queryKey: ["facturas"] });
      mostrarToast(`Convertida en factura ${respuesta.data.secuencial}`, "success");
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al convertir a factura"),
  });

  const convertirANotaVenta = useMutation({
    mutationFn: async (id: number) => api.post(`/proformas/${id}/convertir-nota-venta`, { aplicaIva: false }),
    onSuccess: (respuesta) => {
      queryClient.invalidateQueries({ queryKey: ["proformas"] });
      queryClient.invalidateQueries({ queryKey: ["productos"] });
      queryClient.invalidateQueries({ queryKey: ["notas-venta"] });
      mostrarToast(`Convertida en nota de venta ${respuesta.data.secuencial}`, "success");
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al convertir a nota de venta"),
  });

  async function confirmarAnulacion(p: Proforma) {
    const ok = await confirmar(`¿Anular la proforma ${p.secuencial}? Esta acción no se puede deshacer.`);
    if (ok) anularProforma.mutate(p.id);
  }

  async function confirmarConvertirFactura(p: Proforma) {
    const ok = await confirmar(
      `¿Convertir la proforma ${p.secuencial} en una factura? Se validará y descontará el stock con el precio actual de cada producto.`
    );
    if (ok) convertirAFactura.mutate(p.id);
  }

  async function confirmarConvertirNotaVenta(p: Proforma) {
    const ok = await confirmar(
      `¿Convertir la proforma ${p.secuencial} en una nota de venta (sin IVA)? Se validará y descontará el stock con el precio actual de cada producto.`
    );
    if (ok) convertirANotaVenta.mutate(p.id);
  }

  // Desglose por tarifa de IVA, como el RIDE — misma estimación que
  // totalCarrito, solo separada para mostrarla.
  const subtotalPorTarifa = carrito.reduce<Record<number, number>>((acumulado, item) => {
    const tarifa = parseFloat(item.producto.ivaPorcentaje);
    acumulado[tarifa] = (acumulado[tarifa] ?? 0) + (precioMostrado(item.producto) ?? 0) * item.cantidad;
    return acumulado;
  }, {});
  const tarifasConIva = Object.keys(subtotalPorTarifa)
    .map(Number)
    .filter((t) => t > 0)
    .sort((a, b) => b - a);
  const guardando = crearProforma.isPending || editarProforma.isPending;
  const errorGuardar = editandoId !== null ? editarProforma.error : crearProforma.error;

  return (
    <div className="space-y-6">
      <MarcoDocumento
        titulo={editandoId !== null ? "Editar proforma" : "Nueva proforma"}
        sello={
          <>
            <ConteoItems cantidad={carrito.length} />
            {editandoId !== null ? <Sello tono="marca">Editando</Sello> : <Sello>Borrador</Sello>}
          </>
        }
        aviso="Cotización con el mismo formato de una factura, pero no es un comprobante electrónico y no descuenta stock."
      >
        <CabeceraDocumento>
          <EtiquetaCabecera>Cliente</EtiquetaCabecera>
          <div className="col-span-3 [&>div]:mb-0">
            <BuscadorCliente
              clienteId={clienteId}
              onSeleccionar={(id, cliente) => {
                setClienteId(id);
                setClienteSeleccionado(cliente ?? null);
              }}
            />
          </div>

          <EtiquetaCabecera>Tipo de precio</EtiquetaCabecera>
          <div className={CLASE_SOLO_LECTURA}>
            {clienteSeleccionado?.tipoPrecio
              ? `${clienteSeleccionado.tipoPrecio.nombre} (+${Number(clienteSeleccionado.tipoPrecio.porcentajeGanancia)}%)`
              : "—"}
          </div>
          <EtiquetaCabecera>Fecha emisión</EtiquetaCabecera>
          <div className={`${CLASE_SOLO_LECTURA} font-mono`}>{fechaHoy()}</div>

          <EtiquetaCabecera>Válida hasta</EtiquetaCabecera>
          <input type="date" value={validaHasta} onChange={(e) => setValidaHasta(e.target.value)} className={CLASE_CAMPO} />
        </CabeceraDocumento>

        <BuscadorProductosDocumento
          busqueda={busquedaProducto}
          onBusqueda={setBusquedaProducto}
          productos={productosFiltrados}
          onElegir={(p) => {
            agregarAlCarrito(p);
            setBusquedaProducto("");
          }}
          infoDerecha={(p) => {
            const precio = precioMostrado(p);
            return precio !== null ? precio.toFixed(2) : "Sin costo";
          }}
          aviso={!clienteSeleccionado ? "Elige primero el cliente para ver los precios de su categoría." : undefined}
        />

        <DetalleDocumento>
          <thead>
            <tr className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700">
              <th className={`${CLASE_TH} w-10`}>#</th>
              <th className={`${CLASE_TH} w-32`}>Código</th>
              <th className={CLASE_TH}>Descripción</th>
              <th className={`${CLASE_TH} w-24 text-right`}>Cantidad</th>
              <th className={`${CLASE_TH} w-28 text-right`}>Precio unit.</th>
              <th className={`${CLASE_TH} w-16 text-right`}>IVA</th>
              <th className={`${CLASE_TH} w-28 text-right`}>Subtotal</th>
              <th className={`${CLASE_TH} w-10`}></th>
            </tr>
          </thead>
          <tbody>
            {carrito.length === 0 && (
              <FilaDetalleVacia columnas={8}>Agrega productos con el buscador o el catálogo.</FilaDetalleVacia>
            )}
            {carrito.map((item, indice) => {
              const precio = precioMostrado(item.producto);
              return (
                <tr key={item.producto.id} className="border-b border-stone-100 dark:border-gray-700/60 last:border-b-0">
                  <td className="px-3 py-1.5 font-mono text-xs text-gray-400">{indice + 1}</td>
                  <td className="px-3 py-1.5 font-mono text-xs text-gray-600 dark:text-gray-300">{item.producto.codigo}</td>
                  <td className="px-3 py-1.5 text-gray-800 dark:text-gray-100 uppercase text-[13px]">{item.producto.nombre}</td>
                  <td className="px-3 py-1 text-right">
                    <input
                      type="number"
                      min={1}
                      value={item.cantidad}
                      onChange={(e) => cambiarCantidad(item.producto.id, Number(e.target.value))}
                      className={`${CLASE_CAMPO_CELDA} w-16`}
                    />
                  </td>
                  <td className="px-3 py-1.5 font-mono text-right tabular-nums">
                    {precio !== null ? (
                      precio.toFixed(4)
                    ) : (
                      <span className="text-red-600 dark:text-red-400 font-sans text-xs">Sin costo</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-right text-gray-500 dark:text-gray-400">
                    {Number(item.producto.ivaPorcentaje)}%
                  </td>
                  <td className="px-3 py-1.5 font-mono text-right tabular-nums font-medium text-gray-900 dark:text-gray-50">
                    {((precio ?? 0) * item.cantidad).toFixed(2)}
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
          <p className="text-xs text-gray-400 dark:text-gray-500 lg:pt-2">
            El precio se toma de la categoría de precio del cliente. Al convertirla en factura o nota de venta se
            recalcula con el costo vigente de cada producto.
          </p>
          <div className="space-y-3">
            <CuadroTotales total={totalCarrito}>
              {tarifasConIva.map((tarifa) => (
                <FilaTotal key={`sub-${tarifa}`} etiqueta={`Subtotal ${tarifa}%`} valor={subtotalPorTarifa[tarifa]} />
              ))}
              {tarifasConIva.length === 0 && <FilaTotal etiqueta="Subtotal gravado" valor={0} />}
              <FilaTotal etiqueta="Subtotal 0%" valor={subtotalPorTarifa[0] ?? 0} />
              {tarifasConIva.map((tarifa) => (
                <FilaTotal key={`iva-${tarifa}`} etiqueta={`IVA ${tarifa}%`} valor={(subtotalPorTarifa[tarifa] * tarifa) / 100} />
              ))}
            </CuadroTotales>
            <BotonConfirmar
              onClick={() => (editandoId !== null ? editarProforma.mutate() : crearProforma.mutate())}
              disabled={carrito.length === 0 || !clienteId || guardando}
            >
              {editandoId !== null
                ? editarProforma.isPending
                  ? "Guardando..."
                  : "Guardar cambios"
                : crearProforma.isPending
                  ? "Generando..."
                  : "Generar proforma"}
            </BotonConfirmar>
            {editandoId !== null && (
              <button
                onClick={cancelarEdicion}
                className="w-full font-mono text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                Cancelar edición
              </button>
            )}
            {(editandoId !== null ? editarProforma.isError : crearProforma.isError) && (
              <MensajeError>{(errorGuardar as any)?.response?.data?.error ?? "Error al guardar la proforma"}</MensajeError>
            )}
          </div>
        </div>
      </MarcoDocumento>

      <SeccionListado titulo="Historial de proformas">
        <BarraBuscadorDocumentos
          filtros={filtros}
          etiquetaBusqueda="Buscar · número, cliente o cédula/RUC"
          placeholder="Ej: 000000045, Tornillo..."
          opcionesEstado={[{ valor: "CREADA", etiqueta: "Vigente" }, { valor: "CONVERTIDA", etiqueta: "Convertida" }, { valor: "ANULADA", etiqueta: "Anulada" }]}
          mostrarPago={false}
        />
          <table className="w-full text-sm">
            <thead className={CLASE_THEAD}>
              <tr>
                <th className="px-4 py-2">No.</th>
                <th className="px-4 py-2">Cliente</th>
                <th className="px-4 py-2">Fecha</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {cargandoProformas && (
                <tr>
                  <td colSpan={6} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">Cargando...</td>
                </tr>
              )}
              {!cargandoProformas && proformas?.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">{filtros.hayFiltros ? "Ningún documento coincide con la búsqueda." : "No hay proformas registradas"}</td>
                </tr>
              )}
              {proformas?.map((p) => (
                <tr key={p.id} className="border-t border-stone-100 dark:border-gray-700 hover:bg-stone-50 dark:hover:bg-gray-700/30">
                  <td className="px-4 py-2 font-mono text-xs"><Resaltar texto={p.secuencial} termino={filtros.busquedaAplicada} /></td>
                  <td className="px-4 py-2"><Resaltar texto={p.cliente.razonSocial} termino={filtros.busquedaAplicada} /></td>
                  <td className="px-4 py-2">{new Date(p.fechaEmision).toLocaleDateString("es-EC")}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{p.total}</td>
                  <td className="px-4 py-2">
                    <EstadoBadge estado={p.estado} />
                    {p.estado === "CONVERTIDA" && (
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                        → {p.facturaConvertida ? `Factura ${p.facturaConvertida.secuencial}` : p.notaVentaConvertida ? `Nota de venta ${p.notaVentaConvertida.secuencial}` : ""}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right space-x-3">
                    <button
                      onClick={() => abrirPdfEnNuevaPestana(`/proformas/${p.id}/pdf`)}
                      className="text-brand-700 dark:text-brand-300 hover:underline text-xs font-medium"
                    >
                      Ver PDF
                    </button>
                    {p.estado === "CREADA" && (
                      <>
                        <button
                          onClick={() => iniciarEdicion(p)}
                          className="text-brand-700 dark:text-brand-300 hover:underline text-xs font-medium"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => confirmarConvertirFactura(p)}
                          className="text-emerald-700 dark:text-emerald-400 hover:underline text-xs font-medium"
                        >
                          Convertir a factura
                        </button>
                        <button
                          onClick={() => confirmarConvertirNotaVenta(p)}
                          className="text-emerald-700 dark:text-emerald-400 hover:underline text-xs font-medium"
                        >
                          Convertir a nota de venta
                        </button>
                        <button
                          onClick={() => confirmarAnulacion(p)}
                          className="text-red-600 dark:text-red-400 hover:underline text-xs font-medium"
                        >
                          Anular
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <PieResumenListado resumen={respuestaProformas?.resumen} hayFiltros={filtros.hayFiltros} />
          {respuestaProformas && (
            <Paginacion
              page={respuestaProformas.paginacion.page}
              totalPaginas={respuestaProformas.paginacion.totalPaginas}
              total={respuestaProformas.paginacion.total}
              onCambiarPagina={setPagina}
            />
          )}
      </SeccionListado>
    </div>
  );
}
