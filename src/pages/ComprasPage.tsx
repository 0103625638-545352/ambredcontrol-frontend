import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api, abrirPdfEnNuevaPestana, type Producto, type Compra, type Bodega, type RespuestaPaginada } from "../api/client";
import { ImagenProducto } from "../components/ImagenProducto";
import { BuscadorProveedor } from "../components/BuscadorProveedor";
import { EstadoBadge } from "../components/EstadoBadge";
import { Paginacion } from "../components/Paginacion";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmProvider";
import { ModalRegistrarPago } from "../components/ModalRegistrarPago";
import { ModalHistorialPagos } from "../components/ModalHistorialPagos";
import { ModalGenerarRetencion } from "../components/ModalGenerarRetencion";
import { usePermiso, useMiSucursal } from "../context/AuthContext";

const TAMANO_PAGINA = 20;

// Un ítem del carrito de COMPRA: a diferencia del carrito de venta, el costo
// unitario no viene fijo del producto — cada compra puede traer un precio de
// proveedor distinto, así que se edita línea por línea.
interface ItemCompra {
  producto: Producto;
  cantidad: number;
  costoUnitario: string;
  // Solo aplican si el producto tiene manejaLotes=true: esa cantidad entra
  // como un lote nuevo, con su propia caducidad.
  numeroLote: string;
  fechaCaducidad: string;
}

export function ComprasPage() {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const confirmar = useConfirm();
  const puedeRetenciones = usePermiso("retenciones");
  const miSucursal = useMiSucursal();
  const [carrito, setCarrito] = useState<ItemCompra[]>([]);
  const [bodegaId, setBodegaId] = useState<number | "">("");
  const [proveedorId, setProveedorId] = useState<number | "">("");
  const [numeroFactura, setNumeroFactura] = useState("");
  const [fechaVencimiento, setFechaVencimiento] = useState("");
  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [pagina, setPagina] = useState(1);
  const [compraPagoId, setCompraPagoId] = useState<number | null>(null);
  const [compraVerPagosId, setCompraVerPagosId] = useState<number | null>(null);
  const [compraRetencionId, setCompraRetencionId] = useState<number | null>(null);

  // Para saber si mostrar "Generar retención" — no toda empresa está
  // autorizada por el SRI como agente de retención (ver Ajustes).
  const { data: empresaConfig } = useQuery({
    queryKey: ["configuracion-empresa"],
    queryFn: async () => (await api.get<{ agenteRetencion: boolean }>("/configuracion/empresa")).data,
  });

  // Bodega (dentro de tu sucursal) que recibe la mercadería — campo real y
  // obligatorio, se preselecciona sola si tu sucursal tiene una sola bodega.
  const { data: bodegas } = useQuery({
    queryKey: ["bodegas", miSucursal?.id],
    queryFn: async () => (await api.get<Bodega[]>("/bodegas", { params: { sucursalId: miSucursal!.id } })).data,
    enabled: !!miSucursal,
  });
  useEffect(() => {
    if (bodegas?.length === 1 && bodegaId === "") {
      setBodegaId(bodegas[0].id);
    }
  }, [bodegas, bodegaId]);

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
      (p.codigoBarras && p.codigoBarras.toLowerCase().includes(textoBusqueda)) ||
      (p.marca && p.marca.toLowerCase().includes(textoBusqueda)) ||
      (p.modelo && p.modelo.toLowerCase().includes(textoBusqueda))
  );

  const { data: respuestaCompras, isLoading: cargandoCompras } = useQuery({
    queryKey: ["compras", pagina],
    queryFn: async () =>
      (await api.get<RespuestaPaginada<Compra>>("/compras", { params: { page: pagina, pageSize: TAMANO_PAGINA } })).data,
    placeholderData: keepPreviousData,
  });
  const compras = respuestaCompras?.datos;

  function agregarAlCarrito(producto: Producto) {
    setCarrito((actual) => {
      if (actual.some((item) => item.producto.id === producto.id)) return actual;
      return [...actual, { producto, cantidad: 1, costoUnitario: "", numeroLote: "", fechaCaducidad: "" }];
    });
  }

  function cambiarLote(productoId: number, campo: "numeroLote" | "fechaCaducidad", valor: string) {
    setCarrito((actual) => actual.map((item) => (item.producto.id === productoId ? { ...item, [campo]: valor } : item)));
  }

  function cambiarCantidad(productoId: number, cantidad: number) {
    setCarrito((actual) =>
      actual.map((item) =>
        item.producto.id === productoId ? { ...item, cantidad: Math.max(1, Math.trunc(cantidad) || 1) } : item
      )
    );
  }

  function cambiarCosto(productoId: number, costoUnitario: string) {
    setCarrito((actual) => actual.map((item) => (item.producto.id === productoId ? { ...item, costoUnitario } : item)));
  }

  function quitarDelCarrito(productoId: number) {
    setCarrito((actual) => actual.filter((item) => item.producto.id !== productoId));
  }

  const totalCarrito = carrito.reduce(
    (acumulado, item) => acumulado + (parseFloat(item.costoUnitario) || 0) * item.cantidad,
    0
  );
  const carritoValido =
    carrito.length > 0 &&
    carrito.every(
      (item) =>
        parseFloat(item.costoUnitario) >= 0 &&
        item.costoUnitario !== "" &&
        (!item.producto.manejaLotes || item.fechaCaducidad !== "")
    );

  const registrarCompra = useMutation({
    mutationFn: async () => {
      return api.post("/compras", {
        proveedorId,
        numeroFactura,
        bodegaId,
        fechaVencimiento: fechaVencimiento || undefined,
        items: carrito.map((item) => ({
          productoId: item.producto.id,
          cantidad: item.cantidad,
          costoUnitario: parseFloat(item.costoUnitario),
          numeroLote: item.producto.manejaLotes ? item.numeroLote || undefined : undefined,
          fechaCaducidad: item.producto.manejaLotes ? item.fechaCaducidad : undefined,
        })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compras"] });
      queryClient.invalidateQueries({ queryKey: ["productos"] }); // el stock cambió
      setCarrito([]);
      setProveedorId("");
      setNumeroFactura("");
      setFechaVencimiento("");
      setBodegaId(""); // el efecto de arriba la vuelve a preseleccionar si hay una sola bodega
    },
  });

  const anularCompra = useMutation({
    mutationFn: async (compraId: number) => api.patch(`/compras/${compraId}/anular`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compras"] });
      queryClient.invalidateQueries({ queryKey: ["productos"] });
    },
    onError: (error: any) => {
      mostrarToast(error.response?.data?.error ?? "Error al anular la compra");
    },
  });

  async function confirmarAnulacion(c: Compra) {
    const ok = await confirmar(
      `¿Anular la compra Fact. ${c.numeroFactura} de ${c.proveedor.razonSocial}? Esto le quitará al stock lo que esta compra le sumó.`
    );
    if (ok) anularCompra.mutate(c.id);
  }

  const enviarSriRetencion = useMutation({
    mutationFn: async (retencionId: number) => api.post(`/retenciones/${retencionId}/enviar-sri`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["compras"] }),
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al enviar la retención al SRI"),
  });

  const consultarAutorizacionRetencion = useMutation({
    mutationFn: async (retencionId: number) => api.get(`/retenciones/${retencionId}/consultar-autorizacion`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["compras"] }),
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al consultar autorización"),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Registrar compra</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Columna izquierda: buscar productos para agregar */}
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">Productos</h3>
            <input
              type="text"
              placeholder="Buscar por nombre, código, marca o modelo..."
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
                    {(p.marca || p.modelo) && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {[p.marca, p.modelo].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    <p className="text-xs text-gray-500 dark:text-gray-400">Stock actual: {p.stockActual}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Columna derecha: datos de la compra */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 flex flex-col">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">Datos de la compra</h3>

            <BuscadorProveedor proveedorId={proveedorId} onSeleccionar={setProveedorId} />

            <div className="mb-3">
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Bodega que recibe</label>
              <select
                value={bodegaId}
                onChange={(e) => setBodegaId(e.target.value ? Number(e.target.value) : "")}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
              >
                <option value="">Bodega...</option>
                {bodegas?.map((b) => (
                  <option key={b.id} value={b.id}>{b.nombre}</option>
                ))}
              </select>
            </div>

            <input
              type="text"
              placeholder="Número de factura del proveedor"
              value={numeroFactura}
              onChange={(e) => setNumeroFactura(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm mb-3"
            />

            <div className="mb-3">
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Fecha de vencimiento (opcional)</label>
              <input
                type="date"
                value={fechaVencimiento}
                onChange={(e) => setFechaVencimiento(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
              />
            </div>

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
                  <div className="flex items-center gap-2">
                    <div>
                      <label className="block text-[10px] text-gray-500 dark:text-gray-400">Cantidad</label>
                      <input
                        type="number"
                        min={1}
                        value={item.cantidad}
                        onChange={(e) => cambiarCantidad(item.producto.id, Number(e.target.value))}
                        className="w-16 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-1 py-1 text-center text-sm"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-[10px] text-gray-500 dark:text-gray-400">Costo unitario</label>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        placeholder="0.00"
                        value={item.costoUnitario}
                        onChange={(e) => cambiarCosto(item.producto.id, e.target.value)}
                        className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-2 py-1 text-sm"
                      />
                    </div>
                  </div>
                  {item.producto.manejaLotes && (
                    <div className="flex items-center gap-2 mt-2">
                      <div>
                        <label className="block text-[10px] text-gray-500 dark:text-gray-400">N° de lote (opcional)</label>
                        <input
                          type="text"
                          value={item.numeroLote}
                          onChange={(e) => cambiarLote(item.producto.id, "numeroLote", e.target.value)}
                          className="w-28 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-2 py-1 text-sm"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-[10px] text-gray-500 dark:text-gray-400">Fecha de caducidad</label>
                        <input
                          type="date"
                          required
                          value={item.fechaCaducidad}
                          onChange={(e) => cambiarLote(item.producto.id, "fechaCaducidad", e.target.value)}
                          className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-2 py-1 text-sm"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
              <div className="flex justify-between font-semibold text-gray-800 dark:text-gray-100 mb-3">
                <span>Total (aprox.)</span>
                <span>${totalCarrito.toFixed(2)}</span>
              </div>
              <button
                onClick={() => registrarCompra.mutate()}
                disabled={!carritoValido || !proveedorId || !numeroFactura || !bodegaId || registrarCompra.isPending}
                className="w-full bg-emerald-600 text-white py-2 rounded-md text-sm font-medium hover:bg-emerald-700 disabled:opacity-40"
              >
                {registrarCompra.isPending ? "Registrando..." : "Registrar compra"}
              </button>
              {registrarCompra.isError && (
                <p className="text-red-600 dark:text-red-400 text-sm mt-2">
                  {(registrarCompra.error as any)?.response?.data?.error ?? "Error al registrar la compra"}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Historial de compras</h2>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
              <tr>
                <th className="px-4 py-2">Fact. proveedor</th>
                <th className="px-4 py-2">Proveedor</th>
                <th className="px-4 py-2">Fecha</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2">Pago</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {cargandoCompras && (
                <tr>
                  <td colSpan={7} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">Cargando...</td>
                </tr>
              )}
              {!cargandoCompras && compras?.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">No hay compras registradas</td>
                </tr>
              )}
              {compras?.map((c) => {
                const saldo = (parseFloat(c.total) - parseFloat(c.montoPagado)).toFixed(2);
                return (
                <tr key={c.id} className="border-t border-gray-100 dark:border-gray-700">
                  <td className="px-4 py-2 font-mono text-xs">{c.numeroFactura}</td>
                  <td className="px-4 py-2">{c.proveedor.razonSocial}</td>
                  <td className="px-4 py-2">{new Date(c.fechaEmision).toLocaleDateString("es-EC")}</td>
                  <td className="px-4 py-2 text-right">${c.total}</td>
                  <td className="px-4 py-2">
                    <EstadoBadge estado={c.estado} />
                  </td>
                  <td className="px-4 py-2">
                    {c.estado === "ANULADA" ? (
                      <span className="text-gray-300 dark:text-gray-600">—</span>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        <EstadoBadge estado={c.estadoPago} />
                        {c.estadoPago !== "PAGADA" && (
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">Saldo: ${saldo}</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right space-x-3">
                    <button
                      onClick={() => abrirPdfEnNuevaPestana(`/compras/${c.id}/recibo`)}
                      className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium"
                    >
                      Ver PDF
                    </button>
                    <button
                      onClick={() => setCompraVerPagosId(c.id)}
                      className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium"
                    >
                      Ver pagos
                    </button>
                    {c.estado !== "ANULADA" && c.estadoPago !== "PAGADA" && (
                      <button
                        onClick={() => setCompraPagoId(c.id)}
                        className="text-emerald-700 dark:text-emerald-400 hover:underline text-xs font-medium"
                      >
                        Registrar pago
                      </button>
                    )}
                    {c.estado !== "ANULADA" && (
                      <button
                        onClick={() => confirmarAnulacion(c)}
                        className="text-red-600 dark:text-red-400 hover:underline text-xs font-medium"
                      >
                        Anular
                      </button>
                    )}
                    {c.estado !== "ANULADA" && !c.retencion && puedeRetenciones && empresaConfig?.agenteRetencion && (
                      <button
                        onClick={() => setCompraRetencionId(c.id)}
                        className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium"
                      >
                        Generar retención
                      </button>
                    )}
                    {c.retencion && (
                      <>
                        <button
                          onClick={() => abrirPdfEnNuevaPestana(`/retenciones/${c.retencion!.id}/ride`)}
                          className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium"
                        >
                          Ver retención
                        </button>
                        {c.retencion.estado === "CREADA" && puedeRetenciones && (
                          <button
                            onClick={() => enviarSriRetencion.mutate(c.retencion!.id)}
                            disabled={enviarSriRetencion.isPending}
                            className="text-emerald-700 dark:text-emerald-400 hover:underline text-xs font-medium disabled:opacity-40"
                          >
                            {enviarSriRetencion.isPending ? "Enviando..." : "Enviar retención al SRI"}
                          </button>
                        )}
                        {c.retencion.estado === "ENVIADA" && puedeRetenciones && (
                          <button
                            onClick={() => consultarAutorizacionRetencion.mutate(c.retencion!.id)}
                            disabled={consultarAutorizacionRetencion.isPending}
                            className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium disabled:opacity-40"
                          >
                            Consultar autorización
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          {respuestaCompras && (
            <Paginacion
              page={respuestaCompras.paginacion.page}
              totalPaginas={respuestaCompras.paginacion.totalPaginas}
              total={respuestaCompras.paginacion.total}
              onCambiarPagina={setPagina}
            />
          )}
        </div>
      </div>

      {compraPagoId !== null && (() => {
        const compra = compras?.find((c) => c.id === compraPagoId);
        if (!compra) return null;
        const saldo = (parseFloat(compra.total) - parseFloat(compra.montoPagado)).toFixed(2);
        return (
          <ModalRegistrarPago
            endpoint={`/compras/${compra.id}/pagos`}
            documento={`compra Fact. ${compra.numeroFactura}`}
            saldoPendiente={saldo}
            queryKeysAInvalidar={[["compras"], ["reporte-cuentas-por-pagar"]]}
            onCerrar={() => setCompraPagoId(null)}
            onPagado={() => setCompraPagoId(null)}
          />
        );
      })()}

      {compraVerPagosId !== null && (() => {
        const compra = compras?.find((c) => c.id === compraVerPagosId);
        if (!compra) return null;
        return (
          <ModalHistorialPagos
            endpointBase={`/compras/${compra.id}`}
            documento={`compra Fact. ${compra.numeroFactura}`}
            queryKeysAInvalidar={[["compras"], ["reporte-cuentas-por-pagar"]]}
            onCerrar={() => setCompraVerPagosId(null)}
          />
        );
      })()}

      {compraRetencionId !== null && (() => {
        const compra = compras?.find((c) => c.id === compraRetencionId);
        if (!compra) return null;
        return <ModalGenerarRetencion compra={compra} onCerrar={() => setCompraRetencionId(null)} />;
      })()}
    </div>
  );
}
