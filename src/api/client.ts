// Cliente centralizado para hablar con nuestro backend.
// Todas las pantallas importan "api" de aquí, en vez de escribir la URL
// completa cada vez — si algún día cambia el puerto o el dominio, se
// actualiza en un solo lugar.

import axios from "axios";

export const URL_BASE_API = import.meta.env.VITE_API_URL || "http://localhost:3000";

export const api = axios.create({
  baseURL: URL_BASE_API,
});

// --- Interceptor de petición: agrega el token a CADA llamada automáticamente ---
// Así, ninguna pantalla (ProductosPage, FacturasPage, etc.) tiene que acordarse
// de mandar el token manualmente — queda centralizado aquí, una sola vez.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// --- Interceptor de respuesta: si el token expiró o es inválido (401),
// borramos la sesión guardada y mandamos al usuario de vuelta al login ---
api.interceptors.response.use(
  (respuesta) => respuesta,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("usuario");
      localStorage.removeItem("empresa");
      window.location.reload(); // recarga la app, que mostrará el login al no encontrar token
    }
    return Promise.reject(error);
  }
);

// --- Abre un PDF protegido (RIDE de factura/nota de crédito) en una pestaña nueva ---
//
// Un <a href="http://localhost:3000/..."> NO sirve para esto: el navegador
// navega directo a esa URL sin pasar por el interceptor de arriba, así que
// el token JWT nunca viaja y el backend responde 401 "No autenticado".
// Por eso pedimos el PDF con "api" (que sí agrega el token) como blob, y
// recién con los bytes en mano lo mostramos.
//
// IMPORTANTE: navegar una ventana obtenida con window.open() hacia una
// blob: URL creada en OTRA ventana no funciona de forma confiable (el
// blob queda "atado" al documento que lo creó). Por eso el <a> con el
// blob se crea y se clickea en este mismo documento — así el navegador
// sí puede resolverlo — y target="_blank" es lo que abre la pestaña nueva.
// Este archivo no es un componente de React (no puede usar hooks), pero
// igual necesita poder avisar errores con el mismo sistema de toasts que usa
// el resto de la app — ToastProvider se registra acá una sola vez al montar.
// Si nadie se registró todavía (ej. algún uso fuera del árbol de React),
// caemos de vuelta a alert() para no perder el aviso silenciosamente.
let notificarError: (mensaje: string) => void = (mensaje) => alert(mensaje);
export function registrarNotificadorError(fn: (mensaje: string) => void) {
  notificarError = fn;
}

export async function abrirPdfEnNuevaPestana(rutaRelativa: string) {
  try {
    const respuesta = await api.get(rutaRelativa, { responseType: "blob" });
    const blobUrl = URL.createObjectURL(respuesta.data);
    const enlace = document.createElement("a");
    enlace.href = blobUrl;
    enlace.target = "_blank";
    enlace.rel = "noopener";
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
    // Liberamos la memoria del blob más tarde, dando tiempo a que la pestaña nueva lo cargue.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  } catch (error) {
    notificarError("No se pudo abrir el PDF. Intenta de nuevo.");
  }
}

// --- Tipos que reflejan lo que devuelve el backend ---
// (Los mantenemos simples a propósito; no necesitamos duplicar el 100%
// del schema de Prisma en el frontend, solo lo que la UI realmente usa)

// Forma que devuelve el backend cuando la petición incluye "?page=" (ver
// backend/src/utils/paginacion.ts). Sin ese parámetro, las mismas rutas
// devuelven el arreglo "pelado" (así siguen funcionando, sin cambios, los
// selectores que necesitan la lista completa: cliente y productos en el
// Punto de Venta, facturas autorizadas en Notas de Crédito).
export interface RespuestaPaginada<T> {
  datos: T[];
  paginacion: {
    page: number;
    pageSize: number;
    total: number;
    totalPaginas: number;
  };
}

export interface Categoria {
  id: number;
  nombre: string;
  activo?: boolean;
  createdAt?: string;
}

export interface Producto {
  id: number;
  codigo: string; // autogenerado por el backend ("PROD-00001"), nunca se escribe a mano
  codigoBarras?: string | null;
  nombre: string;
  // Fabricante (ej. "Mikrotik", "TP-Link", "Hikvision") — opcional, editable, separado de "modelo".
  marca?: string | null;
  // Modelo del fabricante (ej. "RB750Gr3") — opcional, editable, sin significado legal.
  modelo?: string | null;
  descripcion?: string | null;
  imagenUrl?: string | null; // ruta relativa (ej. "/uploads/productos/..."); ver urlImagenProducto()
  ivaPorcentaje: string;
  // Costo promedio ponderado corriente (ver utils/costeoInventario.ts en el
  // backend) — null hasta la primera compra real del producto. El precio de
  // venta NUNCA se guarda: se calcula al vuelo como
  // costoPromedioActual × (1 + tipoPrecio.porcentajeGanancia/100) para la
  // categoría de precio del cliente (ver TipoPrecio, utils/precios.ts). Un
  // producto sin costo todavía no tiene ningún precio calculable.
  costoPromedioActual?: string | null;
  // Ítem no físico (ej. plan de internet, visita técnica): nunca valida ni
  // descuenta stock al facturarlo (ver backend/src/routes/facturas.ts). Casi
  // siempre viene con precioFijo también seteado — ver ahí.
  esServicio?: boolean;
  // Precio de venta fijo (ya con utilidad incluida) — cuando está seteado,
  // se cobra tal cual, ignorando costoPromedioActual y la categoría de
  // precio del cliente (ver backend/src/utils/precios.ts).
  precioFijo?: string | null;
  stockActual: number;
  stockMinimo: number;
  categoriaId?: number | null;
  categoria?: Categoria | null;
  // Perecibles: manejaLotes=true reparte el stock en LoteProducto (ver abajo),
  // cada uno con su propia caducidad. Si es false, fechaCaducidad es una
  // única fecha opcional para todo el producto.
  manejaLotes: boolean;
  fechaCaducidad?: string | null;
  // Si es true, cada unidad que entra por Compras necesita su propio
  // número de serie capturado por bodega (ver NumeroSerieProducto) — para
  // equipos como switches/routers/ONUs donde importa saber a quién se
  // entregó tal unidad puntual.
  controlaNumeroSerie?: boolean;
  // Desglose de stockActual por sucursal — solo se llena para productos que
  // NO manejan lotes (los que sí, siguen con un único stock global).
  stockPorSucursal: { id: number; sucursalId: number; cantidad: number; sucursal: { id: number; nombre: string } }[];
  // Desglose MÁS FINO de cada fila de stockPorSucursal, por bodega dentro de
  // esa sucursal — mismo criterio (solo productos sin lote).
  stockPorBodega: { id: number; bodegaId: number; cantidad: number; bodega: { id: number; nombre: string; sucursalId: number } }[];
  createdAt?: string;
}

export interface Sucursal {
  id: number;
  nombre: string;
  direccion?: string | null;
  activa: boolean;
  region?: "SIERRA_ORIENTE" | "COSTA_GALAPAGOS";
  // Geocerca para marcaciones de asistencia (ver MarcacionPage.tsx) — los
  // tres null = sin geocerca configurada todavía.
  latitud?: string | null;
  longitud?: string | null;
  radioGeocercaMetros?: number | null;
}

// Subdivisión de stock DENTRO de una sucursal (ver Bodega en schema.prisma).
// A diferencia de la sucursal (fija por usuario), la bodega se elige
// explícitamente en cada compra/venta/traslado.
export interface Bodega {
  id: number;
  nombre: string;
  sucursalId: number;
  activa: boolean;
}

// Cuenta bancaria de la empresa (catálogo global, no por sucursal) — se
// elige al registrar un Pago con formaPago TRANSFERENCIA/TARJETA/CHEQUE.
export interface CuentaBancaria {
  id: number;
  nombre: string;
  banco: string;
  numeroCuenta: string;
  tipoCuenta: string;
  activa?: boolean;
  createdAt?: string;
}

// Caja registradora física DENTRO de una sucursal (ver PuntoDeVenta en
// schema.prisma). A diferencia de Bodega, es opcional y nunca se elige a
// mano en una venta/compra — se hereda sola de la caja abierta de quien
// factura (ver GET /caja/actual). Solo se elige explícitamente al abrir caja.
export interface PuntoDeVenta {
  id: number;
  nombre: string;
  sucursalId: number;
  activo: boolean;
}

export interface TrasladoDetalle {
  id: number;
  productoId: number;
  cantidad: number;
  producto: Producto;
}

export interface Traslado {
  id: number;
  sucursalOrigenId: number;
  sucursalDestinoId: number;
  sucursalOrigen: Sucursal;
  sucursalDestino: Sucursal;
  bodegaOrigenId: number;
  bodegaDestinoId: number;
  bodegaOrigen: Bodega;
  bodegaDestino: Bodega;
  motivo?: string | null;
  usuario: { id: number; nombre: string } | null;
  detalles?: TrasladoDetalle[];
  createdAt: string;
}

export interface MovimientoCaja {
  id: number;
  tipo: "INGRESO" | "EGRESO";
  monto: string;
  motivo: string;
  usuario: { id: number; nombre: string };
  fecha: string;
}

export interface CajaSesion {
  id: number;
  sucursalId: number;
  sucursal: Sucursal;
  puntoVentaId: number | null;
  puntoVenta: PuntoDeVenta | null;
  estado: "ABIERTA" | "CERRADA";
  montoInicial: string;
  abiertaPor: { id: number; nombre: string };
  abiertaEn: string;
  cerradaPor: { id: number; nombre: string } | null;
  cerradaEn: string | null;
  montoContado: string | null;
  montoEsperado: string | null;
  diferencia: string | null;
  observacionesCierre: string | null;
  movimientos?: MovimientoCaja[];
}

export interface CajaActual {
  sesion: CajaSesion | null;
  componentes?: {
    ventasEfectivo: string;
    comprasEfectivo: string;
    ingresosManuales: string;
    egresosManuales: string;
  };
  efectivoEsperado?: string;
}

// Fila de GET /caja/abiertas (control general, admin) — una CajaSesion con
// su efectivo esperado ya calculado en vivo.
export interface CajaAbierta extends CajaSesion {
  efectivoEsperado: string;
}

// Un lote de stock de un producto perecible (manejaLotes=true): cuánto
// queda de ESE lote y cuándo caduca. Las ventas los consumen del que caduca
// más pronto al que caduca más tarde (FEFO).
export interface LoteProducto {
  id: number;
  productoId: number;
  numeroLote: string | null;
  fechaCaducidad: string;
  cantidad: number;
  createdAt: string;
}

// El backend guarda "imagenUrl" como ruta relativa (para no atarse a un
// dominio); acá la completamos con la URL del backend para poder ponerla
// directo en un <img src>.
export function urlImagenProducto(producto: Producto): string | null {
  return producto.imagenUrl ? `${URL_BASE_API}${producto.imagenUrl}` : null;
}

// Ruta relativa ("/uploads/...") -> URL absoluta contra el backend, mismo
// criterio que urlImagenProducto — se usa para las fotos del acta de
// instalación de una visita técnica (ver VisitaTecnica.fotoTrabajoUrl /
// fotoViviendaUrl).
export function urlArchivoSubido(rutaRelativa: string | null | undefined): string | null {
  return rutaRelativa ? `${URL_BASE_API}${rutaRelativa}` : null;
}

export interface TipoPrecio {
  id: number;
  nombre: string;
  porcentajeGanancia: string;
  activo?: boolean;
  createdAt?: string;
}

export interface Cliente {
  id: number;
  tipoIdentificacion: string; // RUC | CEDULA | PASAPORTE | CONSUMIDOR_FINAL
  identificacion: string;
  razonSocial: string;
  direccion?: string | null;
  ciudad?: string | null;
  email?: string | null;
  telefono?: string | null;
  tipoPrecioId: number;
  tipoPrecio?: TipoPrecio; // presente cuando el endpoint lo incluye
  // Adaptación a ISP: vínculo con el Mikrotik (ver backend/src/utils/mikrotik.ts)
  // — IP fija asignada a mano por el técnico (la red real es por
  // address-list, NO PPPoE; confirmado contra un router ISPCube real).
  direccionIp?: string | null;
  planInternetId?: number | null;
  planInternet?: PlanInternet | null; // presente cuando el endpoint lo incluye
  // A qué nodo/sector pertenece (ver NodoRed) — determina a cuál Mikrotik
  // se sincroniza la IP. Sin nodo, direccionIp se guarda pero no se
  // sincroniza con ningún router.
  nodoId?: number | null;
  nodo?: NodoRed | null; // presente cuando el endpoint lo incluye (nunca trae mikrotikPassword)
  // A cuál VLAN de ese nodo pertenece (opcional, organizativo — ver
  // VlanNodo). Independiente de nodoId: no cambia la sincronización con el
  // Mikrotik, que sigue siendo por IP.
  vlanNodoId?: number | null;
  vlanNodo?: VlanNodo | null;
  // Ubicación de la vivienda, cargada pegando el mensaje de "ubicación
  // actual" de WhatsApp (ver frontend/src/utils/parsearUbicacion.ts) —
  // null hasta que alguien la carga. Sirve para que el técnico llegue
  // directo con el mapa.
  latitud?: string | null;
  longitud?: string | null;
  // Prórroga manual de pago (ver backend/src/utils/gestionServicioInternet.ts)
  // — mientras esta fecha no pase, el job de suspensión automática no corta
  // el servicio aunque el cliente siga sin pagar el mes en curso.
  prorrogaHasta?: string | null;
  // Fecha de firma del contrato de internet — el DÍA DEL MES de esta fecha
  // es el propio día de corte del cliente (ver
  // backend/src/utils/gestionServicioInternet.ts): todos los meses, ese día
  // se valida el pago de su plan y se corta si no pagó. null = sigue con el
  // día de corte general de la empresa (Ajustes), como antes de este campo.
  fechaContrato?: string | null;
  createdAt?: string;
}

// Respuesta de POST/PUT /clientes — igual que Cliente, más una advertencia
// no bloqueante si la sincronización con el Mikrotik falló (el cliente de
// todos modos quedó guardado).
export interface ClienteConAdvertencia extends Cliente {
  advertenciaMikrotik?: string | null;
}

// Un nodo de red: punto de conexión físico (ej. un armario de un sector)
// con su propio Mikrotik a cargo de los clientes de esa zona — ver
// NodosPage.tsx. mikrotikPassword NUNCA viaja al frontend (ver
// routes/nodosRed.ts) — al editar, dejarlo vacío significa "no cambiarla".
export interface NodoRed {
  id: number;
  nombre: string;
  descripcion?: string | null;
  mikrotikHost: string;
  mikrotikPuerto: number;
  mikrotikUsuario: string;
  // Prefijo CIDR (24, 22, etc.) — solo ayuda a calcular rangoIpInicio/Fin en
  // el formulario, esos dos siguen siendo los que de verdad se usan.
  mascaraRed?: number | null;
  rangoIpInicio?: string | null;
  rangoIpFin?: string | null;
  // Última vez que el pulso de vida logró conectarse — null = nunca. Sirve
  // para calcular "sin conexión desde hace X" cuando está caído (ver
  // NodosPage.tsx); se actualiza solo en el backend en cada chequeo exitoso.
  ultimaConexionExitosa?: string | null;
  activo?: boolean;
  createdAt?: string;
}

// Una VLAN configurada en el Mikrotik de un nodo — organizativo/de
// referencia (ver comentario en el modelo VlanNodo, schema.prisma): no
// cambia cómo se suspende/reactiva a un cliente, eso sigue siendo por IP.
export interface VlanNodo {
  id: number;
  nodoId: number;
  nombre: string;
  vlanId: number;
  interfaz?: string | null;
  mascaraRed?: number | null;
  rangoIpInicio?: string | null;
  rangoIpFin?: string | null;
  activo?: boolean;
  createdAt?: string;
}

// Respuesta de GET /nodos-red/:id/vlans/detectar — lo que el Mikrotik tiene
// configurado AHORA MISMO, todavía no guardado como VlanNodo.
export interface VlanDetectada {
  nombre: string;
  vlanId: number;
  interfaz: string;
}

// Catálogo de planes de internet contratables por un Cliente del ISP — ver
// PlanInternetPage.tsx. Al asignarlo a un cliente con direccionIp y nodoId
// puestos, el backend agrega esa IP a la address-list codigoMikrotik del
// plan, en el Mikrotik de SU nodo (ver routes/clientes.ts).
export interface PlanInternet {
  id: number;
  nombre: string;
  velocidadSubida: string; // ej. "5M" — solo informativo, el límite real se aprovisiona en la OLT
  velocidadBajada: string; // ej. "10M"
  precio: string;
  // Nombre EXACTO de la address-list en el Mikrotik para este plan (ej.
  // "PLAN550") — null hasta que se configure, y mientras tanto no se puede
  // vincular el plan a ningún cliente en el router.
  codigoMikrotik?: string | null;
  activo?: boolean;
  createdAt?: string;
  // Producto espejo auto-provisionado (ver backend/src/utils/planProducto.ts)
  // que representa este plan como línea de factura — no hace falta en la UI
  // de PlanesInternetPage, pero viaja igual porque el endpoint lo incluye.
  productoId?: number | null;
}

// Fila de GET /facturas-internet/clientes — un Cliente con plan de internet
// asignado, más cuándo fue la última vez que se le facturó ESE plan (o null
// si nunca), para que FacturacionInternetPage.tsx muestre de un vistazo a
// quién le falta facturar este período sin abrir el historial de cada uno.
export interface ClienteFacturableInternet extends Cliente {
  ultimaFacturaInternet: {
    id: number;
    secuencial: string;
    fechaEmision: string;
    estado: string;
    // PENDIENTE | PARCIAL | PAGADA — determina si el servicio sigue activo o
    // corre riesgo de suspensión automática (ver
    // backend/src/utils/gestionServicioInternet.ts).
    estadoPago: string;
    total: string;
    montoPagado: string;
  } | null;
  // Cobro(s) ya registrados pero TODAVÍA SIN FACTURAR (ver
  // POST /facturas-internet/:clienteId/pago y POST /facturas-internet/facturar-pagados)
  // — el caso normal entre el 01 y el 05 del mes, con miles de clientes: se
  // registra el cobro apenas llega, se factura recién en lote después.
  cobroPendiente: {
    cantidad: number;
    total: string;
    ultimaFecha: string;
  } | null;
}

// Un abono contra una Factura (cuenta por cobrar) o una Compra (cuenta por
// pagar) — la misma forma sirve para las dos, por eso ModalRegistrarPago es
// un solo componente reutilizado en ambos lados.
export interface Pago {
  id: number;
  monto: string;
  formaPago: string;
  referencia?: string | null;
  fecha: string;
  cuentaBancariaId?: number | null;
  cuentaBancaria?: { id: number; nombre: string; banco: string; numeroCuenta: string } | null;
  // Captura del comprobante (transferencia/depósito) — ruta relativa, solo
  // presente si se subió una imagen al registrar el pago (hoy, únicamente
  // desde la ventana de pago de Facturación de Internet). Ver urlComprobantePago().
  comprobanteUrl?: string | null;
}

// Mismo criterio que urlImagenProducto(): comprobanteUrl es una ruta
// relativa, hay que completarla con la URL del backend para usarla en un
// <img src> o un enlace "Ver comprobante".
export function urlComprobantePago(pago: Pago): string | null {
  return pago.comprobanteUrl ? `${URL_BASE_API}${pago.comprobanteUrl}` : null;
}

// Fila de GET /pagos/bancarios (Reporteador Principal) — un Pago con
// TRANSFERENCIA/TARJETA/CHEQUE, de cualquier origen (cobro a cliente o pago
// a proveedor). Cuál de factura/notaVenta/compra viene no-nula determina el
// tipo y el documento de origen a mostrar.
export interface PagoBancario extends Pago {
  // En teoría siempre viene (el backend filtra cuentaBancariaId != null en
  // GET /pagos/bancarios), pero se tipa nullable a propósito: un pago viejo
  // sin cuenta asociada, o cuya cuenta se borró a mano en la base, no debe
  // poder tumbar la pantalla — ver cuentaBancariaTexto() en
  // ReporteadorPrincipalPage.tsx.
  cuentaBancaria: { id: number; nombre: string; banco: string; numeroCuenta: string } | null;
  factura?: { secuencial: string; cliente: { razonSocial: string } } | null;
  notaVenta?: { secuencial: string; cliente: { razonSocial: string } } | null;
  compra?: { numeroFactura: string; proveedor: { razonSocial: string } } | null;
}

export interface Factura {
  id: number;
  secuencial: string;
  claveAcceso: string | null;
  total: string;
  estado: string;
  estadoPago: string;
  montoPagado: string;
  fechaEmision: string;
  fechaVencimiento?: string | null;
  cliente: Cliente;
  retencionRecibida: { id: number; numeroComprobante: string; total: string } | null;
}

// Lo que devuelve GET /dashboard/resumen para pintar la pantalla de inicio.
export interface DashboardResumen {
  ambiente: string;
  resumen: {
    documentosEmitidosMes: number;
    notasVentaMes: number;
    neto: string;
    iva: string;
    total: string;
  };
  facturasRecientes: {
    id: number;
    secuencial: string;
    fechaEmision: string;
    cliente: string;
    estado: string;
    total: string;
  }[];
  productosStockBajo: {
    productoId: number;
    productoNombre: string;
    stockActual: number;
    stockMinimo: number;
    // null = producto con lote (stock global); si no, la sucursal específica
    // donde ese stock cayó al mínimo o por debajo.
    sucursalId: number | null;
    sucursalNombre: string | null;
  }[];
  productosPorCaducar: {
    productoId: number;
    productoNombre: string;
    numeroLote: string | null;
    fechaCaducidad: string;
    cantidad: number;
    vencido: boolean;
  }[];
  certificadoPorCaducar: {
    fechaExpiracion: string;
    diasRestantes: number;
    vencido: boolean;
    porCaducar: boolean;
  } | null;
  certificadoInvalido: { motivo: string } | null;
  backupAtrasado: boolean;
  ventasPorSucursal: {
    sucursalId: number;
    sucursalNombre: string;
    documentos: number;
    total: string;
  }[];
  ventasUltimosDias: { fecha: string; total: string }[];
  topProductosMes: { productoId: number; nombre: string; cantidad: number }[];
}

export interface FacturaDetalle {
  id: number;
  productoId: number;
  cantidad: number;
  precioUnitario: string;
  subtotal: string;
  producto: Producto;
}

export interface FacturaConDetalle extends Factura {
  detalles: FacturaDetalle[];
  pagos: Pago[];
}

export interface NotaCredito {
  id: number;
  secuencial: string;
  claveAcceso: string | null;
  fechaEmision: string;
  motivo: string;
  total: string;
  estado: string;
  factura: Factura;
}

export interface NotaCreditoDetalle {
  id: number;
  productoId: number;
  cantidad: number;
  precioUnitario: string;
  subtotal: string;
  producto: Producto;
}

export interface NotaCreditoConDetalle extends NotaCredito {
  detalles: NotaCreditoDetalle[];
}

// Espejo del "SELECT_USUARIO" de backend/src/routes/usuarios.ts — nunca
// incluye passwordHash. Se llama "UsuarioAdmin" (no "Usuario" a secas) para
// no confundirse con UsuarioAutenticado (la sesión propia del que usa la app).
export interface UsuarioAdmin {
  id: number;
  nombre: string;
  usuario: string;
  email: string | null;
  rol: string;
  permisos: string[];
  activo: boolean;
  createdAt: string;
  sucursalId: number | null;
  sucursal: { id: number; nombre: string } | null;
  empleadoId: number | null;
  empleado: { id: number; nombres: string; apellidos: string } | null;
  debeCambiarPassword: boolean;
}

export interface UsuarioAutenticado {
  id: number;
  nombre: string;
  usuario: string;
  rol: string;
  permisos: string[];
  sucursalId: number | null;
  sucursalNombre: string | null;
  // Vínculo opcional con Empleado (ver módulo de Visitas Técnicas) — si no
  // es null, este Usuario puede ver "Mi ruta de hoy" en /visitas.
  empleadoId: number | null;
  debeCambiarPassword: boolean;
}

// Multiempresa: cada empresa es un negocio independiente con su propia base
// de datos (ver backend/src/utils/empresas.ts). El login pide elegir una
// ANTES de mandar usuario/contraseña — el mismo "usuario" puede no existir,
// o significar otra persona, en la base de otra empresa.
export interface EmpresaResumen {
  id: string;
  nombre: string;
}

// La nota de venta es un recibo interno (nunca pasa por el SRI), por eso no
// tiene "claveAcceso" como Factura/NotaCredito.
export interface NotaVenta {
  id: number;
  secuencial: string;
  total: string;
  estado: string;
  estadoPago: string;
  montoPagado: string;
  aplicaIva: boolean;
  fechaEmision: string;
  fechaVencimiento?: string | null;
  cliente: Cliente;
}

export interface NotaVentaDetalle {
  id: number;
  productoId: number;
  cantidad: number;
  precioUnitario: string;
  subtotal: string;
  producto: Producto;
}

export interface NotaVentaConDetalle extends NotaVenta {
  detalles: NotaVentaDetalle[];
  pagos: Pago[];
}

// La proforma es una cotización con el mismo formato visual que una factura,
// pero NO es un comprobante electrónico (no va al SRI) y NO descuenta stock.
// Cuando el cliente acepta, se "convierte" en Factura o Nota de Venta real.
export interface Proforma {
  id: number;
  secuencial: string;
  fechaEmision: string;
  validaHasta: string | null;
  total: string;
  estado: string; // CREADA | ANULADA | CONVERTIDA
  cliente: Cliente;
  facturaConvertida?: { secuencial: string } | null;
  notaVentaConvertida?: { secuencial: string } | null;
}

export interface ProformaDetalle {
  id: number;
  productoId: number;
  cantidad: number;
  precioUnitario: string;
  subtotal: string;
  producto: Producto;
}

export interface ProformaConDetalle extends Proforma {
  detalles: ProformaDetalle[];
}

export interface Proveedor {
  id: number;
  identificacion: string;
  razonSocial: string;
  direccion?: string | null;
  telefono?: string | null;
  email?: string | null;
  createdAt?: string;
}

// Versión liviana embebida en Compra (list/detail) — evita una query aparte
// solo para saber si ya existe una retención y en qué estado está.
export interface RetencionResumen {
  id: number;
  secuencial: string;
  claveAcceso: string | null;
  estado: string;
  total: string;
}

// La compra es el "reverso" de la factura: no pasa por el SRI, no tiene
// secuencial propio ni claveAcceso — "numeroFactura" es el documento que el
// PROVEEDOR ya trae impreso, no algo que nosotros generamos.
export interface Compra {
  id: number;
  numeroFactura: string;
  fechaEmision: string;
  fechaVencimiento?: string | null;
  total: string;
  estado: string;
  estadoPago: string;
  montoPagado: string;
  proveedor: Proveedor;
  retencion: RetencionResumen | null;
}

export interface CompraDetalle {
  id: number;
  productoId: number;
  cantidad: number;
  costoUnitario: string;
  subtotal: string;
  producto: Producto;
  // Presente solo cuando GET /compras/:id lo incluye — permite calcular
  // cuánto de esta línea ya se devolvió (ver DevolucionesCompraPage.tsx).
  devolucionesDetalle?: { cantidad: number }[];
}

export interface CompraConDetalle extends Compra {
  detalles: CompraDetalle[];
  pagos: Pago[];
}

// Línea de compra de un producto que controla número de serie
// (Producto.controlaNumeroSerie) a la que bodega todavía no le capturó
// todas las series — ver GET /compras/pendientes-serie.
export interface PendienteSerie {
  compraDetalleId: number;
  compraId: number;
  numeroFactura: string;
  proveedor: string;
  fechaEmision: string;
  producto: { id: number; nombre: string; codigo: string };
  cantidad: number;
  capturadas: number;
  faltantes: number;
}

// Un número de serie individual de una unidad de un producto serializado —
// nace EN_BODEGA al capturarlo contra una compra, pasa a ENTREGADO al
// vincularlo a un cliente (ver POST /productos/series/:id/entregar).
export interface NumeroSerieProducto {
  id: number;
  numeroSerie: string;
  estado: "EN_BODEGA" | "ENTREGADO";
  fechaEntrega: string | null;
  referenciaDocumento: string | null;
  createdAt: string;
  producto: { id: number; nombre: string; codigo: string };
  cliente: { id: number; razonSocial: string; identificacion: string } | null;
  compraDetalle: {
    compra: { id: number; numeroFactura: string; fechaEmision: string; proveedor: { razonSocial: string } };
  } | null;
}

// El espejo de NotaCredito, pero del lado de compras — registro interno
// (sin claveAcceso, nunca pasa por el SRI), ver backend/prisma/schema.prisma.
export interface DevolucionCompra {
  id: number;
  secuencial: string;
  fechaEmision: string;
  motivo: string;
  total: string;
  compra: Compra;
}

export interface DevolucionCompraDetalle {
  id: number;
  productoId: number;
  cantidad: number;
  costoUnitario: string;
  subtotal: string;
  producto: Producto;
}

export interface DevolucionCompraConDetalle extends DevolucionCompra {
  detalles: DevolucionCompraDetalle[];
}

export interface RetencionDetalle {
  id: number;
  tipoImpuesto: "IVA" | "RENTA";
  clasificacion: "BIEN" | "SERVICIO";
  codigoRetencion: string;
  baseImponible: string;
  porcentaje: string;
  valorRetenido: string;
}

export interface Retencion {
  id: number;
  secuencial: string;
  claveAcceso: string | null;
  fechaEmision: string;
  periodoFiscal: string;
  totalIva: string;
  totalRenta: string;
  total: string;
  estado: string;
  compra: Compra;
}

export interface RetencionConDetalle extends Retencion {
  detalles: RetencionDetalle[];
}

// Retención RECIBIDA: el reverso de Retencion — un cliente ya generó y envió
// su propio comprobante al SRI al pagarnos, esto solo registra internamente
// lo que recibimos (sin clave de acceso, sin XML, sin envío).
export interface RetencionRecibidaDetalle {
  id: number;
  tipoImpuesto: "IVA" | "RENTA";
  clasificacion: "BIEN" | "SERVICIO";
  codigoRetencion: string;
  baseImponible: string;
  porcentaje: string;
  valorRetenido: string;
}

export interface RetencionRecibida {
  id: number;
  numeroComprobante: string;
  fechaEmision: string;
  totalIva: string;
  totalRenta: string;
  total: string;
  factura: Factura;
}

export interface RetencionRecibidaConDetalle extends RetencionRecibida {
  detalles: RetencionRecibidaDetalle[];
}

// Guía de Remisión: acompaña el transporte de mercadería ya vendida (control
// policial/SRI en carretera). No tiene montos — no mueve dinero ni stock, el
// stock ya se descontó al crear la Factura de origen.
export interface GuiaRemisionDetalle {
  id: number;
  productoId: number;
  cantidad: number;
  descripcion: string;
  producto: Producto;
}

export interface GuiaRemision {
  id: number;
  secuencial: string;
  claveAcceso: string | null;
  fechaEmision: string;
  estado: string;
  destinatarioTipoIdentificacion: string;
  destinatarioIdentificacion: string;
  destinatarioRazonSocial: string;
  destinatarioDireccion: string;
  motivoTraslado: string;
  ruta: string | null;
  dirPartida: string;
  transportistaTipoIdentificacion: string;
  transportistaIdentificacion: string;
  transportistaRazonSocial: string;
  placa: string;
  fechaIniTransporte: string;
  fechaFinTransporte: string;
  factura: Factura;
}

export interface GuiaRemisionConDetalle extends GuiaRemision {
  detalles: GuiaRemisionDetalle[];
}

// --- Nómina (Ecuador) ---

export interface Empleado {
  id: number;
  cedula: string;
  nombres: string;
  apellidos: string;
  cargo: string;
  fechaIngreso: string;
  fechaSalida: string | null;
  sueldoMensual: string;
  sucursalId: number | null;
  sucursal?: Sucursal | null;
  cargasFamiliares: number;
  fondoReservaMensualizado: boolean;
  // Horario esperado ("HH:MM"), opcional — usado para detectar tardanza en
  // las marcaciones de asistencia (ver MarcacionPage.tsx / NominaPage.tsx).
  horaEntradaEsperada?: string | null;
  horaSalidaEsperada?: string | null;
  // Derivado por el backend (nunca se expone el hash real) — indica si ya
  // se le configuró un PIN para marcar entrada/salida.
  tienePin?: boolean;
  // Cuenta de Usuario vinculada (ver módulo de Visitas Técnicas), si tiene
  // una — null si nadie le ha creado/vinculado una cuenta de acceso todavía.
  usuario?: { id: number; usuario: string } | null;
  activo: boolean;
}

export interface Marcacion {
  id: number;
  empleadoId: number;
  empleado: Empleado;
  tipo: "ENTRADA" | "SALIDA";
  fecha: string;
  latitud: string | null;
  longitud: string | null;
  distanciaMetros: string | null;
  dentroDeGeocerca: boolean | null;
  tardanza: boolean | null;
  creadaManualmente: boolean;
  observacion: string | null;
}

export interface HorasTrabajadas {
  horasTrabajadas: number;
  // null si el empleado no tiene horaEntradaEsperada/horaSalidaEsperada
  // configurados — no hay con qué comparar.
  horasEsperadasDelMes: number | null;
  sesiones: { entrada: string; salida: string; horas: number }[];
  anomalias: { tipo: "ENTRADA_SIN_SALIDA" | "SALIDA_SIN_ENTRADA"; fecha: string }[];
}

// Un ítem dejado en la vivienda durante la visita (ver PATCH
// /visitas/:id/detalle-trabajo) — a propósito no está vinculado a
// Producto/stock, es solo el acta de lo que el técnico dice que dejó.
export interface EquipoDejadoVisita {
  id: number;
  visitaId: number;
  tipo: string;
  modelo: string | null;
  // Para equipos de red, en la práctica es la dirección MAC.
  serial: string | null;
}

export interface VisitaTecnica {
  id: number;
  rutaVisitaId: number;
  clienteId: number | null;
  cliente: Cliente | null;
  nombreContacto: string;
  direccion: string | null;
  latitud: string;
  longitud: string;
  orden: number;
  // Parada agregada de última hora a una ruta ya existente (ver POST
  // /visitas/rutas/:id/paradas) — solo cambia cómo se resalta en pantalla.
  esUrgente: boolean;
  estado: "PENDIENTE" | "COMPLETADA" | "OMITIDA";
  fechaLlegadaReal: string | null;
  latitudLlegada: string | null;
  longitudLlegada: string | null;
  distanciaAlPunto: string | null;
  observaciones: string | null;
  // Acta de instalación, llenada aparte de "Llegué" — ver
  // PATCH /visitas/:id/detalle-trabajo. Todo opcional: no es obligatoria
  // para dar la visita por completada.
  descripcionTrabajo?: string | null;
  fotoTrabajoUrl?: string | null;
  fotoViviendaUrl?: string | null;
  equiposDejados?: EquipoDejadoVisita[];
}

export interface RutaVisita {
  id: number;
  empleadoId: number;
  empleado: Empleado;
  fecha: string;
  visitas: VisitaTecnica[];
}

// Respuesta de GET /visitas/equipos?q= — un equipo dejado en alguna visita,
// con el cliente/técnico/fecha en la que se dejó (ver "¿dónde está instalado
// este equipo?" en VisitasPage.tsx).
export interface EquipoInstaladoBusqueda {
  id: number;
  tipo: string;
  modelo: string | null;
  serial: string | null;
  visita: {
    id: number;
    estado: "PENDIENTE" | "COMPLETADA" | "OMITIDA";
    direccion: string | null;
    nombreContacto: string;
    cliente: Cliente | null;
    rutaVisita: { fecha: string; empleado: Empleado };
  };
}

// Respuesta de GET /clientes/:id/historial-visitas — mismos campos de acta
// que VisitaTecnica, pero sin el objeto `cliente` (ya se sabe cuál es) y con
// la fecha/técnico de la ruta a la que perteneció cada visita.
export interface VisitaHistorialCliente {
  id: number;
  rutaVisitaId: number;
  nombreContacto: string;
  direccion: string | null;
  orden: number;
  esUrgente: boolean;
  estado: "PENDIENTE" | "COMPLETADA" | "OMITIDA";
  fechaLlegadaReal: string | null;
  observaciones: string | null;
  descripcionTrabajo: string | null;
  fotoTrabajoUrl: string | null;
  fotoViviendaUrl: string | null;
  equiposDejados: EquipoDejadoVisita[];
  rutaVisita: { id: number; fecha: string; empleado: Empleado };
}

// Respuesta de GET /visitas/historial?empleadoId=&desde=&hasta= — todas las
// visitas de un técnico en un rango de fechas, con el cliente de cada una
// (a diferencia de VisitaHistorialCliente, que ya sabe cuál es el cliente
// porque está filtrado por él).
export interface VisitaHistorialTecnico {
  id: number;
  clienteId: number | null;
  cliente: Cliente | null;
  nombreContacto: string;
  direccion: string | null;
  orden: number;
  esUrgente: boolean;
  estado: "PENDIENTE" | "COMPLETADA" | "OMITIDA";
  descripcionTrabajo: string | null;
  fotoTrabajoUrl: string | null;
  fotoViviendaUrl: string | null;
  equiposDejados: EquipoDejadoVisita[];
  rutaVisita: { id: number; fecha: string; empleado: Empleado };
}

export interface RolDePagos {
  id: number;
  empleadoId: number;
  empleado: Empleado;
  anio: number;
  mes: number;
  sueldoBase: string;
  horasSuplementarias: number;
  horasExtraordinarias: number;
  valorHorasSuplementarias: string;
  valorHorasExtraordinarias: string;
  otrosIngresos: string;
  fondoReservaValor: string;
  totalIngresos: string;
  aportePersonalIess: string;
  aportePatronalIess: string;
  otrosDescuentos: string;
  otrosDescuentosDetalle: string | null;
  totalDescuentos: string;
  netoAPagar: string;
  estado: string; // PENDIENTE | PAGADO
  fechaPago: string | null;
}

export interface DecimoTercero {
  id: number;
  empleadoId: number;
  empleado: Empleado;
  anio: number;
  totalIngresosPeriodo: string;
  valor: string;
  mensualizado: boolean;
  estado: string;
  fechaPago: string | null;
}

export interface DecimoCuarto {
  id: number;
  empleadoId: number;
  empleado: Empleado;
  anio: number;
  region: string;
  mesesLaborados: number;
  valor: string;
  mensualizado: boolean;
  estado: string;
  fechaPago: string | null;
}

export interface Vacacion {
  id: number;
  empleadoId: number;
  empleado: Empleado;
  fechaInicio: string;
  fechaFin: string;
  diasTomados: number;
  valorPagado: string | null;
}

export interface SaldoVacaciones {
  diasAcumulados: number;
  diasTomados: number;
  diasDisponibles: number;
}

export interface UtilidadDetalle {
  id: number;
  empleadoId: number;
  empleado: Empleado;
  diasTrabajados: number;
  valorPorDias: string;
  valorPorCargas: string;
  totalEmpleado: string;
}

export interface Utilidad {
  id: number;
  anio: number;
  utilidadNetaEmpresa: string;
  monto15Porciento: string;
  fechaCalculo: string;
  detalles: UtilidadDetalle[];
}

export interface Liquidacion {
  id: number;
  empleadoId: number;
  empleado: Empleado;
  fechaSalida: string;
  motivoSalida: string;
  aniosServicio: string;
  vacacionesPendientesDias: number;
  vacacionesPendientesValor: string;
  decimoTerceroProporcional: string;
  decimoCuartoProporcional: string;
  indemnizacion: string;
  bonificacionDesahucio: string;
  totalLiquidacion: string;
}

// --- Contabilidad: plan de cuentas + libro diario (partida doble) ---

export type TipoCuentaContable = "ACTIVO" | "PASIVO" | "PATRIMONIO" | "INGRESO" | "COSTO" | "GASTO";
export type NaturalezaCuenta = "DEUDORA" | "ACREEDORA";

export interface CuentaContable {
  id: number;
  codigo: string;
  nombre: string;
  tipo: TipoCuentaContable;
  naturaleza: NaturalezaCuenta;
  cuentaPadreId: number | null;
  permiteMovimiento: boolean;
  activa: boolean;
  createdAt: string;
}

export type OrigenAsiento = "FACTURA" | "NOTA_VENTA" | "NOTA_CREDITO" | "COMPRA" | "DEVOLUCION_COMPRA" | "PAGO" | "MOVIMIENTO_CAJA" | "MANUAL";

export interface LineaAsiento {
  id: number;
  asientoId: number;
  cuentaId: number;
  cuenta: CuentaContable;
  debe: string;
  haber: string;
  glosa: string | null;
}

export interface AsientoContable {
  id: number;
  numero: string;
  fecha: string;
  descripcion: string;
  origen: OrigenAsiento;
  origenId: number | null;
  asientoRevertidoId: number | null;
  usuario: { id: number; nombre: string } | null;
  lineas: LineaAsiento[];
  createdAt: string;
}

// GET /contabilidad/libro-mayor/:cuentaId
export interface LibroMayor {
  cuenta: CuentaContable;
  saldoInicial: string;
  movimientos: (LineaAsiento & {
    asiento: { id: number; numero: string; fecha: string; descripcion: string; origen: OrigenAsiento };
    saldoAcumulado: string;
  })[];
}

// GET /contabilidad/balance-comprobacion
export interface FilaBalanceComprobacion {
  cuenta: CuentaContable;
  totalDebe: string;
  totalHaber: string;
  saldo: string;
}

// GET /contabilidad/estado-resultados
export interface FilaCuentaSaldo {
  cuenta: CuentaContable;
  saldo: string;
}
export interface EstadoResultados {
  ingresos: FilaCuentaSaldo[];
  costos: FilaCuentaSaldo[];
  gastos: FilaCuentaSaldo[];
  resumen: { totalIngresos: string; totalCostos: string; totalGastos: string; utilidadNeta: string };
}

// GET /contabilidad/balance-general
export interface BalanceGeneral {
  activos: FilaCuentaSaldo[];
  pasivos: FilaCuentaSaldo[];
  patrimonio: FilaCuentaSaldo[];
  utilidadEjercicio: string;
  totales: { activo: string; pasivoMasPatrimonio: string; cuadrado: boolean };
}

// Historial combinado de un producto: compras (quién nos vendió), ventas por
// factura/nota de venta (a quién le vendimos) y devoluciones por nota de
// crédito. "cantidad" ya viene con signo: negativo = salió del stock.
export interface HistorialProductoItem {
  fecha: string;
  tipo: "COMPRA" | "VENTA_FACTURA" | "VENTA_NOTA_VENTA" | "DEVOLUCION";
  documento: string;
  contraparte: string;
  cantidad: number;
  precioUnitario: string;
  subtotal: string;
  estado: string;
}

// Qué se le ha vendido a un cliente puntual (facturas + notas de venta).
export interface HistorialClienteItem {
  fecha: string;
  tipo: "FACTURA" | "NOTA_VENTA";
  documento: string;
  producto: string;
  cantidad: number;
  precioUnitario: string;
  subtotal: string;
  estado: string;
}

// Qué se le ha comprado a un proveedor puntual.
export interface HistorialProveedorItem {
  fecha: string;
  documento: string;
  producto: string;
  cantidad: number;
  costoUnitario: string;
  subtotal: string;
  estado: string;
}

export type BucketMora = "AL_DIA" | "1_30" | "31_60" | "61_90" | "MAS_90";
export type MoraPorBucket = Record<BucketMora, string>;

// Combina Facturas y Notas de Venta pendientes de cobro — ambas se pueden
// vender "al fiado", así que "cuánto me deben" tiene que sumar las dos.
export interface CuentasPorCobrar {
  resumen: { cantidadDocumentos: number; totalPorCobrar: string; moraPorBucket: MoraPorBucket };
  documentos: {
    id: number;
    tipo: "FACTURA" | "NOTA_VENTA";
    documento: string;
    fechaEmision: string;
    fechaVencimiento: string | null;
    diasAtraso: number | null;
    cliente: string;
    estado: string;
    estadoPago: string;
    total: string;
    montoPagado: string;
    saldo: string;
  }[];
}

// Una entrada de la bitácora de auditoría: quién hizo qué acción sensible
// (anular, editar, desactivar, eliminar pago) y cuándo. Solo un ADMIN puede
// consultarla (ver GET /auditoria).
export interface RegistroAuditoria {
  id: number;
  accion: string;
  entidad: string;
  entidadId: number | null;
  detalle: string | null;
  fecha: string;
  usuario: { nombre: string; usuario: string } | null;
}

// --- Control de red del ISP (Mikrotik) ---
// La empresa tiene VARIOS nodos, cada uno con su propio router (ver
// NodoRed más abajo y backend/src/utils/mikrotik.ts) — no hay un router
// global único. La red real es IP fija por address-list, no PPPoE, y la
// velocidad se aprovisiona en la OLT, no en el Mikrotik.

export interface EstadoMikrotik {
  identidad: string;
  version: string;
  // Uptime real del equipo, tal cual lo reporta RouterOS (ej. "1w6d23h59m59s").
  uptime: string;
}

// Respuesta de GET /nodos-red/:id/estado-suspension — estado EN VIVO (no
// guardado en la base) de si las reglas de Filter Rules que hacen que
// "Suspendido" corte el tráfico ya están puestas en el router de este nodo.
export interface EstadoReglasSuspension {
  tcp: boolean;
  udp: boolean;
}

// Resumen de un respaldo de configuración de un nodo (GET /nodos-red/:id/respaldos)
// — sin el JSON completo, eso se pide aparte con GET /:id/respaldos/:respaldoId.
export interface ResumenRespaldoMikrotik {
  id: number;
  createdAt: string;
  totalInterfaceLists: number;
  totalInterfaceListMembers: number;
  totalReglasFiltro: number;
  totalReglasNat: number;
  totalEntradasAddressList: number;
  usuario?: { id: number; nombre: string } | null;
}

// Contenido completo de un respaldo — lo que realmente se reaplica al
// restaurar (ver backend/src/utils/mikrotik.ts).
export interface RespaldoMikrotikCompleto extends ResumenRespaldoMikrotik {
  contenido: {
    capturadoEn: string;
    interfaceLists: Record<string, string>[];
    interfaceListMembers: Record<string, string>[];
    firewallFilterRules: Record<string, string>[];
    firewallNatRules: Record<string, string>[];
    addressListEntries: Record<string, string>[];
  };
}

// Respuesta de POST /nodos-red/:id/respaldos/:respaldoId/restaurar — mismo
// criterio "best-effort, detalle por ítem" que ya usa facturar-pagados.
export interface ResultadoRestauracionMikrotik {
  total: number;
  exitosos: number;
  fallidos: number;
  detalle: { tabla: string; item: string; ok: boolean; error?: string }[];
}

// Una entrada de /ip/firewall/address-list — ver MikrotikPage.tsx (visor
// genérico, para diagnóstico manual) y Cliente.direccionIp (el alta/baja
// normal de un cliente pasa por ahí, no por acá).
export interface EntradaAddressList {
  id: string;
  lista: string;
  direccionIp: string;
  comentario?: string;
}

// Equipo descubierto por el router de un nodo vía MNDP (protocolo de
// descubrimiento de Mikrotik) — equivalente a "Neighbors" en WinBox.
export interface VecinoRed {
  identidad: string;
  direccionIp: string;
  direccionMac: string;
  version: string;
  placa: string;
  interfaz: string;
}

export interface CuentasPorPagar {
  resumen: { cantidadCompras: number; totalPorPagar: string; moraPorBucket: MoraPorBucket };
  compras: {
    id: number;
    numeroFactura: string;
    fechaEmision: string;
    fechaVencimiento: string | null;
    diasAtraso: number | null;
    proveedor: string;
    estado: string;
    estadoPago: string;
    total: string;
    montoPagado: string;
    saldo: string;
  }[];
}
