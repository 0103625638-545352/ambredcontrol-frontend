import { useState, useEffect, useRef } from "react";
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
import {
  CLASE_CAMPO,
  CLASE_SOLO_LECTURA,
  CLASE_ETIQUETA,
  CLASE_TH,
  Segmentado,
  FilaTotal,
} from "../components/FormatoDocumento";

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
  const [mostrarCatalogo, setMostrarCatalogo] = useState(false);
  // Línea de ingreso de ítem (arriba del detalle): el producto elegido en
  // el buscador queda acá, con su cantidad, hasta que se presiona Agregar.
  const [productoEnIngreso, setProductoEnIngreso] = useState<Producto | null>(null);
  const [cantidadIngreso, setCantidadIngreso] = useState("1");
  const refBusqueda = useRef<HTMLInputElement>(null);
  const refCantidad = useRef<HTMLInputElement>(null);

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

  function agregarAlCarrito(producto: Producto, cantidad = 1) {
    const cantidadValida = Math.max(1, Math.trunc(cantidad) || 1);
    setCarrito((actual) => {
      const yaExiste = actual.find((item) => item.producto.id === producto.id);
      if (yaExiste) {
        // Si ya está en el carrito, solo aumentamos la cantidad (sin pasar el stock disponible)
        return actual.map((item) =>
          item.producto.id === producto.id
            ? { ...item, cantidad: Math.min(item.cantidad + cantidadValida, stockDisponible(producto)) }
            : item
        );
      }
      return [...actual, { producto, cantidad: Math.min(cantidadValida, stockDisponible(producto)) }];
    });
  }

  // Clic en un resultado del buscador: lo carga en la línea de ingreso y
  // pasa el foco a Cantidad (Enter ahí lo agrega al detalle).
  function seleccionarParaIngreso(producto: Producto) {
    setProductoEnIngreso(producto);
    setBusquedaProducto("");
    setMostrarCatalogo(false);
    setTimeout(() => refCantidad.current?.select(), 0);
  }

  function agregarProductoEnIngreso() {
    if (!productoEnIngreso) return;
    agregarAlCarrito(productoEnIngreso, Number(cantidadIngreso));
    setProductoEnIngreso(null);
    setCantidadIngreso("1");
    refBusqueda.current?.focus();
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
      agregarAlCarrito(producto, Number(cantidadIngreso));
      setBusquedaProducto("");
      setProductoEnIngreso(null);
      setCantidadIngreso("1");
    } else if (productosFiltrados?.length === 1 && stockDisponible(productosFiltrados[0]) > 0) {
      // Un solo resultado por nombre: se carga en la línea de ingreso.
      seleccionarParaIngreso(productosFiltrados[0]);
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

  // Atajo de teclado F9 = confirmar, como en los sistemas contables de
  // escritorio. Sin arreglo de dependencias a propósito: se vuelve a
  // registrar en cada render para leer siempre el estado más reciente.
  const puedeConfirmar =
    carrito.length > 0 && !!clienteId && !!bodegaId && !crearVenta.isPending && !registrandoCobro && cobroValido;
  useEffect(() => {
    function manejarTecla(e: KeyboardEvent) {
      if (e.key !== "F9" || ventaCreada) return;
      e.preventDefault();
      if (puedeConfirmar) confirmarVentaConCobro();
    }
    window.addEventListener("keydown", manejarTecla);
    return () => window.removeEventListener("keydown", manejarTecla);
  });

  // --- Pantalla de confirmación después de una venta exitosa ---
  if (ventaCreada) {
    const esFactura = ventaCreada.tipo === "FACTURA";
    const base = esFactura ? `/facturas/${ventaCreada.id}` : `/notas-venta/${ventaCreada.id}`;
    const rutaPdf = esFactura ? `${base}/ride` : `${base}/recibo`;
    const rutaTermico = `${base}/recibo-termico`;
    return (
      <div className="max-w-md mx-auto bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700">
        <div className="px-6 py-5 border-b border-dashed border-stone-300 dark:border-gray-600">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-400 mb-2">
            ✓ Venta registrada
          </p>
          <h2 className="font-serif text-3xl text-gray-900 dark:text-gray-50">
            {esFactura ? "Factura" : "Nota de venta"}
          </h2>
          <p className="font-mono text-sm text-gray-500 dark:text-gray-400">No. {ventaCreada.secuencial}</p>
        </div>
        <div className="px-6 py-4 flex items-baseline justify-between border-b border-stone-200 dark:border-gray-700">
          <span className={CLASE_ETIQUETA}>Total USD</span>
          <span className="font-mono text-3xl font-semibold tabular-nums text-gray-900 dark:text-gray-50">
            {ventaCreada.total}
          </span>
        </div>
        <div className="px-6 py-4 grid grid-cols-2 gap-2">
          <button
            onClick={() => abrirPdfEnNuevaPestana(rutaPdf)}
            className="bg-brand-700 text-white px-3 py-2 rounded-sm text-sm font-semibold hover:bg-brand-800"
          >
            Ver {esFactura ? "factura" : "recibo"} (PDF)
          </button>
          <button
            onClick={() => abrirPdfEnNuevaPestana(rutaTermico)}
            className="border border-stone-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 px-3 py-2 rounded-sm text-sm font-semibold hover:bg-stone-50 dark:hover:bg-gray-700"
          >
            Imprimir recibo (80mm)
          </button>
          <button
            onClick={() => setVentaCreada(null)}
            className="col-span-2 flex items-center justify-between border border-stone-300 dark:border-gray-600 text-gray-800 dark:text-gray-100 px-4 py-2.5 rounded-sm text-sm font-semibold hover:bg-stone-50 dark:hover:bg-gray-700"
          >
            <span>Nueva venta</span>
            <span aria-hidden>→</span>
          </button>
        </div>
      </div>
    );
  }

  // Desglose de totales como en el RIDE (subtotal por tarifa de IVA, IVA por
  // tarifa) — misma estimación que totalCarrito, solo que separada por
  // tarifa para mostrarla. El valor real siempre lo calcula el backend.
  const aplicaIvaVenta = tipoComprobante === "FACTURA" || aplicaIvaNotaVenta;
  const subtotalPorTarifa = carrito.reduce<Record<number, number>>((acumulado, item) => {
    const subtotalItem = (precioMostrado(item.producto) ?? 0) * item.cantidad;
    const tarifa = aplicaIvaVenta ? parseFloat(item.producto.ivaPorcentaje) : 0;
    acumulado[tarifa] = (acumulado[tarifa] ?? 0) + subtotalItem;
    return acumulado;
  }, {});
  const tarifasConIva = Object.keys(subtotalPorTarifa)
    .map(Number)
    .filter((t) => t > 0)
    .sort((a, b) => b - a);

  const mostrarResultados = textoBusqueda !== "" || mostrarCatalogo;
  const precioEnIngreso = productoEnIngreso ? precioMostrado(productoEnIngreso) : null;

  return (
    <div className="bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700">
      {/* --- Barra superior: tipo de comprobante y estado del documento --- */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-stone-300 dark:border-gray-700">
        <div className="flex items-center gap-4">
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-50">Nueva venta</h2>
          <Segmentado
            opciones={[
              { valor: "FACTURA", etiqueta: "Factura" },
              { valor: "NOTA_VENTA", etiqueta: "Nota de venta" },
            ]}
            valor={tipoComprobante}
            onCambiar={setTipoComprobante}
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] text-gray-400 dark:text-gray-500">
            {carrito.length} {carrito.length === 1 ? "ítem" : "ítems"}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider border border-current px-1.5 py-0.5 text-amber-700 dark:text-amber-400">
            Borrador
          </span>
        </div>
      </div>

      {tipoComprobante === "NOTA_VENTA" && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 bg-stone-50 dark:bg-gray-900/40 border-b border-stone-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
          <span>Recibo interno, no se envía al SRI. Úsalo cuando el cliente no necesita factura formal.</span>
          <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={aplicaIvaNotaVenta}
              onChange={(e) => setAplicaIvaNotaVenta(e.target.checked)}
              className="rounded border-stone-300 dark:border-gray-600"
            />
            Aplicar IVA (normalmente la nota de venta no lo desglosa)
          </label>
        </div>
      )}

      {/* --- Cabecera del documento: cliente, fecha, sucursal, bodega --- */}
      <div className="grid grid-cols-[max-content_minmax(0,1fr)_max-content_minmax(0,1fr)] xl:grid-cols-[max-content_minmax(0,1.6fr)_max-content_minmax(0,1fr)_max-content_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-4">
        <span className={`${CLASE_ETIQUETA} whitespace-nowrap`}>Cliente</span>
        <div className="col-span-3 [&>div]:mb-0">
          <BuscadorCliente
            clienteId={clienteId}
            onSeleccionar={(id, cliente) => {
              setClienteId(id);
              setClienteSeleccionado(cliente ?? null);
            }}
          />
        </div>
        <span className={`${CLASE_ETIQUETA} whitespace-nowrap`}>Fecha emisión</span>
        <div className={`${CLASE_SOLO_LECTURA} font-mono`}>{new Date().toLocaleDateString("es-EC")}</div>

        <span className={`${CLASE_ETIQUETA} whitespace-nowrap`}>Tipo de precio</span>
        <div className={CLASE_SOLO_LECTURA}>
          {clienteSeleccionado?.tipoPrecio
            ? `${clienteSeleccionado.tipoPrecio.nombre} (+${Number(clienteSeleccionado.tipoPrecio.porcentajeGanancia)}%)`
            : "—"}
        </div>
        <span className={`${CLASE_ETIQUETA} whitespace-nowrap`}>Sucursal</span>
        <div className={CLASE_SOLO_LECTURA}>{miSucursal ? miSucursal.nombre : "Sin sucursal asignada"}</div>
        <span className={`${CLASE_ETIQUETA} whitespace-nowrap`}>Bodega</span>
        {bodegas && bodegas.length > 1 ? (
          <select
            value={bodegaId}
            onChange={(e) => setBodegaId(e.target.value ? Number(e.target.value) : "")}
            className={CLASE_CAMPO}
          >
            <option value="">Selecciona...</option>
            {bodegas.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nombre}
              </option>
            ))}
          </select>
        ) : (
          <div className={CLASE_SOLO_LECTURA}>{bodegas?.[0]?.nombre ?? "—"}</div>
        )}
      </div>

      {/* --- Línea de ingreso de ítem (buscador / lector de código de barras) --- */}
      <div className="mx-4 border border-stone-300 dark:border-gray-700 bg-stone-50 dark:bg-gray-900/40">
        <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)_80px_100px_80px_60px_auto] items-end gap-2 p-2.5">
          <label className="flex flex-col gap-1 min-w-0">
            <span className={CLASE_ETIQUETA}>Código / barras / nombre</span>
            <input
              ref={refBusqueda}
              type="text"
              placeholder="Escribe o escanea..."
              value={busquedaProducto}
              onChange={(e) => setBusquedaProducto(e.target.value)}
              onKeyDown={manejarEnterBusqueda}
              className={`${CLASE_CAMPO} font-mono`}
              autoFocus
            />
          </label>
          <div className="flex flex-col gap-1 min-w-0">
            <span className={CLASE_ETIQUETA}>Descripción</span>
            <div className={`${CLASE_SOLO_LECTURA} truncate`}>{productoEnIngreso?.nombre ?? "—"}</div>
          </div>
          <label className="flex flex-col gap-1">
            <span className={CLASE_ETIQUETA}>Cantidad</span>
            <input
              ref={refCantidad}
              type="number"
              min={1}
              value={cantidadIngreso}
              onChange={(e) => setCantidadIngreso(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") agregarProductoEnIngreso();
              }}
              className={`${CLASE_CAMPO} text-right font-mono`}
            />
          </label>
          <div className="flex flex-col gap-1">
            <span className={CLASE_ETIQUETA}>Precio unit.</span>
            <div className={`${CLASE_SOLO_LECTURA} text-right font-mono`}>
              {productoEnIngreso ? (precioEnIngreso !== null ? precioEnIngreso.toFixed(4) : "Sin costo") : "—"}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className={CLASE_ETIQUETA}>Stock</span>
            <div className={`${CLASE_SOLO_LECTURA} text-right font-mono`}>
              {productoEnIngreso ? stockDisponible(productoEnIngreso) : "—"}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className={CLASE_ETIQUETA}>IVA</span>
            <div className={`${CLASE_SOLO_LECTURA} font-mono`}>
              {productoEnIngreso ? `${Number(productoEnIngreso.ivaPorcentaje)}%` : "—"}
            </div>
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={agregarProductoEnIngreso}
              disabled={!productoEnIngreso}
              className="bg-brand-700 text-white px-3 py-1.5 rounded-sm text-sm font-semibold hover:bg-brand-800 disabled:opacity-40"
            >
              Agregar ↵
            </button>
            <button
              type="button"
              onClick={() => setMostrarEscaner(true)}
              title="Escanear con la cámara"
              className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-sm px-2 hover:bg-stone-100 dark:hover:bg-gray-700"
            >
              <Camera strokeWidth={1.75} className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setMostrarCatalogo((v) => !v)}
              title="Ver todo el catálogo"
              className={`border rounded-sm px-2 text-xs font-semibold ${
                mostrarCatalogo
                  ? "border-brand-600 text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-900/30"
                  : "border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-stone-100 dark:hover:bg-gray-700"
              }`}
            >
              Catálogo
            </button>
          </div>
        </div>

        {/* Resultados de la búsqueda — en el flujo de la página (no un
            desplegable flotante), clic en una fila la carga en la línea de
            ingreso de arriba. */}
        {mostrarResultados && (
          <div className="border-t border-stone-300 dark:border-gray-700 max-h-64 overflow-y-auto bg-white dark:bg-gray-800">
            {productosFiltrados?.length === 0 ? (
              <p className="px-3 py-2 text-sm text-gray-400 dark:text-gray-500">
                Sin resultados para "{busquedaProducto}"
              </p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {productosFiltrados?.map((p) => {
                    const stock = stockDisponible(p);
                    const precio = precioMostrado(p);
                    return (
                      <tr
                        key={p.id}
                        onClick={() => stock > 0 && seleccionarParaIngreso(p)}
                        className={`border-b border-stone-100 dark:border-gray-700 last:border-b-0 ${
                          stock > 0
                            ? "cursor-pointer hover:bg-brand-50 dark:hover:bg-brand-900/20"
                            : "opacity-40 cursor-not-allowed"
                        } ${productoEnIngreso?.id === p.id ? "bg-brand-50 dark:bg-brand-900/30" : ""}`}
                      >
                        <td className="px-3 py-1.5 w-10">
                          <ImagenProducto producto={p} tamano={28} />
                        </td>
                        <td className="px-2 py-1.5 font-mono text-xs text-gray-500 dark:text-gray-400 w-32">{p.codigo}</td>
                        <td className="px-2 py-1.5 text-gray-800 dark:text-gray-100">{p.nombre}</td>
                        <td className="px-2 py-1.5 font-mono text-xs text-right text-gray-500 dark:text-gray-400 w-24">
                          {stock > 0 ? `Stock ${stock}` : "Agotado"}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-right tabular-nums w-24 text-gray-800 dark:text-gray-100">
                          {precio !== null ? precio.toFixed(2) : "Sin costo"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* --- Detalle del comprobante --- */}
      <div className="mx-4 border border-t-0 border-stone-300 dark:border-gray-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700">
              <th className={`${CLASE_TH} w-10`}>#</th>
              <th className={`${CLASE_TH} w-32`}>Código</th>
              <th className={CLASE_TH}>Descripción</th>
              <th className={`${CLASE_TH} w-20 text-right`}>Stock</th>
              <th className={`${CLASE_TH} w-24 text-right`}>Cantidad</th>
              <th className={`${CLASE_TH} w-28 text-right`}>Precio unit.</th>
              <th className={`${CLASE_TH} w-16 text-right`}>IVA</th>
              <th className={`${CLASE_TH} w-28 text-right`}>Subtotal</th>
              <th className={`${CLASE_TH} w-10`}></th>
            </tr>
          </thead>
          <tbody>
            {carrito.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                  Agrega productos con el buscador, el catálogo o el lector de código de barras.
                </td>
              </tr>
            )}
            {carrito.map((item, indice) => {
              const precio = precioMostrado(item.producto);
              return (
                <tr key={item.producto.id} className="border-b border-stone-100 dark:border-gray-700/60 last:border-b-0">
                  <td className="px-3 py-1.5 font-mono text-xs text-gray-400">{indice + 1}</td>
                  <td className="px-3 py-1.5 font-mono text-xs text-gray-600 dark:text-gray-300">{item.producto.codigo}</td>
                  <td className="px-3 py-1.5 text-gray-800 dark:text-gray-100 uppercase text-[13px]">{item.producto.nombre}</td>
                  <td className="px-3 py-1.5 font-mono text-xs text-right text-gray-400">{stockDisponible(item.producto)}</td>
                  <td className="px-3 py-1 text-right">
                    <input
                      type="number"
                      min={1}
                      max={stockDisponible(item.producto)}
                      value={item.cantidad}
                      onChange={(e) => cambiarCantidad(item.producto.id, Number(e.target.value))}
                      className="w-16 border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm px-1.5 py-0.5 text-right font-mono text-sm focus:outline-none focus:border-brand-600"
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
                    {aplicaIvaVenta ? `${Number(item.producto.ivaPorcentaje)}%` : "0%"}
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
        </table>
      </div>

      {/* --- Pie: cobro a la izquierda, totales a la derecha --- */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4 p-4 items-start">
        <div className="border border-stone-300 dark:border-gray-700">
          <div className="flex justify-between px-3 py-2 border-b border-stone-300 dark:border-gray-700 bg-stone-50 dark:bg-gray-900/40">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.15em] text-gray-600 dark:text-gray-300">Cobro</span>
          </div>
          <div className="p-3 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="flex flex-col gap-1">
                <span className={CLASE_ETIQUETA}>Modalidad</span>
                <Segmentado
                  opciones={[
                    { valor: "COMPLETO", etiqueta: "Completo" },
                    { valor: "PARCIAL", etiqueta: "Abono" },
                    { valor: "PENDIENTE", etiqueta: "Pendiente" },
                  ]}
                  valor={modoCobro}
                  onCambiar={setModoCobro}
                />
              </div>

              {modoCobro !== "PENDIENTE" && (
                <label className="flex flex-col gap-1">
                  <span className={CLASE_ETIQUETA}>Forma de pago</span>
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
                    className={CLASE_CAMPO}
                  >
                    {FORMAS_PAGO.map((forma) => (
                      <option key={forma} value={forma}>
                        {forma}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {mostrarCalculadoraEfectivo && (
                <div className="flex flex-col gap-1">
                  <span className={CLASE_ETIQUETA}>Recibe / Vuelto</span>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={montoRecibido}
                      onChange={(e) => setMontoRecibido(e.target.value)}
                      className={`${CLASE_CAMPO} text-right font-mono`}
                    />
                    <span
                      className={`font-mono font-semibold tabular-nums shrink-0 ${
                        vuelto !== null && vuelto < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"
                      }`}
                    >
                      {vuelto !== null ? vuelto.toFixed(2) : "—"}
                    </span>
                  </div>
                </div>
              )}

              {modoCobro === "PARCIAL" && (
                <label className="flex flex-col gap-1">
                  <span className={CLASE_ETIQUETA}>Monto del abono (máx. {totalCarrito.toFixed(2)})</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={totalCarrito || undefined}
                    placeholder="0.00"
                    value={montoAbono}
                    onChange={(e) => setMontoAbono(e.target.value)}
                    className={`${CLASE_CAMPO} text-right font-mono`}
                  />
                </label>
              )}

              {modoCobro !== "COMPLETO" && (
                <label className="flex flex-col gap-1">
                  <span className={CLASE_ETIQUETA}>Vence el (opcional)</span>
                  <input
                    type="date"
                    value={fechaVencimiento}
                    onChange={(e) => setFechaVencimiento(e.target.value)}
                    className={CLASE_CAMPO}
                  />
                </label>
              )}

              {modoCobro !== "PENDIENTE" && exigeCuentaBancaria && (
                <label className="flex flex-col gap-1 md:col-span-2">
                  <span className={CLASE_ETIQUETA}>Cuenta de la empresa que recibe</span>
                  {cuentasBancarias?.length === 0 ? (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      No hay cuentas bancarias configuradas — créalas en Administración &gt; Cuentas Bancarias.
                    </p>
                  ) : (
                    <select
                      required
                      value={cuentaBancariaId}
                      onChange={(e) => setCuentaBancariaId(Number(e.target.value))}
                      className={CLASE_CAMPO}
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
                  )}
                </label>
              )}
            </div>

            {modoCobro !== "PENDIENTE" && formaPago === "TRANSFERENCIA" && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <SelectorBanco value={bancoOrigenId} onChange={setBancoOrigenId} label="Banco de procedencia" />
                <input
                  type="text"
                  placeholder="N° de cuenta de origen"
                  value={numeroCuentaOrigen}
                  onChange={(e) => setNumeroCuentaOrigen(e.target.value)}
                  className={CLASE_CAMPO}
                />
                <input
                  type="text"
                  placeholder="Referencia (opcional)"
                  value={referencia}
                  onChange={(e) => setReferencia(e.target.value)}
                  className={CLASE_CAMPO}
                />
              </div>
            )}
            {modoCobro !== "PENDIENTE" && formaPago === "TARJETA" && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <SelectorBanco value={bancoOrigenId} onChange={setBancoOrigenId} label="Banco emisor" />
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="Últimos 4 dígitos"
                    value={tarjetaUltimosDigitos}
                    onChange={(e) => setTarjetaUltimosDigitos(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    className={`${CLASE_CAMPO} font-mono`}
                  />
                  <select value={tarjetaTipo} onChange={(e) => setTarjetaTipo(e.target.value)} className={`${CLASE_CAMPO} w-auto`}>
                    <option value="DEBITO">Débito</option>
                    <option value="CREDITO">Crédito</option>
                  </select>
                </div>
                <input
                  type="text"
                  placeholder="Referencia (opcional)"
                  value={referencia}
                  onChange={(e) => setReferencia(e.target.value)}
                  className={CLASE_CAMPO}
                />
                <input
                  type="text"
                  placeholder="N° de referencia del voucher"
                  value={tarjetaReferencia}
                  onChange={(e) => setTarjetaReferencia(e.target.value)}
                  className={CLASE_CAMPO}
                />
                <input
                  type="text"
                  placeholder="N° de lote"
                  value={tarjetaLote}
                  onChange={(e) => setTarjetaLote(e.target.value)}
                  className={CLASE_CAMPO}
                />
              </div>
            )}
            {modoCobro !== "PENDIENTE" && formaPago === "CHEQUE" && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                <SelectorBanco value={bancoOrigenId} onChange={setBancoOrigenId} label="Banco emisor" />
                <input
                  type="text"
                  placeholder="N° de cheque"
                  value={chequeNumero}
                  onChange={(e) => setChequeNumero(e.target.value)}
                  className={`${CLASE_CAMPO} font-mono`}
                />
                <input
                  type="date"
                  title="Fecha de cobro del cheque"
                  value={chequeFechaCobro}
                  onChange={(e) => setChequeFechaCobro(e.target.value)}
                  className={CLASE_CAMPO}
                />
                <input
                  type="text"
                  placeholder="Referencia (opcional)"
                  value={referencia}
                  onChange={(e) => setReferencia(e.target.value)}
                  className={CLASE_CAMPO}
                />
              </div>
            )}

            {modoCobro === "PARCIAL" && (
              <div className="border border-stone-200 dark:border-gray-700 p-2.5 space-y-2">
                <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <input
                    type="checkbox"
                    checked={usarCuotas}
                    onChange={(e) => setUsarCuotas(e.target.checked)}
                    className="rounded border-stone-300 dark:border-gray-600"
                  />
                  Dividir el saldo restante en cuotas
                </label>
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
                        Saldo a repartir: {saldoParaCuotas.toFixed(2)}
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
            )}
          </div>
        </div>

        {/* Totales, en el mismo orden que el RIDE */}
        <div className="space-y-3">
          <div className="border border-stone-300 dark:border-gray-700 text-sm">
            {tarifasConIva.map((tarifa) => (
              <FilaTotal key={`sub-${tarifa}`} etiqueta={`Subtotal ${tarifa}%`} valor={subtotalPorTarifa[tarifa]} />
            ))}
            {tarifasConIva.length === 0 && <FilaTotal etiqueta="Subtotal gravado" valor={0} />}
            <FilaTotal etiqueta="Subtotal 0%" valor={subtotalPorTarifa[0] ?? 0} />
            {tarifasConIva.map((tarifa) => (
              <FilaTotal key={`iva-${tarifa}`} etiqueta={`IVA ${tarifa}%`} valor={(subtotalPorTarifa[tarifa] * tarifa) / 100} />
            ))}
            <div className="flex justify-between px-3 py-2.5 border-t-2 border-gray-900 dark:border-gray-200 font-bold text-base text-gray-900 dark:text-gray-50">
              <span>TOTAL USD</span>
              <span className="font-mono tabular-nums">{totalCarrito.toFixed(2)}</span>
            </div>
          </div>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 -mt-1">
            Valores estimados; el sistema calcula el valor exacto al confirmar.
          </p>

          <button
            onClick={confirmarVentaConCobro}
            disabled={!puedeConfirmar}
            className="w-full flex items-center justify-between bg-brand-700 text-white px-4 py-3 rounded-sm text-sm font-semibold hover:bg-brand-800 disabled:opacity-40"
          >
            <span>
              {crearVenta.isPending || registrandoCobro
                ? "Procesando..."
                : tipoComprobante === "FACTURA"
                ? "Confirmar factura"
                : "Confirmar nota de venta"}
            </span>
            <span className="font-mono text-xs opacity-80">F9 →</span>
          </button>
          {crearVenta.isError && (
            <p className="border-l-2 border-red-600 pl-3 text-red-700 dark:text-red-400 text-sm">
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
