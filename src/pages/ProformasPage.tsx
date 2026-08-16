import { useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api, abrirPdfEnNuevaPestana, type Producto, type Cliente, type Proforma, type ProformaConDetalle, type RespuestaPaginada } from "../api/client";
import { ImagenProducto } from "../components/ImagenProducto";
import { BuscadorCliente } from "../components/BuscadorCliente";
import { EstadoBadge } from "../components/EstadoBadge";
import { Paginacion } from "../components/Paginacion";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmProvider";

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
    queryKey: ["proformas", pagina],
    queryFn: async () =>
      (await api.get<RespuestaPaginada<Proforma>>("/proformas", { params: { page: pagina, pageSize: TAMANO_PAGINA } })).data,
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">Proformas</h2>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
          Cotización con el mismo formato de una factura, pero no es un comprobante electrónico y no descuenta stock.
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Columna izquierda: buscar productos para agregar */}
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">Productos</h3>
            <input
              type="text"
              placeholder="Buscar por nombre o código..."
              value={busquedaProducto}
              onChange={(e) => setBusquedaProducto(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm w-full mb-3"
            />
            {productosFiltrados?.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-gray-500">Sin resultados para "{busquedaProducto}"</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {productosFiltrados?.map((p) => (
                <button
                  key={p.id}
                  onClick={() => agregarAlCarrito(p)}
                  className="flex items-center gap-3 text-left border border-gray-200 dark:border-gray-700 rounded-md p-3 hover:border-slate-400 dark:hover:border-slate-500 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <ImagenProducto producto={p} tamano={40} />
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{p.nombre}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {precioMostrado(p) !== null ? `$${precioMostrado(p)!.toFixed(2)}` : "Sin costo"}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Columna derecha: datos de la proforma */}
          <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 p-4 flex flex-col">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">Datos de la proforma</h3>

            <BuscadorCliente
              clienteId={clienteId}
              onSeleccionar={(id, cliente) => {
                setClienteId(id);
                setClienteSeleccionado(cliente ?? null);
              }}
            />

            <div className="mb-3">
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Válida hasta (opcional)</label>
              <input
                type="date"
                value={validaHasta}
                onChange={(e) => setValidaHasta(e.target.value)}
                className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm w-full"
              />
            </div>

            <div className="flex-1 space-y-2 mb-3">
              {carrito.length === 0 && <p className="text-sm text-gray-400 dark:text-gray-500">Sin productos agregados</p>}
              {carrito.map((item) => (
                <div key={item.producto.id} className="flex items-center justify-between text-sm border-b border-gray-100 dark:border-gray-700 pb-2">
                  <div>
                    <p className="font-medium text-gray-800 dark:text-gray-100">{item.producto.nombre}</p>
                    <p className="text-gray-500 dark:text-gray-400">
                      {precioMostrado(item.producto) !== null ? `$${precioMostrado(item.producto)!.toFixed(2)} c/u` : "Sin costo — no se puede cotizar"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      value={item.cantidad}
                      onChange={(e) => cambiarCantidad(item.producto.id, Number(e.target.value))}
                      className="w-14 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-1 py-1 text-center"
                    />
                    <button onClick={() => quitarDelCarrito(item.producto.id)} className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300">
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
              <div className="flex justify-between font-semibold text-gray-800 dark:text-gray-100 mb-3">
                <span>Total (aprox.)</span>
                <span>${totalCarrito.toFixed(2)}</span>
              </div>
              {editandoId !== null && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">Editando proforma existente</p>
              )}
              <button
                onClick={() => (editandoId !== null ? editarProforma.mutate() : crearProforma.mutate())}
                disabled={carrito.length === 0 || !clienteId || crearProforma.isPending || editarProforma.isPending}
                className="w-full bg-brand-600 text-white py-2 rounded-md text-sm font-medium hover:bg-brand-700 disabled:opacity-40"
              >
                {editandoId !== null
                  ? editarProforma.isPending
                    ? "Guardando..."
                    : "Guardar cambios"
                  : crearProforma.isPending
                    ? "Generando..."
                    : "Generar proforma"}
              </button>
              {editandoId !== null && (
                <button
                  onClick={cancelarEdicion}
                  className="w-full text-center text-xs text-gray-500 dark:text-gray-400 hover:underline mt-2"
                >
                  Cancelar edición
                </button>
              )}
              {(editandoId !== null ? editarProforma.isError : crearProforma.isError) && (
                <p className="text-red-600 dark:text-red-400 text-sm mt-2">
                  {((editandoId !== null ? editarProforma.error : crearProforma.error) as any)?.response?.data?.error ??
                    "Error al guardar la proforma"}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Historial de proformas</h2>
        <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
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
                  <td colSpan={6} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">No hay proformas registradas</td>
                </tr>
              )}
              {proformas?.map((p) => (
                <tr key={p.id} className="border-t border-gray-100 dark:border-gray-700">
                  <td className="px-4 py-2 font-mono text-xs">{p.secuencial}</td>
                  <td className="px-4 py-2">{p.cliente.razonSocial}</td>
                  <td className="px-4 py-2">{new Date(p.fechaEmision).toLocaleDateString("es-EC")}</td>
                  <td className="px-4 py-2 text-right">${p.total}</td>
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
                      className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium"
                    >
                      Ver PDF
                    </button>
                    {p.estado === "CREADA" && (
                      <>
                        <button
                          onClick={() => iniciarEdicion(p)}
                          className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium"
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
          {respuestaProformas && (
            <Paginacion
              page={respuestaProformas.paginacion.page}
              totalPaginas={respuestaProformas.paginacion.totalPaginas}
              total={respuestaProformas.paginacion.total}
              onCambiarPagina={setPagina}
            />
          )}
        </div>
      </div>
    </div>
  );
}
