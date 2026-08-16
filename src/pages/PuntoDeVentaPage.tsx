import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera } from "lucide-react";
import {
  api,
  abrirPdfEnNuevaPestana,
  type Producto,
  type Cliente,
  type Factura,
  type NotaVenta,
  type Bodega,
  type CuentaBancaria,
} from "../api/client";
import { ImagenProducto } from "../components/ImagenProducto";
import { BuscadorCliente } from "../components/BuscadorCliente";
import { EscanerCodigoBarras } from "../components/EscanerCodigoBarras";
import { SelectorBanco } from "../components/SelectorBanco";
import { useToast } from "../components/ToastProvider";
import { useMiSucursal } from "../context/AuthContext";

// Un ítem del carrito: guardamos el producto completo (para mostrar nombre/precio)
// más la cantidad que el usuario está eligiendo.
interface ItemCarrito {
  producto: Producto;
  cantidad: number;
}

type TipoComprobante = "FACTURA" | "NOTA_VENTA";
type ModoCobro = "COMPLETO" | "PARCIAL" | "PENDIENTE";

const FORMAS_PAGO = ["EFECTIVO", "TRANSFERENCIA", "TARJETA", "CHEQUE", "OTRO"];
// Solo estas 3 exigen elegir a qué cuenta bancaria de la empresa llegó el
// dinero — EFECTIVO y OTRO se quedan igual que siempre (sin cuenta).
const FORMAS_QUE_EXIGEN_CUENTA = ["TRANSFERENCIA", "TARJETA", "CHEQUE"];

// Lo mínimo que necesitamos de la respuesta para la pantalla de confirmación,
// sea Factura (va al SRI) o NotaVenta (recibo interno, nunca va al SRI).
interface VentaCreada {
  id: number;
  secuencial: string;
  total: string;
  tipo: TipoComprobante;
}

export function PuntoDeVentaPage() {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const miSucursal = useMiSucursal();
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [bodegaId, setBodegaId] = useState<number | "">("");
  const [clienteId, setClienteId] = useState<number | "">("");
  // Solo se usa para estimar el precio en pantalla (según la categoría de
  // precio del cliente) — el monto que realmente se cobra siempre lo
  // calcula el backend, no lo que haya acá.
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);
  const [tipoComprobante, setTipoComprobante] = useState<TipoComprobante>("FACTURA");
  // En Ecuador, la nota de venta normalmente NO desglosa IVA — por eso arranca
  // desmarcado. Solo aplica cuando tipoComprobante === "NOTA_VENTA".
  const [aplicaIvaNotaVenta, setAplicaIvaNotaVenta] = useState(false);
  const [ventaCreada, setVentaCreada] = useState<VentaCreada | null>(null);
  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [mostrarEscaner, setMostrarEscaner] = useState(false);

  // --- Cobro al momento de la venta: completo, abono parcial, o a crédito.
  // Se resuelve en el mismo paso que crear la factura/nota de venta, en vez
  // de tener que ir después a "Registrar pago" en otra pantalla.
  const [modoCobro, setModoCobro] = useState<ModoCobro>("COMPLETO");
  const [formaPago, setFormaPago] = useState("EFECTIVO");
  const [cuentaBancariaId, setCuentaBancariaId] = useState<number | "">("");
  const [montoAbono, setMontoAbono] = useState("");
  const [montoRecibido, setMontoRecibido] = useState("");
  const [referencia, setReferencia] = useState("");
  // Datos de ORIGEN del pago (banco/cuenta/tarjeta/cheque de quien pagó) —
  // mismo criterio que ModalRegistrarPago.tsx, cuáles se piden depende de
  // formaPago (ver los bloques condicionales más abajo).
  const [bancoOrigenId, setBancoOrigenId] = useState<number | "">("");
  const [numeroCuentaOrigen, setNumeroCuentaOrigen] = useState("");
  const [tarjetaUltimosDigitos, setTarjetaUltimosDigitos] = useState("");
  const [tarjetaTipo, setTarjetaTipo] = useState("DEBITO");
  const [tarjetaReferencia, setTarjetaReferencia] = useState("");
  const [tarjetaLote, setTarjetaLote] = useState("");
  const [chequeNumero, setChequeNumero] = useState("");
  const [chequeFechaCobro, setChequeFechaCobro] = useState("");
  const [registrandoCobro, setRegistrandoCobro] = useState(false);
  // Solo tiene sentido si la venta queda con saldo pendiente (PARCIAL o
  // PENDIENTE) — una venta COMPLETO no tiene nada que vencer.
  const [fechaVencimiento, setFechaVencimiento] = useState("");
  // Plan de cuotas (ver modelo Cuota) — solo dentro de PARCIAL, divide el
  // saldo que queda DESPUÉS del abono en N partes iguales, cada una con su
  // propia fecha. Se cobran estrictamente en orden (ver ModalRegistrarPago.tsx).
  const [usarCuotas, setUsarCuotas] = useState(false);
  const [numeroCuotas, setNumeroCuotas] = useState(2);
  const [fechasCuotas, setFechasCuotas] = useState<string[]>(["", ""]);

  // Punto de Venta ya carga TODO el catálogo de una sola vez (lo necesita
  // para la grilla), así que filtramos aquí mismo, en el navegador, sin
  // pedirle nada al backend — no hace falta esperar ninguna respuesta de red
  // para que la búsqueda se sienta instantánea mientras se escribe.
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

  // Bodegas de la sucursal del usuario — a diferencia de la sucursal (fija,
  // solo informativa acá), la bodega es un campo real y obligatorio que hay
  // que elegir en cada venta.
  const { data: bodegas } = useQuery({
    queryKey: ["bodegas", miSucursal?.id],
    queryFn: async () => (await api.get<Bodega[]>("/bodegas", { params: { sucursalId: miSucursal!.id } })).data,
    enabled: !!miSucursal,
  });

  // Solo se pide cuando la forma de pago elegida realmente la necesita
  // (TRANSFERENCIA/TARJETA/CHEQUE) — igual criterio que en ModalRegistrarPago.tsx.
  const exigeCuentaBancaria = FORMAS_QUE_EXIGEN_CUENTA.includes(formaPago);
  const { data: cuentasBancarias } = useQuery({
    queryKey: ["cuentas-bancarias"],
    queryFn: async () => (await api.get<CuentaBancaria[]>("/cuentas-bancarias")).data,
    enabled: exigeCuentaBancaria,
  });
  // Si solo hay una bodega en la sucursal, se preselecciona sola — fricción
  // cero para negocios de una sola bodega, pero sigue siendo un campo real.
  useEffect(() => {
    if (bodegas?.length === 1 && bodegaId === "") {
      setBodegaId(bodegas[0].id);
    }
  }, [bodegas, bodegaId]);

  // Los productos con lote siguen con un stock global; los que no manejan
  // lotes se venden desde el stock de LA BODEGA elegida, no el total de la
  // sucursal (puede haber stock solo en otra bodega del mismo local).
  function stockDisponible(producto: Producto): number {
    if (producto.manejaLotes) return producto.stockActual;
    return producto.stockPorBodega.find((s) => s.bodegaId === bodegaId)?.cantidad ?? 0;
  }

  function agregarAlCarrito(producto: Producto) {
    setCarrito((actual) => {
      const yaExiste = actual.find((item) => item.producto.id === producto.id);
      if (yaExiste) {
        // Si ya está en el carrito, solo aumentamos la cantidad (sin pasar el stock disponible)
        return actual.map((item) =>
          item.producto.id === producto.id
            ? { ...item, cantidad: Math.min(item.cantidad + 1, stockDisponible(producto)) }
            : item
        );
      }
      return [...actual, { producto, cantidad: 1 }];
    });
  }

  function cambiarCantidad(productoId: number, cantidad: number) {
    setCarrito((actual) =>
      actual.map((item) => {
        if (item.producto.id !== productoId) return item;
        // Nunca dejamos que el input llegue a 0, negativo o por encima del stock,
        // aunque el usuario lo escriba a mano en vez de usar las flechas del input.
        const cantidadValida = Math.min(Math.max(1, Math.trunc(cantidad) || 1), stockDisponible(item.producto));
        return { ...item, cantidad: cantidadValida };
      })
    );
  }

  function quitarDelCarrito(productoId: number) {
    setCarrito((actual) => actual.filter((item) => item.producto.id !== productoId));
  }

  // Busca un match EXACTO (case-insensitive) contra el código de barras real
  // o el código interno de un producto — usado tanto por el lector USB
  // (Enter) como por el escaneo con cámara.
  function buscarPorCodigoExacto(codigo: string): Producto | undefined {
    const codigoNormalizado = codigo.trim().toLowerCase();
    if (!codigoNormalizado) return undefined;
    return productos?.find(
      (p) => p.codigo.toLowerCase() === codigoNormalizado || p.codigoBarras?.toLowerCase() === codigoNormalizado
    );
  }

  // Soporte para lector de código de barras: un lector USB "escribe" el
  // código y termina con Enter, como si fuera un teclado. Si lo que hay en
  // el buscador coincide EXACTO con el código de un producto, lo agregamos
  // directo al carrito y limpiamos el campo — así el cajero no tiene que
  // buscar en la lista ni hacer clic, el siguiente escaneo ya puede escribirse.
  function manejarEnterBusqueda(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const producto = buscarPorCodigoExacto(busquedaProducto);
    if (producto) {
      agregarAlCarrito(producto);
      setBusquedaProducto("");
    }
  }

  // Al detectar un código con la cámara: si hay match exacto, se agrega solo
  // al carrito (igual que el lector USB); si no, se deja el código escrito en
  // el buscador para que el cajero lo revise a mano.
  function manejarCodigoEscaneado(codigo: string) {
    setMostrarEscaner(false);
    const producto = buscarPorCodigoExacto(codigo);
    if (producto) {
      agregarAlCarrito(producto);
    } else {
      setBusquedaProducto(codigo);
      mostrarToast("No se encontró ningún producto con ese código", "error");
    }
  }

  // Precio a MOSTRAR según la categoría de precio del cliente elegido —
  // costoPromedioActual × (1 + %/100), mismo cálculo que hace el backend
  // (ver utils/precios.ts) — el precio real que se cobra siempre lo decide
  // el backend, esto es solo para que la pantalla no muestre un total
  // distinto al que después aparece en la factura. null = el producto
  // todavía no tiene costo (nunca se compró) — no se puede vender.
  function precioMostrado(producto: Producto): number | null {
    if (!producto.costoPromedioActual || !clienteSeleccionado?.tipoPrecio) return null;
    return Number(producto.costoPromedioActual) * (1 + Number(clienteSeleccionado.tipoPrecio.porcentajeGanancia) / 100);
  }

  // Aproximación del total CON IVA para poder calcular el vuelto antes de
  // confirmar — el monto real que se cobra siempre usa el total que devuelve
  // el backend (con Decimal exacto), esto es solo para la vista previa.
  // Los productos sin costo (todavía no comprados) no aportan nada a esta
  // estimación — la venta real fallará igual si se intenta confirmar así.
  const totalCarrito = carrito.reduce((acumulado, item) => {
    const precioUnitario = precioMostrado(item.producto) ?? 0;
    const subtotalItem = precioUnitario * item.cantidad;
    const aplicaIva = tipoComprobante === "FACTURA" ? true : aplicaIvaNotaVenta;
    const ivaPorcentaje = aplicaIva ? parseFloat(item.producto.ivaPorcentaje) : 0;
    return acumulado + subtotalItem + subtotalItem * (ivaPorcentaje / 100);
  }, 0);

  const mostrarCalculadoraEfectivo = modoCobro === "COMPLETO" && formaPago === "EFECTIVO";
  const vuelto = mostrarCalculadoraEfectivo && montoRecibido !== "" ? parseFloat(montoRecibido) - totalCarrito : null;

  // Reparto en partes iguales del saldo que queda DESPUÉS del abono — la
  // última cuota absorbe el centavo de redondeo que las demás no se llevan,
  // para que la suma exacta siempre dé el saldo completo.
  const saldoParaCuotas = Math.max(totalCarrito - (parseFloat(montoAbono) || 0), 0);
  const cuotasCalculadas =
    modoCobro === "PARCIAL" && usarCuotas && saldoParaCuotas > 0
      ? Array.from({ length: numeroCuotas }, (_, i) => {
          const montoBase = Math.floor((saldoParaCuotas / numeroCuotas) * 100) / 100;
          const esUltima = i === numeroCuotas - 1;
          const monto = esUltima ? Number((saldoParaCuotas - montoBase * (numeroCuotas - 1)).toFixed(2)) : montoBase;
          return { numero: i + 1, monto, fechaVencimiento: fechasCuotas[i] || "" };
        })
      : [];
  const cuotasValidas = !usarCuotas || (cuotasCalculadas.length > 0 && cuotasCalculadas.every((c) => c.fechaVencimiento !== ""));

  const cobroValido =
    (modoCobro === "PENDIENTE" ||
      (modoCobro === "COMPLETO" &&
        (formaPago !== "EFECTIVO" || (montoRecibido !== "" && parseFloat(montoRecibido) >= totalCarrito))) ||
      (modoCobro === "PARCIAL" && montoAbono !== "" && parseFloat(montoAbono) > 0 && parseFloat(montoAbono) <= totalCarrito && cuotasValidas)) &&
    (modoCobro === "PENDIENTE" || !exigeCuentaBancaria || cuentaBancariaId !== "");

  const crearVenta = useMutation({
    mutationFn: async () => {
      const ruta = tipoComprobante === "FACTURA" ? "/facturas" : "/notas-venta";
      return api.post<Factura | NotaVenta>(ruta, {
        clienteId,
        bodegaId,
        items: carrito.map((item) => ({ productoId: item.producto.id, cantidad: item.cantidad })),
        ...(tipoComprobante === "NOTA_VENTA" ? { aplicaIva: aplicaIvaNotaVenta } : {}),
        ...(modoCobro !== "COMPLETO" && fechaVencimiento ? { fechaVencimiento } : {}),
        // OJO: el plan de cuotas NO va acá — va en el registro del abono
        // inicial (ver confirmarVentaConCobro), porque tiene que crearse
        // DESPUÉS de aplicar ese abono. Si se creara junto con la venta, el
        // abono (que llega en la llamada siguiente) chocaría con la cuota 1
        // ya pendiente y el backend lo rechazaría por no coincidir el monto.
        //
        // formaPago/tarjetaTipo SÍ van acá (solo para Factura, que es la
        // única que se manda al SRI) — es la forma de pago elegida en
        // pantalla AL MOMENTO de confirmar, para que el XML declare el
        // método real en vez de "efectivo" por default (ver
        // codigoFormaPagoSri en el backend). No crea ningún Pago por sí
        // sola, eso lo sigue haciendo la llamada de abajo.
        ...(tipoComprobante === "FACTURA" && modoCobro !== "PENDIENTE" ? { formaPago, tarjetaTipo } : {}),
      });
    },
  });

  // Crea la factura/nota de venta y, si corresponde, registra el cobro
  // (completo o abono parcial) contra ese mismo documento recién creado —
  // son dos llamadas al backend, no una transacción única, pero si la del
  // pago llegara a fallar la venta ya quedó guardada y el pago se puede
  // registrar después a mano sin perder nada.
  async function confirmarVentaConCobro() {
    let respuestaVenta;
    try {
      respuestaVenta = await crearVenta.mutateAsync();
    } catch {
      return; // crearVenta.isError ya muestra el mensaje en el JSX
    }

    const documento = respuestaVenta.data;

    if (modoCobro !== "PENDIENTE") {
      setRegistrandoCobro(true);
      const monto = modoCobro === "COMPLETO" ? parseFloat(documento.total) : parseFloat(montoAbono);
      const endpointPago =
        tipoComprobante === "FACTURA" ? `/facturas/${documento.id}/pagos` : `/notas-venta/${documento.id}/pagos`;
      try {
        await api.post(endpointPago, {
          monto,
          formaPago,
          cuentaBancariaId: exigeCuentaBancaria ? cuentaBancariaId : undefined,
          referencia: referencia || undefined,
          bancoOrigenId: exigeCuentaBancaria ? bancoOrigenId || undefined : undefined,
          numeroCuentaOrigen: formaPago === "TRANSFERENCIA" ? numeroCuentaOrigen || undefined : undefined,
          tarjetaUltimosDigitos: formaPago === "TARJETA" ? tarjetaUltimosDigitos || undefined : undefined,
          tarjetaTipo: formaPago === "TARJETA" ? tarjetaTipo : undefined,
          tarjetaReferencia: formaPago === "TARJETA" ? tarjetaReferencia || undefined : undefined,
          tarjetaLote: formaPago === "TARJETA" ? tarjetaLote || undefined : undefined,
          chequeNumero: formaPago === "CHEQUE" ? chequeNumero || undefined : undefined,
          chequeFechaCobro: formaPago === "CHEQUE" ? chequeFechaCobro || undefined : undefined,
          // El plan de cuotas se crea junto con ESTE pago (el abono
          // inicial), nunca junto con la venta — ver el comentario en
          // crearVenta más arriba.
          ...(modoCobro === "PARCIAL" && usarCuotas && cuotasCalculadas.length > 0 ? { cuotas: cuotasCalculadas } : {}),
        });
      } catch (error: any) {
        mostrarToast(
          `La venta se registró, pero no se pudo registrar el cobro: ${
            error.response?.data?.error ?? "error desconocido"
          }. Regístralo manualmente desde ${tipoComprobante === "FACTURA" ? "Facturas" : "Notas de Venta"}.`
        );
      }
      setRegistrandoCobro(false);
    }

    setVentaCreada({
      id: documento.id,
      secuencial: documento.secuencial,
      total: documento.total,
      tipo: tipoComprobante,
    });
    setCarrito([]);
    setClienteId("");
    setBodegaId(""); // el efecto de arriba la vuelve a preseleccionar si hay una sola bodega
    setAplicaIvaNotaVenta(false);
    setModoCobro("COMPLETO");
    setFormaPago("EFECTIVO");
    setCuentaBancariaId("");
    setMontoAbono("");
    setMontoRecibido("");
    setFechaVencimiento("");
    setReferencia("");
    setBancoOrigenId("");
    setNumeroCuentaOrigen("");
    setTarjetaUltimosDigitos("");
    setTarjetaTipo("DEBITO");
    setTarjetaReferencia("");
    setTarjetaLote("");
    setChequeNumero("");
    setChequeFechaCobro("");
    setUsarCuotas(false);
    setNumeroCuotas(2);
    setFechasCuotas(["", ""]);
    // El stock y las cuentas por cobrar cambiaron, así que invalidamos esas consultas.
    queryClient.invalidateQueries({ queryKey: ["productos"] });
    queryClient.invalidateQueries({ queryKey: ["facturas"] });
    queryClient.invalidateQueries({ queryKey: ["notas-venta"] });
    queryClient.invalidateQueries({ queryKey: ["reporte-cuentas-por-cobrar"] });
  }

  // --- Pantalla de confirmación después de una venta exitosa ---
  if (ventaCreada) {
    const esFactura = ventaCreada.tipo === "FACTURA";
    const base = esFactura ? `/facturas/${ventaCreada.id}` : `/notas-venta/${ventaCreada.id}`;
    const rutaPdf = esFactura ? `${base}/ride` : `${base}/recibo`;
    const rutaTermico = `${base}/recibo-termico`;
    return (
      <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 p-8 max-w-md mx-auto text-center">
        <div className="text-emerald-600 dark:text-emerald-400 text-4xl mb-2">✓</div>
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">Venta registrada</h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
          {esFactura ? "Factura" : "Nota de venta"} No. {ventaCreada.secuencial}
        </p>
        <p className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-6">${ventaCreada.total}</p>
        <div className="flex flex-wrap gap-2 justify-center">
          <button
            onClick={() => abrirPdfEnNuevaPestana(rutaPdf)}
            className="bg-slate-800 dark:bg-slate-700 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-slate-700 dark:hover:bg-slate-600"
          >
            Ver {esFactura ? "factura" : "recibo"} (PDF)
          </button>
          <button
            onClick={() => abrirPdfEnNuevaPestana(rutaTermico)}
            className="bg-white dark:bg-gray-800 text-slate-800 dark:text-slate-200 border border-slate-800 dark:border-slate-500 px-4 py-2 rounded-md text-sm font-medium hover:bg-slate-50 dark:hover:bg-gray-700"
          >
            Imprimir recibo (80mm)
          </button>
          <button
            onClick={() => setVentaCreada(null)}
            className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            Nueva venta
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      {/* Columna izquierda: lista de productos para agregar */}
      <div className="col-span-2 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 p-4">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3">Productos</h2>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            placeholder="Buscar por nombre o código, o escanea un código de barras..."
            value={busquedaProducto}
            onChange={(e) => setBusquedaProducto(e.target.value)}
            onKeyDown={manejarEnterBusqueda}
            className="flex-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
            autoFocus
          />
          <button
            type="button"
            onClick={() => setMostrarEscaner(true)}
            title="Escanear con la cámara"
            className="shrink-0 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-md px-3 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <Camera strokeWidth={1.75} className="w-5 h-5" />
          </button>
        </div>
        {productosFiltrados?.length === 0 && (
          <p className="text-sm text-gray-400 dark:text-gray-500">Sin resultados para "{busquedaProducto}"</p>
        )}
        <div className="grid grid-cols-2 gap-2">
          {productosFiltrados?.map((p) => (
            <button
              key={p.id}
              onClick={() => agregarAlCarrito(p)}
              disabled={stockDisponible(p) <= 0}
              className="flex items-center gap-3 text-left border border-gray-200 dark:border-gray-700 rounded-md p-3 hover:border-slate-400 dark:hover:border-slate-500 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ImagenProducto producto={p} tamano={40} />
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{p.nombre}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {precioMostrado(p) !== null ? `$${precioMostrado(p)!.toFixed(2)}` : "Sin costo"} · Stock: {stockDisponible(p)}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Columna derecha: carrito */}
      <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 p-4 flex flex-col">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">Carrito</h2>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
          {miSucursal ? `Vendiendo desde: ${miSucursal.nombre}` : "Tu usuario no tiene sucursal asignada"}
        </p>
        {bodegas && bodegas.length > 1 && (
          <select
            value={bodegaId}
            onChange={(e) => setBodegaId(e.target.value ? Number(e.target.value) : "")}
            className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1.5 text-sm mb-3"
          >
            <option value="">Bodega...</option>
            {bodegas.map((b) => (
              <option key={b.id} value={b.id}>{b.nombre}</option>
            ))}
          </select>
        )}

        <div className="flex gap-2 mb-3">
          <button
            type="button"
            onClick={() => setTipoComprobante("FACTURA")}
            className={`flex-1 px-3 py-2 rounded-md text-sm font-medium border transition-colors ${
              tipoComprobante === "FACTURA"
                ? "bg-slate-800 dark:bg-slate-700 text-white border-slate-800 dark:border-slate-700"
                : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"
            }`}
          >
            Factura
          </button>
          <button
            type="button"
            onClick={() => setTipoComprobante("NOTA_VENTA")}
            className={`flex-1 px-3 py-2 rounded-md text-sm font-medium border transition-colors ${
              tipoComprobante === "NOTA_VENTA"
                ? "bg-slate-800 dark:bg-slate-700 text-white border-slate-800 dark:border-slate-700"
                : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"
            }`}
          >
            Nota de venta
          </button>
        </div>
        {tipoComprobante === "NOTA_VENTA" && (
          <div className="mb-3">
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
              Recibo interno, no se envía al SRI. Úsalo cuando el cliente no necesita factura formal.
            </p>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={aplicaIvaNotaVenta}
                onChange={(e) => setAplicaIvaNotaVenta(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              Aplicar IVA en esta nota de venta
            </label>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              En Ecuador, la nota de venta normalmente NO desglosa IVA. Actívalo solo si este caso lo requiere.
            </p>
          </div>
        )}

        <BuscadorCliente
          clienteId={clienteId}
          onSeleccionar={(id, cliente) => {
            setClienteId(id);
            setClienteSeleccionado(cliente ?? null);
          }}
        />

        <div className="flex-1 space-y-2 mb-3">
          {carrito.length === 0 && <p className="text-sm text-gray-400 dark:text-gray-500">Carrito vacío</p>}
          {carrito.map((item) => (
            <div key={item.producto.id} className="flex items-center justify-between text-sm border-b border-gray-100 dark:border-gray-700 pb-2">
              <div>
                <p className="font-medium text-gray-800 dark:text-gray-100">{item.producto.nombre}</p>
                <p className="text-gray-500 dark:text-gray-400">
                  {precioMostrado(item.producto) !== null ? `$${precioMostrado(item.producto)!.toFixed(2)} c/u` : "Sin costo — no se puede vender"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={stockDisponible(item.producto)}
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

        {/* --- Cobro: se resuelve aquí mismo, al confirmar la venta --- */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mb-3">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Cobro</p>
          <div className="flex gap-1 mb-2">
            {([
              { valor: "COMPLETO" as const, etiqueta: "Pago completo" },
              { valor: "PARCIAL" as const, etiqueta: "Abono parcial" },
              { valor: "PENDIENTE" as const, etiqueta: "Queda pendiente" },
            ]).map((opcion) => (
              <button
                key={opcion.valor}
                type="button"
                onClick={() => setModoCobro(opcion.valor)}
                className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                  modoCobro === opcion.valor
                    ? "bg-slate-800 dark:bg-slate-700 text-white border-slate-800 dark:border-slate-700"
                    : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"
                }`}
              >
                {opcion.etiqueta}
              </button>
            ))}
          </div>

          {modoCobro !== "COMPLETO" && (
            <div className="mb-2">
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Vence el (opcional)</label>
              <input
                type="date"
                value={fechaVencimiento}
                onChange={(e) => setFechaVencimiento(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1.5 text-sm"
              />
            </div>
          )}

          {modoCobro !== "PENDIENTE" && (
            <div className="space-y-2">
              <select
                value={formaPago}
                onChange={(e) => {
                  setFormaPago(e.target.value);
                  setCuentaBancariaId("");
                  setBancoOrigenId("");
                  setNumeroCuentaOrigen("");
                  setTarjetaUltimosDigitos("");
                  setTarjetaReferencia("");
                  setTarjetaLote("");
                  setChequeNumero("");
                  setChequeFechaCobro("");
                }}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1.5 text-sm"
              >
                {FORMAS_PAGO.map((forma) => (
                  <option key={forma} value={forma}>
                    {forma}
                  </option>
                ))}
              </select>

              {exigeCuentaBancaria &&
                (cuentasBancarias?.length === 0 ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    No hay cuentas bancarias configuradas — créalas en Administración &gt; Cuentas Bancarias.
                  </p>
                ) : (
                  <select
                    required
                    value={cuentaBancariaId}
                    onChange={(e) => setCuentaBancariaId(Number(e.target.value))}
                    className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1.5 text-sm"
                  >
                    <option value="" disabled>
                      Selecciona una cuenta bancaria
                    </option>
                    {cuentasBancarias?.map((cb) => (
                      <option key={cb.id} value={cb.id}>
                        {cb.nombre} — {cb.banco} {cb.numeroCuenta}
                      </option>
                    ))}
                  </select>
                ))}

              {formaPago === "TRANSFERENCIA" && (
                <div className="grid grid-cols-2 gap-2">
                  <SelectorBanco value={bancoOrigenId} onChange={setBancoOrigenId} label="Banco de procedencia" />
                  <input
                    type="text"
                    placeholder="N° de cuenta de origen"
                    value={numeroCuentaOrigen}
                    onChange={(e) => setNumeroCuentaOrigen(e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1.5 text-sm"
                  />
                </div>
              )}
              {formaPago === "TARJETA" && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <SelectorBanco value={bancoOrigenId} onChange={setBancoOrigenId} label="Banco emisor" />
                    <div className="flex gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={4}
                        placeholder="Últimos 4 dígitos"
                        value={tarjetaUltimosDigitos}
                        onChange={(e) => setTarjetaUltimosDigitos(e.target.value.replace(/\D/g, "").slice(0, 4))}
                        className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1.5 text-sm"
                      />
                      <select
                        value={tarjetaTipo}
                        onChange={(e) => setTarjetaTipo(e.target.value)}
                        className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1.5 text-sm"
                      >
                        <option value="DEBITO">Débito</option>
                        <option value="CREDITO">Crédito</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="N° de referencia"
                      value={tarjetaReferencia}
                      onChange={(e) => setTarjetaReferencia(e.target.value)}
                      className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1.5 text-sm"
                    />
                    <input
                      type="text"
                      placeholder="N° de lote"
                      value={tarjetaLote}
                      onChange={(e) => setTarjetaLote(e.target.value)}
                      className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1.5 text-sm"
                    />
                  </div>
                </div>
              )}
              {formaPago === "CHEQUE" && (
                <div className="grid grid-cols-3 gap-2">
                  <SelectorBanco value={bancoOrigenId} onChange={setBancoOrigenId} label="Banco emisor" />
                  <input
                    type="text"
                    placeholder="N° de cheque"
                    value={chequeNumero}
                    onChange={(e) => setChequeNumero(e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1.5 text-sm"
                  />
                  <input
                    type="date"
                    title="Fecha de cobro del cheque"
                    value={chequeFechaCobro}
                    onChange={(e) => setChequeFechaCobro(e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1.5 text-sm"
                  />
                </div>
              )}
              {exigeCuentaBancaria && (
                <input
                  type="text"
                  placeholder="Referencia (opcional)"
                  value={referencia}
                  onChange={(e) => setReferencia(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1.5 text-sm"
                />
              )}

              {modoCobro === "PARCIAL" && (
                <>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={totalCarrito || undefined}
                    placeholder={`Monto del abono (máx. $${totalCarrito.toFixed(2)})`}
                    value={montoAbono}
                    onChange={(e) => setMontoAbono(e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1.5 text-sm"
                  />
                  <div className="border border-gray-200 dark:border-gray-700 rounded-md p-2 space-y-2">
                    <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                      <input
                        type="checkbox"
                        checked={usarCuotas}
                        onChange={(e) => setUsarCuotas(e.target.checked)}
                        className="rounded border-gray-300 dark:border-gray-600"
                      />
                      Dividir el saldo restante en cuotas
                    </label>
                    {usarCuotas && (
                      <>
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-500 dark:text-gray-400 shrink-0">N° de cuotas</label>
                          <select
                            value={numeroCuotas}
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              setNumeroCuotas(n);
                              setFechasCuotas((actual) => Array.from({ length: n }, (_, i) => actual[i] ?? ""));
                            }}
                            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1 text-sm"
                          >
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            Saldo a repartir: ${saldoParaCuotas.toFixed(2)}
                          </span>
                        </div>
                        {cuotasCalculadas.map((c, i) => (
                          <div key={c.numero} className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 dark:text-gray-400 w-16 shrink-0">Cuota {c.numero}</span>
                            <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 w-16 shrink-0">
                              ${c.monto.toFixed(2)}
                            </span>
                            <input
                              type="date"
                              required
                              value={fechasCuotas[i] || ""}
                              onChange={(e) =>
                                setFechasCuotas((actual) => actual.map((f, idx) => (idx === i ? e.target.value : f)))
                              }
                              className="flex-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-2 py-1 text-sm"
                            />
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </>
              )}

              {mostrarCalculadoraEfectivo && (
                <div className="bg-gray-50 dark:bg-gray-900/40 rounded-md p-2 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500 dark:text-gray-400 w-14 shrink-0">Recibe</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={montoRecibido}
                      onChange={(e) => setMontoRecibido(e.target.value)}
                      className="flex-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded px-2 py-1 text-sm"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400 w-14 shrink-0">Vuelto</span>
                    <span
                      className={`text-sm font-semibold ${
                        vuelto !== null && vuelto < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
                      }`}
                    >
                      {vuelto !== null ? `$${vuelto.toFixed(2)}` : "—"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
          <div className="flex justify-between font-semibold text-gray-800 dark:text-gray-100 mb-3">
            <span>Total (aprox.)</span>
            <span>${totalCarrito.toFixed(2)}</span>
          </div>
          <button
            onClick={confirmarVentaConCobro}
            disabled={carrito.length === 0 || !clienteId || !bodegaId || crearVenta.isPending || registrandoCobro || !cobroValido}
            className="w-full bg-brand-600 text-white py-2 rounded-md text-sm font-medium hover:bg-brand-700 disabled:opacity-40"
          >
            {crearVenta.isPending || registrandoCobro
              ? "Procesando..."
              : tipoComprobante === "FACTURA"
              ? "Confirmar factura"
              : "Confirmar nota de venta"}
          </button>
          {crearVenta.isError && (
            <p className="text-red-600 dark:text-red-400 text-sm mt-2">
              {(crearVenta.error as any)?.response?.data?.error ?? "Error al crear la venta. Revisa el stock disponible."}
            </p>
          )}
        </div>
      </div>

      {mostrarEscaner && (
        <EscanerCodigoBarras onDetectado={manejarCodigoEscaneado} onCerrar={() => setMostrarEscaner(false)} />
      )}
    </div>
  );
}
