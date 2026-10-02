import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api, abrirPdfEnNuevaPestana, type Producto, type Compra, type Bodega } from "../api/client";
import { BuscadorProveedor } from "../components/BuscadorProveedor";
import { EstadoBadge } from "../components/EstadoBadge";
import { Paginacion } from "../components/Paginacion";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmProvider";
import { ModalRegistrarPago } from "../components/ModalRegistrarPago";
import { ModalHistorialPagos } from "../components/ModalHistorialPagos";
import { ModalGenerarRetencion } from "../components/ModalGenerarRetencion";
import { usePermiso, useMiSucursal } from "../context/AuthContext";
import {
  CLASE_CAMPO,
  CLASE_SOLO_LECTURA,
  CLASE_ETIQUETA,
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
  RecuadroDocumento,
  CuadroTotales,
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
  // Código de la tabla "Sustento Tributario" del SRI (ej. "01" crédito
  // tributario IVA bienes) — a propósito texto libre, sin catálogo
  // hardcodeado (mismo criterio que el código de retención en
  // ModalGenerarRetencion.tsx): el SRI lo actualiza periódicamente.
  const [sustentoTributario, setSustentoTributario] = useState("");
  // Plan de cuotas del pago al proveedor (ver modelo Cuota) — a diferencia
  // de PuntoDeVentaPage.tsx, acá no hay abono inicial: si se activa, el
  // TOTAL de la compra se reparte en partes iguales entre las N cuotas.
  const [usarCuotas, setUsarCuotas] = useState(false);
  const [numeroCuotas, setNumeroCuotas] = useState(2);
  const [fechasCuotas, setFechasCuotas] = useState<string[]>(["", ""]);
  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [pagina, setPagina] = useState(1);
  // Buscador dinámico del listado (ver components/BuscadorDocumentos.tsx).
  const filtros = useFiltrosListado(setPagina);
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
    queryKey: ["compras", pagina, ...filtros.clave],
    queryFn: async () =>
      (await api.get<RespuestaConResumen<Compra>>("/compras", { params: { page: pagina, pageSize: TAMANO_PAGINA, ...filtros.params } })).data,
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

  // Reparto en partes iguales del TOTAL de la compra — la última cuota
  // absorbe el centavo de redondeo, mismo criterio que PuntoDeVentaPage.tsx.
  const cuotasCalculadas =
    usarCuotas && totalCarrito > 0
      ? Array.from({ length: numeroCuotas }, (_, i) => {
          const montoBase = Math.floor((totalCarrito / numeroCuotas) * 100) / 100;
          const esUltima = i === numeroCuotas - 1;
          const monto = esUltima ? Number((totalCarrito - montoBase * (numeroCuotas - 1)).toFixed(2)) : montoBase;
          return { numero: i + 1, monto, fechaVencimiento: fechasCuotas[i] || "" };
        })
      : [];
  const cuotasValidas = !usarCuotas || (cuotasCalculadas.length > 0 && cuotasCalculadas.every((c) => c.fechaVencimiento !== ""));

  const registrarCompra = useMutation({
    mutationFn: async () => {
      return api.post("/compras", {
        proveedorId,
        numeroFactura,
        bodegaId,
        fechaVencimiento: fechaVencimiento || undefined,
        sustentoTributario,
        items: carrito.map((item) => ({
          productoId: item.producto.id,
          cantidad: item.cantidad,
          costoUnitario: parseFloat(item.costoUnitario),
          numeroLote: item.producto.manejaLotes ? item.numeroLote || undefined : undefined,
          fechaCaducidad: item.producto.manejaLotes ? item.fechaCaducidad : undefined,
        })),
        ...(usarCuotas && cuotasCalculadas.length > 0 ? { cuotas: cuotasCalculadas } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compras"] });
      queryClient.invalidateQueries({ queryKey: ["productos"] }); // el stock cambió
      setCarrito([]);
      setProveedorId("");
      setNumeroFactura("");
      setFechaVencimiento("");
      setSustentoTributario("");
      setBodegaId(""); // el efecto de arriba la vuelve a preseleccionar si hay una sola bodega
      setUsarCuotas(false);
      setNumeroCuotas(2);
      setFechasCuotas(["", ""]);
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

  // Edición del sustento tributario de una compra YA EXISTENTE — es el único
  // campo editable después de creada (ver PATCH /compras/:id/sustento-tributario
  // en el backend), pensado sobre todo para completar compras registradas
  // antes de que este campo existiera, así el reporte ATS no se queda con
  // esa columna vacía para siempre.
  const [compraSustentoEditId, setCompraSustentoEditId] = useState<number | null>(null);
  const [formSustento, setFormSustento] = useState("");

  const editarSustentoTributario = useMutation({
    mutationFn: async (compraId: number) =>
      api.patch(`/compras/${compraId}/sustento-tributario`, { sustentoTributario: formSustento }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compras"] });
      setCompraSustentoEditId(null);
    },
    onError: (error: any) => {
      mostrarToast(error.response?.data?.error ?? "Error al actualizar el sustento tributario");
    },
  });

  function abrirEdicionSustento(c: Compra) {
    setFormSustento(c.sustentoTributario ?? "");
    setCompraSustentoEditId(compraSustentoEditId === c.id ? null : c.id);
  }

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

  const puedeRegistrar =
    carritoValido &&
    !!proveedorId &&
    !!numeroFactura &&
    !!bodegaId &&
    !!sustentoTributario.trim() &&
    cuotasValidas &&
    !registrarCompra.isPending;

  return (
    <div className="space-y-6">
      <MarcoDocumento
        titulo="Registrar compra"
        sello={
          <>
            <ConteoItems cantidad={carrito.length} />
            <Sello>Borrador</Sello>
          </>
        }
      >
        <CabeceraDocumento>
          <EtiquetaCabecera>Proveedor</EtiquetaCabecera>
          <div className="col-span-3 [&>div]:mb-0">
            <BuscadorProveedor proveedorId={proveedorId} onSeleccionar={setProveedorId} />
          </div>

          <EtiquetaCabecera>Fact. proveedor</EtiquetaCabecera>
          <input
            type="text"
            placeholder="001-001-000000123"
            value={numeroFactura}
            onChange={(e) => setNumeroFactura(e.target.value)}
            className={`${CLASE_CAMPO} font-mono`}
          />
          <EtiquetaCabecera>Fecha registro</EtiquetaCabecera>
          <div className={`${CLASE_SOLO_LECTURA} font-mono`}>{fechaHoy()}</div>

          <EtiquetaCabecera>Sustento SRI</EtiquetaCabecera>
          <input
            type="text"
            placeholder="Ej: 01, 06..."
            required
            value={sustentoTributario}
            onChange={(e) => setSustentoTributario(e.target.value)}
            className={`${CLASE_CAMPO} font-mono`}
          />
          <EtiquetaCabecera>Vence el</EtiquetaCabecera>
          <input
            type="date"
            value={fechaVencimiento}
            onChange={(e) => setFechaVencimiento(e.target.value)}
            className={CLASE_CAMPO}
          />

          <EtiquetaCabecera>Sucursal</EtiquetaCabecera>
          <div className={CLASE_SOLO_LECTURA}>{miSucursal?.nombre ?? "Sin sucursal asignada"}</div>
          <EtiquetaCabecera>Bodega que recibe</EtiquetaCabecera>
          <select
            value={bodegaId}
            onChange={(e) => setBodegaId(e.target.value ? Number(e.target.value) : "")}
            className={CLASE_CAMPO}
          >
            <option value="">Selecciona...</option>
            {bodegas?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nombre}
              </option>
            ))}
          </select>
        </CabeceraDocumento>

        <BuscadorProductosDocumento
          busqueda={busquedaProducto}
          onBusqueda={setBusquedaProducto}
          productos={productosFiltrados}
          onElegir={(p) => {
            agregarAlCarrito(p);
            setBusquedaProducto("");
          }}
          placeholder="Buscar por nombre, código, marca o modelo..."
          infoDerecha={(p) => `Stock ${p.stockActual}`}
        />

        <DetalleDocumento>
          <thead>
            <tr className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700">
              <th className={`${CLASE_TH} w-10`}>#</th>
              <th className={`${CLASE_TH} w-32`}>Código</th>
              <th className={CLASE_TH}>Descripción</th>
              <th className={`${CLASE_TH} w-28`}>Lote</th>
              <th className={`${CLASE_TH} w-36`}>Caducidad</th>
              <th className={`${CLASE_TH} w-24 text-right`}>Cantidad</th>
              <th className={`${CLASE_TH} w-28 text-right`}>Costo unit.</th>
              <th className={`${CLASE_TH} w-28 text-right`}>Subtotal</th>
              <th className={`${CLASE_TH} w-10`}></th>
            </tr>
          </thead>
          <tbody>
            {carrito.length === 0 && (
              <FilaDetalleVacia columnas={9}>Agrega productos con el buscador o el catálogo.</FilaDetalleVacia>
            )}
            {carrito.map((item, indice) => (
              <tr key={item.producto.id} className="border-b border-stone-100 dark:border-gray-700/60 last:border-b-0">
                <td className="px-3 py-1.5 font-mono text-xs text-gray-400">{indice + 1}</td>
                <td className="px-3 py-1.5 font-mono text-xs text-gray-600 dark:text-gray-300">{item.producto.codigo}</td>
                <td className="px-3 py-1.5 text-gray-800 dark:text-gray-100">
                  <span className="uppercase text-[13px]">{item.producto.nombre}</span>
                  {(item.producto.marca || item.producto.modelo) && (
                    <span className="block text-xs text-gray-400 dark:text-gray-500">
                      {[item.producto.marca, item.producto.modelo].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </td>
                <td className="px-3 py-1">
                  {item.producto.manejaLotes ? (
                    <input
                      type="text"
                      placeholder="Opcional"
                      value={item.numeroLote}
                      onChange={(e) => cambiarLote(item.producto.id, "numeroLote", e.target.value)}
                      className={`${CLASE_CAMPO_CELDA} w-24 text-left`}
                    />
                  ) : (
                    <span className="text-gray-300 dark:text-gray-600">—</span>
                  )}
                </td>
                <td className="px-3 py-1">
                  {item.producto.manejaLotes ? (
                    <input
                      type="date"
                      required
                      value={item.fechaCaducidad}
                      onChange={(e) => cambiarLote(item.producto.id, "fechaCaducidad", e.target.value)}
                      className={`${CLASE_CAMPO_CELDA} w-32 text-left ${
                        item.fechaCaducidad === "" ? "border-amber-400 dark:border-amber-600" : ""
                      }`}
                    />
                  ) : (
                    <span className="text-gray-300 dark:text-gray-600">—</span>
                  )}
                </td>
                <td className="px-3 py-1 text-right">
                  <input
                    type="number"
                    min={1}
                    value={item.cantidad}
                    onChange={(e) => cambiarCantidad(item.producto.id, Number(e.target.value))}
                    className={`${CLASE_CAMPO_CELDA} w-16`}
                  />
                </td>
                <td className="px-3 py-1 text-right">
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="0.00"
                    value={item.costoUnitario}
                    onChange={(e) => cambiarCosto(item.producto.id, e.target.value)}
                    className={`${CLASE_CAMPO_CELDA} w-24 ${
                      item.costoUnitario === "" ? "border-amber-400 dark:border-amber-600" : ""
                    }`}
                  />
                </td>
                <td className="px-3 py-1.5 font-mono text-right tabular-nums font-medium text-gray-900 dark:text-gray-50">
                  {((parseFloat(item.costoUnitario) || 0) * item.cantidad).toFixed(2)}
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
            ))}
          </tbody>
        </DetalleDocumento>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4 p-4 items-start">
          <RecuadroDocumento titulo="Pago al proveedor">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={usarCuotas}
                  onChange={(e) => setUsarCuotas(e.target.checked)}
                  className="rounded border-stone-300 dark:border-gray-600"
                />
                Pagar al proveedor en cuotas
              </label>
              {!usarCuotas && (
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Sin cuotas, el saldo queda pendiente y se registra desde "Registrar pago" en el historial.
                </p>
              )}
              {usarCuotas && (
                <>
                  <div className="flex items-center gap-2">
                    <span className={CLASE_ETIQUETA}>N° de cuotas</span>
                    <select
                      value={numeroCuotas}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        setNumeroCuotas(n);
                        setFechasCuotas((actual) => Array.from({ length: n }, (_, i) => actual[i] ?? ""));
                      }}
                      className={`${CLASE_CAMPO} w-auto`}
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                    <span className="font-mono text-xs text-gray-400 dark:text-gray-500">
                      Total a repartir: {totalCarrito.toFixed(2)}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1.5">
                    {cuotasCalculadas.map((c, i) => (
                      <div key={c.numero} className="flex items-center gap-2">
                        <span className="font-mono text-xs text-gray-500 dark:text-gray-400 w-16 shrink-0">Cuota {c.numero}</span>
                        <span className="font-mono text-xs font-semibold text-gray-700 dark:text-gray-200 w-16 shrink-0 text-right">
                          {c.monto.toFixed(2)}
                        </span>
                        <input
                          type="date"
                          required
                          value={fechasCuotas[i] || ""}
                          onChange={(e) =>
                            setFechasCuotas((actual) => actual.map((f, idx) => (idx === i ? e.target.value : f)))
                          }
                          className={CLASE_CAMPO}
                        />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </RecuadroDocumento>

          <div className="space-y-3">
            <CuadroTotales etiquetaTotal="TOTAL (aprox.)" total={totalCarrito} />
            <BotonConfirmar onClick={() => registrarCompra.mutate()} disabled={!puedeRegistrar}>
              {registrarCompra.isPending ? "Registrando..." : "Registrar compra"}
            </BotonConfirmar>
            {registrarCompra.isError && (
              <MensajeError>
                {(registrarCompra.error as any)?.response?.data?.error ?? "Error al registrar la compra"}
              </MensajeError>
            )}
          </div>
        </div>
      </MarcoDocumento>

      <SeccionListado titulo="Historial de compras">
        <BarraBuscadorDocumentos
          filtros={filtros}
          etiquetaBusqueda="Buscar · n° de factura, proveedor, RUC o sustento"
          placeholder="Ej: 001-001-000000123, Distribuidora..."
          opcionesEstado={[{ valor: "REGISTRADA", etiqueta: "Registrada" }, { valor: "ANULADA", etiqueta: "Anulada" }]}
        />
          <table className="w-full text-sm">
            <thead className={CLASE_THEAD}>
              <tr>
                <th className="px-4 py-2">Fact. proveedor</th>
                <th className="px-4 py-2">Proveedor</th>
                <th className="px-4 py-2">Fecha</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2">Pago</th>
                <th className="px-4 py-2">Sustento SRI</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {cargandoCompras && (
                <tr>
                  <td colSpan={8} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">Cargando...</td>
                </tr>
              )}
              {!cargandoCompras && compras?.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">{filtros.hayFiltros ? "Ningún documento coincide con la búsqueda." : "No hay compras registradas"}</td>
                </tr>
              )}
              {compras?.map((c) => {
                const saldo = (parseFloat(c.total) - parseFloat(c.montoPagado)).toFixed(2);
                return (
                <tr key={c.id} className="border-t border-stone-100 dark:border-gray-700 hover:bg-stone-50 dark:hover:bg-gray-700/30">
                  <td className="px-4 py-2 font-mono text-xs"><Resaltar texto={c.numeroFactura} termino={filtros.busquedaAplicada} /></td>
                  <td className="px-4 py-2"><Resaltar texto={c.proveedor.razonSocial} termino={filtros.busquedaAplicada} /></td>
                  <td className="px-4 py-2">{new Date(c.fechaEmision).toLocaleDateString("es-EC")}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{c.total}</td>
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
                  <td className="px-4 py-2">
                    {compraSustentoEditId === c.id ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          editarSustentoTributario.mutate(c.id);
                        }}
                        className="flex items-center gap-1"
                      >
                        <input
                          autoFocus
                          required
                          value={formSustento}
                          onChange={(e) => setFormSustento(e.target.value)}
                          placeholder="Ej: 01"
                          className="w-16 border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-1.5 py-1 text-xs"
                        />
                        <button
                          type="submit"
                          disabled={editarSustentoTributario.isPending}
                          className="text-emerald-700 dark:text-emerald-400 hover:underline text-xs font-medium"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          onClick={() => setCompraSustentoEditId(null)}
                          className="text-gray-500 dark:text-gray-400 hover:underline text-xs"
                        >
                          Cancelar
                        </button>
                      </form>
                    ) : (
                      <button
                        onClick={() => abrirEdicionSustento(c)}
                        className={
                          c.sustentoTributario
                            ? "font-mono text-xs text-gray-700 dark:text-gray-200 hover:underline"
                            : "text-xs text-amber-600 dark:text-amber-400 hover:underline"
                        }
                      >
                        {c.sustentoTributario ?? "Falta — editar"}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right space-x-3">
                    <button
                      onClick={() => abrirPdfEnNuevaPestana(`/compras/${c.id}/recibo`)}
                      className="text-brand-700 dark:text-brand-300 hover:underline text-xs font-medium"
                    >
                      Ver PDF
                    </button>
                    <button
                      onClick={() => setCompraVerPagosId(c.id)}
                      className="text-brand-700 dark:text-brand-300 hover:underline text-xs font-medium"
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
                        className="text-brand-700 dark:text-brand-300 hover:underline text-xs font-medium"
                      >
                        Generar retención
                      </button>
                    )}
                    {c.retencion && (
                      <>
                        <button
                          onClick={() => abrirPdfEnNuevaPestana(`/retenciones/${c.retencion!.id}/ride`)}
                          className="text-brand-700 dark:text-brand-300 hover:underline text-xs font-medium"
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
                            className="text-brand-700 dark:text-brand-300 hover:underline text-xs font-medium disabled:opacity-40"
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
          <PieResumenListado resumen={respuestaCompras?.resumen} hayFiltros={filtros.hayFiltros} />
          {respuestaCompras && (
            <Paginacion
              page={respuestaCompras.paginacion.page}
              totalPaginas={respuestaCompras.paginacion.totalPaginas}
              total={respuestaCompras.paginacion.total}
              onCambiarPagina={setPagina}
            />
          )}
      </SeccionListado>

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
