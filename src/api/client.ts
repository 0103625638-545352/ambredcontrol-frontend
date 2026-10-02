// Cliente centralizado para hablar con nuestro backend.
// Todas las pantallas importan "api" de aquí, en vez de escribir la URL
// completa cada vez — si algún día cambia el puerto o el dominio, se
// actualiza en un solo lugar.

import axios from "axios";
import { guardarTokenParaServiceWorker } from "../utils/serviceWorkerTecnico";

// Si VITE_API_URL está seteado (frontend/.env.local), se respeta tal cual.
// Si no, se arma solo a partir del host con el que se entró a la app: el
// celular que entra por la IP LAN de esta PC (ej. https://192.168.1.182:5173)
// necesita hablarle al backend en esa MISMA IP, puerto 3000 — así no hay que
// tocar ningún archivo cuando la IP cambie (WiFi <-> cable, DHCP, otra red),
// solo que el backend tenga HTTPS_LOCAL_AUTO="true" (ver backend/.env.example).
export const URL_BASE_API =
  import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:3000`;

export const api = axios.create({
  baseURL: URL_BASE_API,
});

// Excepción a "una sola instancia de axios": el portal del cliente (ver
// pages/PortalClientePage.tsx) es público y tiene su propia sesión — no debe
// mandar el token del personal ni, ante un 401, borrar la sesión del personal
// y recargar como hace el interceptor de "api". Su token vive en
// sessionStorage (se borra al cerrar la pestaña, útil en un celular ajeno).
export const apiPortal = axios.create({ baseURL: `${URL_BASE_API}/portal` });
apiPortal.interceptors.request.use((config) => {
  try {
    const token = sessionStorage.getItem("tokenPortal");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  } catch {
    // sin acceso a sessionStorage (navegador muy restringido): sigue sin sesión
  }
  return config;
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
      guardarTokenParaServiceWorker(null);
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
  // Cuántos productos la tienen asignada (GET /categorias lo incluye).
  _count?: { productos: number };
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

// Catálogo de bancos EXTERNOS (Pichincha, Guayaquil, Produbanco, etc.) — de
// dónde vino/salió el dinero de un Pago (bancoOrigenId), NO las cuentas
// PROPIAS de la empresa (eso es CuentaBancaria arriba). Se elige de una
// lista al registrar un cobro/pago en vez de escribir el nombre a mano.
export interface Banco {
  id: number;
  nombre: string;
  activo?: boolean;
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
  // Vigencia mínima pactada + control de baja (ver backend/src/routes/clientes.ts
  // y utils/vigenciaContrato.ts). fechaInicioServicio es distinta de
  // fechaContrato (esa es el día de corte de pago); vigenciaContratoMeses
  // solo acepta 6, 12, 24 o 36.
  fechaInicioServicio?: string | null;
  vigenciaContratoMeses?: number | null;
  // Baja definitiva (distinta de "Suspendido" en el Mikrotik, que es
  // reversible). activo=false = cliente retirado.
  activo?: boolean;
  fechaBaja?: string | null;
  motivoBaja?: string | null;
  // Calculado por el backend a partir de fechaInicioServicio/vigenciaContratoMeses
  // (comparado contra fechaBaja si ya se dio de baja, o contra "ahora" si
  // sigue activo) — null si el cliente no tiene vigencia pactada.
  vigencia?: {
    fechaFinVigencia: string;
    cumplioVigencia: boolean;
    diasFaltantes: number;
  } | null;
  createdAt?: string;
}

// Plazos válidos para Cliente.vigenciaContratoMeses (ver backend/src/utils/vigenciaContrato.ts).
export const OPCIONES_VIGENCIA_MESES = [6, 12, 24, 36] as const;

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
  // Ubicación física del armario/caseta — se carga desde el mapa de Red
  // Física (ver RedFisicaPage.tsx) con PATCH /nodos-red/:id/ubicacion, no
  // desde el formulario normal de edición. null = todavía no ubicado.
  latitud?: string | null;
  longitud?: string | null;
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

// Una OLT Huawei (MA5608T / MA5800-X7) — ver OltsPage.tsx. Los secretos SNMP
// (comunidad, auth/priv password) NUNCA vuelven del backend, mismo criterio
// que NodoRed.mikrotikPassword: al editar, dejarlos vacíos significa "no
// cambiarlos".
export interface Olt {
  id: number;
  nombre: string;
  modelo: string; // "MA5608T" | "MA5800-X7"
  direccionIp: string;
  snmpPuerto: number;
  snmpVersion: string; // "1" | "2c" | "3"
  snmpUsuario?: string | null;
  snmpAuthProtocolo?: string | null; // "MD5" | "SHA"
  snmpPrivProtocolo?: string | null; // "DES" | "AES"
  // SSH (VRP CLI) — usado solo por la Vista por puerto GPON (ver
  // VistaPuertoOlt.tsx); sshPassword nunca vuelve del backend.
  sshPuerto?: number;
  sshUsuario?: string | null;
  ubicacion?: string | null;
  nodoId?: number | null;
  nodo?: { id: number; nombre: string } | null;
  // Última vez que "Sincronizar ahora" (o el polling automático) logró
  // conectarse — null = nunca. Mismo criterio que NodoRed.ultimaConexionExitosa.
  ultimaConexionExitosa?: string | null;
  activo?: boolean;
  createdAt?: string;
}

// Una ONU (equipo de cliente) detectada por SNMP en un puerto PON de una
// OLT. estado/rxPowerDbm/txPowerDbm/ultimaLectura son un CACHÉ del último
// dato leído — se pisan en cada sincronización (ver OltEvento para el
// historial de cambios). El sistema NUNCA aprovisiona la ONU en la OLT: solo
// registra qué Cliente le corresponde (ver PATCH .../asignar-cliente).
export interface OltOnu {
  id: number;
  oltId: number;
  frame?: number;
  slot: number;
  puerto: number;
  onuIndex: number;
  serial: string;
  descripcion?: string | null;
  clienteId?: number | null;
  cliente?: { id: number; razonSocial: string; identificacion: string } | null;
  estado?: string | null; // "ONLINE" | "OFFLINE" | null = todavía no sincronizada
  rxPowerDbm?: string | null;
  txPowerDbm?: string | null;
  // Solo los trae la Vista por puerto GPON (SSH) — null si esta ONU nunca se
  // consultó por ese camino (ver VistaPuertoOlt.tsx).
  temperaturaCelsius?: string | null;
  distanciaMetros?: number | null;
  ipGestion?: string | null;
  ultimaLectura?: string | null;
  activo?: boolean;
  createdAt?: string;
}

// Un punto del trazado de un TendidoFibra, en el orden dibujado — ver
// RedFisicaPage.tsx / MapaRedFisica.tsx.
export interface PuntoRuta {
  lat: number;
  lng: number;
}

// Una caja/NAP puntual del trazado de fibra (ver comentario "Módulo de RED
// FÍSICA" en schema.prisma) — reemplaza el uso de Google Earth para marcar
// estos puntos.
export interface CajaFibra {
  id: number;
  codigo: string;
  tipo: string; // "NAP" | "Empalme" | "Murete" | "Poste" | "Cámara" — texto libre
  latitud: string;
  longitud: string;
  capacidadPuertos?: number | null;
  descripcion?: string | null;
  nodoId?: number | null;
  nodo?: { id: number; nombre: string } | null;
  activo?: boolean;
  createdAt?: string;
}

// Un tramo de cable trazado sobre el mapa — el equivalente a una línea
// dibujada en Google Earth. La distancia se calcula en el navegador a partir
// de "trazado" (ver utils/geoFibra.ts), nunca viaja del backend.
export interface TendidoFibra {
  id: number;
  nombre?: string | null;
  tipo: string; // "Troncal" | "Distribución" | "Acometida" — texto libre
  trazado: PuntoRuta[];
  origenCajaId?: number | null;
  origenCaja?: { id: number; codigo: string } | null;
  destinoCajaId?: number | null;
  destinoCaja?: { id: number; codigo: string } | null;
  nodoId?: number | null;
  nodo?: { id: number; nombre: string } | null;
  estado: string; // "ACTIVO" | "CORTADO" | "EN_MANTENIMIENTO"
  colorHex?: string | null;
  activo?: boolean;
  createdAt?: string;
}

// Vista previa de POST /red-fisica/importar-kml — candidatos leídos de un
// .kml/.kmz de Google Earth, todavía SIN guardar. El usuario los revisa
// (elige tipo/nodo) antes de mandarlos a /importar-kml/confirmar.
export interface CajaCandidataKml {
  nombreSugerido: string;
  // Copiado de un campo ExtendedData del propio archivo (ej. "Tipo") o, si
  // no hay, del nombre de la carpeta de Google Earth que contiene el
  // placemark — nunca inventado, para no meter errores de tipografía al
  // tener que re-escribirlo. undefined = no se pudo detectar, se elige a mano.
  tipoSugerido?: string;
  latitud: number;
  longitud: number;
  descripcion?: string;
}
export interface TendidoCandidatoKml {
  nombreSugerido: string;
  tipoSugerido?: string;
  trazado: PuntoRuta[];
  descripcion?: string;
}
export interface PreviaImportacionKml {
  cajas: CajaCandidataKml[];
  tendidos: TendidoCandidatoKml[];
  omitidos: number;
}

// Fila de la tabla que devuelve POST /olts/:id/puertos/consultar — una ONT
// puntual de un puerto GPON, con la señal de alerta ya calculada en el
// backend (ver UMBRAL_SENAL_DEBIL_DBM/UMBRAL_TEMPERATURA_ALTA_C en
// routes/olts.ts) para no duplicar esos umbrales en el frontend.
export interface OntPuertoConsulta {
  id: number;
  onuIndex: number;
  serial: string;
  estado: "ONLINE" | "OFFLINE";
  rxPowerDbm: string | null;
  txPowerDbm: string | null;
  temperaturaCelsius: string | null;
  distanciaMetros: number | null;
  ipGestion: string | null;
  cliente: { id: number; razonSocial: string; identificacion: string } | null;
  alerta: boolean;
}

// Respuesta de POST /olts/:id/puertos/consultar (Vista por puerto GPON, ver
// VistaPuertoOlt.tsx) — trae por SSH el estado completo de un puerto puntual
// para saber de un vistazo si se cayó el puerto entero o solo algunos ONT.
export interface ConsultaPuertoOlt {
  frame: number;
  slot: number;
  puerto: number;
  totales: { total: number; enLinea: number; desconectadas: number; conAlertas: number };
  todoElPuertoCaido: boolean;
  onts: OntPuertoConsulta[];
}

// Bitácora de transiciones detectadas por el polling (alta/baja, online/
// offline) — ver GET /olts/:id/eventos.
export interface OltEvento {
  id: number;
  oltId: number;
  oltOnuId?: number | null;
  oltOnu?: { id: number; serial: string; slot: number; puerto: number; onuIndex: number } | null;
  tipo: string;
  mensaje?: string | null;
  fecha: string;
}

// Respuesta de POST /olts/:id/sincronizar
export interface ResultadoSincronizacionOlt {
  totalDetectadas: number;
  nuevas: number;
  actualizadas: number;
  desaparecidas: number;
}

// Respuesta de POST /olts/:id/explorar-oid — herramienta de calibración, ver
// utils/oltHuawei.ts.
export interface ResultadoExplorarOid {
  total: number;
  filas: { oid: string; tipo?: number; valor: string }[];
  truncado: boolean;
}

// Switch TP-Link instalado en el domicilio de un cliente (ver SwitchCliente
// en schema.prisma) — a diferencia de la OLT, uno por cliente, 1 a 1.
// snmpComunidad/snmpAuthPassword/snmpPrivPassword nunca vuelven del backend.
export interface SwitchCliente {
  id: number;
  clienteId: number;
  cliente?: { id: number; razonSocial: string; identificacion: string };
  direccionIp: string;
  modelo?: string | null;
  cantidadPuertos: number;
  snmpPuerto: number;
  snmpVersion: string;
  snmpUsuario?: string | null;
  snmpAuthProtocolo?: string | null;
  snmpPrivProtocolo?: string | null;
  ultimaConexionExitosa?: string | null;
  activo?: boolean;
  createdAt?: string;
  puertos?: SwitchPuerto[];
}

// Estado cacheado de un puerto — ver GET /switches (viene incluido) y POST
// /switches/:id/sincronizar (lo recalcula). poeEstado: "DELIVERING_POWER" |
// "SEARCHING" | "FAULT" | "DISABLED" | null — ver advertencia sobre vataje
// en backend/src/utils/switchTpLink.ts (no es un dato confiable por SNMP
// estándar entre fabricantes, solo el estado categórico).
export interface SwitchPuerto {
  id: number;
  switchId: number;
  numeroPuerto: number;
  estado?: string | null; // "UP" | "DOWN" | null = todavía no sincronizado
  velocidadMbps?: number | null;
  trafficEntradaBps?: number | null;
  trafficSalidaBps?: number | null;
  poeEstado?: string | null;
  ultimaLectura?: string | null;
}

// Bitácora de transiciones UP/DOWN de un puerto — ver GET /switches/:id/eventos.
export interface SwitchEvento {
  id: number;
  switchId: number;
  switchPuertoId?: number | null;
  switchPuerto?: { id: number; numeroPuerto: number } | null;
  tipo: string;
  mensaje?: string | null;
  fecha: string;
}

// Respuesta de POST /switches/:id/sincronizar
export interface ResultadoSincronizacionSwitch {
  totalPuertos: number;
  puertosUp: number;
  puertosDown: number;
  transiciones: number;
}

// Estado de conexión calculado para un cliente en el Mapa de Red — ver
// backend/src/utils/estadoRedCliente.ts para la lógica de prioridad entre
// señales (ping, ONU/OLT, nodo). "OK" y "SIN_DATOS" no son alertas; el resto
// sí (ver MapaRedPage.tsx para el color/orden de severidad).
export type EstadoRedCliente = "OK" | "SENAL_DEBIL" | "LATENCIA_ALTA" | "INESTABLE" | "SIN_RESPUESTA" | "ONU_OFFLINE" | "NODO_CAIDO" | "SIN_DATOS";

// Fila de GET /mapa-red/clientes — un cliente con ubicación, listo para
// pintar en el mapa. latitud/longitud llegan como string (Decimal, ver
// convención del archivo) — se convierten a number recién al pasarlos a Leaflet.
export interface ClienteMapaRed {
  id: number;
  razonSocial: string;
  identificacion: string;
  direccionIp?: string | null;
  latitud: string;
  longitud: string;
  estado: EstadoRedCliente;
  detalle: string;
  pingMs?: number | null;
  pingUltimaMedicion?: string | null;
  onu?: { serial: string; estado: string | null; rxPowerDbm: string | null } | null;
  nodo?: { id: number; nombre: string } | null;
}

// Respuesta de POST /visitas/urgente — agenda una visita prioritaria para
// HOY, creando la ruta del técnico si todavía no la tenía (ver
// FormularioVisitaUrgente.tsx, disparado desde el Mapa de Red al notar un
// cliente caído).
export interface RespuestaVisitaUrgente {
  visita: VisitaTecnica;
  rutaId: number;
  rutaCreada: boolean;
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
  // Vista previa de la promoción (ver PromocionPlan) que le tocaría a este
  // cliente SI se factura hoy — informativa, el cálculo real se repite al
  // momento de facturar de verdad (ver POST /facturas-internet/:clienteId).
  promocionAplicable: {
    id: number;
    nombre: string;
    porcentajeDescuento: string;
    precioConDescuento: string;
  } | null;
}

// Alcance de una PromocionPlan — ver backend/prisma/schema.prisma.
export type AlcancePromocion = "TODOS_LOS_CLIENTES" | "CLIENTES_NUEVOS";

// Descuento temporal sobre la facturación de internet (ver
// PromocionesPage.tsx) — nunca toca PlanInternet.precio, solo resta un % al
// momento puntual de facturar (ver routes/facturasInternet.ts).
export interface PromocionPlan {
  id: number;
  nombre: string;
  porcentajeDescuento: string;
  fechaInicio: string;
  fechaFin: string | null;
  alcance: AlcancePromocion;
  // Solo tiene valor si alcance = CLIENTES_NUEVOS.
  mesesDesdeContrato: number | null;
  // null = aplica a cualquier plan de internet.
  planInternetId: number | null;
  planInternet?: { id: number; nombre: string } | null;
  activo: boolean;
  createdAt: string;
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
  // Datos de ORIGEN del pago (banco/cuenta/tarjeta de quien pagó) — distintos
  // de cuentaBancaria arriba (la cuenta PROPIA de la empresa). Todos
  // opcionales; cuáles aplican depende de formaPago, ver ModalRegistrarPago.tsx.
  // bancoOrigen es del catálogo Banco (no texto libre), ver ese tipo arriba.
  bancoOrigenId?: number | null;
  bancoOrigen?: { id: number; nombre: string } | null;
  numeroCuentaOrigen?: string | null;
  tarjetaUltimosDigitos?: string | null;
  tarjetaTipo?: string | null; // "CREDITO" | "DEBITO"
  tarjetaReferencia?: string | null; // N° de referencia que imprime el datafono
  tarjetaLote?: string | null; // N° de lote de la transacción
  chequeNumero?: string | null;
  chequeFechaCobro?: string | null;
  // Si este pago liquidó una Cuota de un plan a plazos (ver modelo Cuota),
  // acá viene su número — solo el número, el resto del detalle de la cuota
  // vive en Factura/NotaVenta/Compra.cuotas (ver GET /:id de cada una).
  cuota?: { numero: number } | null;
}

// Mismo criterio que urlImagenProducto(): comprobanteUrl es una ruta
// relativa, hay que completarla con la URL del backend para usarla en un
// <img src> o un enlace "Ver comprobante".
export function urlComprobantePago(pago: Pago): string | null {
  return pago.comprobanteUrl ? `${URL_BASE_API}${pago.comprobanteUrl}` : null;
}

// Arma un resumen de una línea de los datos de ORIGEN del pago (banco/cuenta/
// tarjeta/cheque de quien pagó) para mostrar en el historial y el
// Reporteador — qué campos aplican depende de formaPago, ver el modelo Pago.
export function origenPagoTexto(pago: Pago): string | null {
  const partes: string[] = [];
  if (pago.bancoOrigen) partes.push(pago.bancoOrigen.nombre);
  if (pago.numeroCuentaOrigen) partes.push(`cta. ${pago.numeroCuentaOrigen}`);
  if (pago.tarjetaTipo) partes.push(pago.tarjetaTipo === "CREDITO" ? "crédito" : "débito");
  if (pago.tarjetaUltimosDigitos) partes.push(`•••• ${pago.tarjetaUltimosDigitos}`);
  if (pago.tarjetaReferencia) partes.push(`ref. ${pago.tarjetaReferencia}`);
  if (pago.tarjetaLote) partes.push(`lote ${pago.tarjetaLote}`);
  if (pago.chequeNumero) partes.push(`cheque N° ${pago.chequeNumero}`);
  if (pago.chequeFechaCobro) partes.push(`cobrable ${new Date(pago.chequeFechaCobro).toLocaleDateString("es-EC")}`);
  return partes.length > 0 ? partes.join(" — ") : null;
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

// Una cuota de un plan de pago a plazos (ver modelo Cuota en schema.prisma)
// — a diferencia de un abono libre, se cobra ESTRICTAMENTE EN ORDEN y por su
// monto EXACTO (ver ModalRegistrarPago.tsx). Solo presente en el detalle de
// una Factura/NotaVenta (GET /:id), no en el listado.
export interface Cuota {
  id: number;
  numero: number;
  monto: string;
  fechaVencimiento: string;
  estado: "PENDIENTE" | "PAGADA";
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
  cuotas?: Cuota[];
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
  cuotas?: Cuota[];
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
  cuotas?: Cuota[];
  sustentoTributario?: string | null; // código de la tabla "Sustento Tributario" del SRI
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
export type EstadoNumeroSerie = "EN_BODEGA" | "EN_TRANSITO" | "ENTREGADO";

export interface NumeroSerieProducto {
  id: number;
  numeroSerie: string;
  estado: EstadoNumeroSerie;
  fechaEntrega: string | null;
  referenciaDocumento: string | null;
  createdAt: string;
  producto: { id: number; nombre: string; codigo: string };
  cliente: { id: number; razonSocial: string; identificacion: string } | null;
  compraDetalle: {
    compra: { id: number; numeroFactura: string; fechaEmision: string; proveedor: { razonSocial: string } };
  } | null;
  // Quién lo tiene en mano ahora mismo — solo viene con datos cuando estado
  // = EN_TRANSITO (ver EgresoBodega, GET /productos/series/buscar).
  egresosDetalle?: { id: number; egreso: { id: number; empleado: { id: number; nombres: string; apellidos: string } } }[];
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
// /visitas/:id/detalle-trabajo) — sigue sin ser un movimiento de inventario
// formal, es el acta de lo que el técnico dice que dejó.
export interface EquipoDejadoVisita {
  id: number;
  visitaId: number;
  tipo: string;
  modelo: string | null;
  // Para equipos de red, en la práctica es la dirección MAC.
  serial: string | null;
  // Solo tiene valor si el serial se eligió del catálogo real (ver
  // ProductoCatalogoEquipo/SerieDisponibleCatalogo abajo) — permite marcar
  // ese número de serie ENTREGADO al guardar y devolverlo a bodega si se
  // quita del acta después. null si se tipeó a mano.
  numeroSerieProductoId: number | null;
  // Igual criterio: solo tiene valor si el técnico eligió descontar metros
  // de uno de SUS rollos asignados (ver RolloMetrajeDisponible/GET
  // /metraje/mis-rollos) — metrosUsados siempre va junto.
  asignacionMetrajeId?: number | null;
  metrosUsados?: number | null;
}

// Insumo consumido en el trabajo que no es un equipo identificable (cinta,
// canaleta, conectores, etc.) — ver MaterialUtilizadoVisita en schema.prisma.
export interface MaterialUtilizadoVisita {
  id: number;
  visitaId: number;
  descripcion: string;
  cantidad: number;
  unidad: string;
}

export type TipoTrabajoVisita = "INSTALACION_NUEVA" | "MEJORA_EXISTENTE";

// Respuesta de GET /metraje/mis-rollos — rollos de cable que el técnico
// logueado tiene activos, con metros disponibles, para elegir en el acta de
// una visita (ver DetalleTrabajoVisita.tsx).
export interface RolloMetrajeDisponible {
  id: number;
  producto: { id: number; nombre: string; codigo: string };
  metrosIniciales: number;
  metrosRestantes: number;
}

// Respuesta de GET /metraje/asignaciones (vista admin) — el historial
// completo, activas o no, ver MetrajePage.tsx.
export interface AsignacionMetraje {
  id: number;
  producto: { id: number; nombre: string; codigo: string; unidadMedida: string };
  empleado: { id: number; nombres: string; apellidos: string };
  bodega: { id: number; nombre: string };
  metrosIniciales: number;
  metrosRestantes: number;
  activo: boolean;
  createdAt: string;
  // Cuadre al cerrar con conteo físico — null si se cerró sin contar.
  metrosDevueltosFisicos?: number | null;
  metrosFaltantes?: number | null;
}

// Respuesta de GET /visitas/catalogo-equipos — catálogo real de productos
// (no servicios) para que el técnico elija el equipo dejado en vez de
// tipearlo a mano (ver DetalleTrabajoVisita.tsx). El acta sigue guardando
// texto libre (EquipoDejadoVisita no tiene FK a Producto, a propósito), esto
// solo alimenta los selects para evitar errores de tipeo.
export interface ProductoCatalogoEquipo {
  id: number;
  nombre: string;
  marca: string | null;
  modelo: string | null;
  controlaNumeroSerie: boolean;
}

// Respuesta de GET /visitas/catalogo-equipos/:productoId/series — números de
// serie EN_BODEGA de ese producto, para el select de "Serial / MAC".
export interface SerieDisponibleCatalogo {
  id: number;
  numeroSerie: string;
}

export interface VisitaTecnica {
  id: number;
  rutaVisitaId: number;
  clienteId: number | null;
  cliente: Cliente | null;
  nombreContacto: string;
  direccion: string | null;
  // Qué debe hacer el técnico acá, definido por quien armó la ruta (ej.
  // "Revisión de equipos", "Fibra óptica rota") — ver comentario del modelo
  // en schema.prisma. Distinto de descripcionTrabajo (lo que se reportó
  // después) y de observaciones (por qué se omitió, si aplica).
  motivoVisita: string | null;
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
  // Si esta visita fue una instalación nueva o una mejora a un cliente ya
  // existente — lo indica el técnico al llenar el acta, opcional.
  tipoTrabajo?: TipoTrabajoVisita | null;
  materialesUtilizados?: MaterialUtilizadoVisita[];
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
  motivoVisita: string | null;
  latitud: string;
  longitud: string;
  orden: number;
  esUrgente: boolean;
  estado: "PENDIENTE" | "COMPLETADA" | "OMITIDA";
  fechaLlegadaReal: string | null;
  latitudLlegada: string | null;
  longitudLlegada: string | null;
  distanciaAlPunto: string | null;
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
  motivoVisita: string | null;
  latitud: string;
  longitud: string;
  orden: number;
  esUrgente: boolean;
  estado: "PENDIENTE" | "COMPLETADA" | "OMITIDA";
  fechaLlegadaReal: string | null;
  latitudLlegada: string | null;
  longitudLlegada: string | null;
  distanciaAlPunto: string | null;
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

// Control de proximidad de cobro por CUOTA individual (ver
// GET /reportes/cuotas-por-cobrar) — a diferencia de CuentasPorCobrar (por
// documento completo), acá cada cuota de un plan a plazos aparece por
// separado con su propia fecha, para ver exactamente cuál vence primero.
export interface CuotasPorCobrar {
  resumen: { cantidadCuotas: number; totalPorCobrar: string; vencidas: number };
  cuotas: {
    id: number;
    numero: number;
    monto: string;
    fechaVencimiento: string;
    diasParaVencer: number | null;
    diasAtraso: number | null;
    tipo: "FACTURA" | "NOTA_VENTA";
    documentoId: number;
    secuencial: string;
    cliente: string;
  }[];
}

// El reverso de CuotasPorCobrar: control de proximidad de PAGO por CUOTA
// individual de un plan a plazos con un proveedor (ver
// GET /reportes/cuotas-por-pagar).
export interface CuotasPorPagar {
  resumen: { cantidadCuotas: number; totalPorPagar: string; vencidas: number };
  cuotas: {
    id: number;
    numero: number;
    monto: string;
    fechaVencimiento: string;
    diasParaVencer: number | null;
    diasAtraso: number | null;
    compraId: number;
    numeroFactura: string;
    proveedor: string;
  }[];
}

// Insumo para el Anexo Transaccional Simplificado (ATS) mensual (ver
// GET /reportes/ats) — NO es el XML oficial que exige el SRI (ver el
// comentario de esa ruta en el backend), es el detalle por comprobante para
// revisar y cargar a mano al DIMM Formularios. sustentoTributario siempre
// llega null: ese código todavía no se captura al registrar una compra.
export interface ReporteAts {
  periodo: { anio: number; mes: number };
  resumen: {
    cantidadVentas: number;
    cantidadNotasCredito: number;
    cantidadCompras: number;
    cantidadRetencionesEmitidas: number;
    cantidadRetencionesRecibidas: number;
    cantidadAnulados: number;
    totalVentas: string;
    totalCompras: string;
    totalRetencionesEmitidas: string;
    totalRetencionesRecibidas: string;
  };
  ventas: {
    tipo: "FACTURA" | "NOTA_VENTA";
    fecha: string;
    comprobante: string;
    claveAcceso: string | null;
    identificacion: string;
    tipoIdentificacion: string;
    razonSocial: string;
    base0: string;
    base12: string;
    iva: string;
    total: string;
  }[];
  notasCredito: {
    fecha: string;
    comprobante: string;
    claveAcceso: string | null;
    facturaModificada: string;
    identificacion: string;
    tipoIdentificacion: string;
    razonSocial: string;
    base0: string;
    base12: string;
    iva: string;
    total: string;
  }[];
  compras: {
    fecha: string;
    comprobante: string;
    identificacion: string;
    tipoIdentificacion: string;
    razonSocial: string;
    base0: string;
    base12: string;
    iva: string;
    total: string;
    sustentoTributario: string | null;
  }[];
  retencionesEmitidas: {
    fecha: string;
    comprobante: string;
    claveAcceso: string | null;
    compraNumeroFactura: string;
    identificacion: string;
    tipoIdentificacion: string;
    razonSocial: string;
    totalIva: string;
    totalRenta: string;
    total: string;
    detalles: { tipoImpuesto: string; codigoRetencion: string; baseImponible: string; porcentaje: string; valorRetenido: string }[];
  }[];
  retencionesRecibidas: {
    fecha: string;
    comprobante: string;
    facturaSecuencial: string;
    identificacion: string;
    tipoIdentificacion: string;
    razonSocial: string;
    totalIva: string;
    totalRenta: string;
    total: string;
    detalles: { tipoImpuesto: string; codigoRetencion: string; baseImponible: string; porcentaje: string; valorRetenido: string }[];
  }[];
  anulados: { tipo: "FACTURA" | "NOTA_CREDITO"; comprobante: string; fecha: string; claveAcceso: string | null }[];
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

// Códigos de las tablas oficiales del SRI (tipo de identificación,
// porcentaje de IVA, forma de pago) que la app necesita para armar el XML
// de los comprobantes electrónicos — editables desde Ajustes > Códigos SRI
// para cuando el SRI los actualiza, sin tocar código (ver
// GET/PUT /configuracion/codigos-sri).
export interface CodigosSri {
  tipoIdentificacion: Record<string, string>;
  formaPago: Record<string, string>;
  porcentajeIva: Record<string, string>;
}

// --- Vehículos (flota de la empresa) ---
// Ver el comentario del módulo en backend/prisma/schema.prisma.

// Catálogo de marca/modelo — se elige de una lista en vez de escribirlo a
// mano (ver backend/prisma/schema.prisma, MarcaVehiculo/ModeloVehiculo).
export interface MarcaVehiculo {
  id: number;
  nombre: string;
  activo?: boolean;
  createdAt?: string;
}

export interface ModeloVehiculo {
  id: number;
  marcaId: number;
  nombre: string;
  activo?: boolean;
  createdAt?: string;
}

export interface Vehiculo {
  id: number;
  placa: string;
  marcaId: number;
  marca: { id: number; nombre: string };
  modeloId: number;
  modelo: { id: number; nombre: string };
  anio?: number | null;
  color?: string | null;
  sucursalId: number | null;
  sucursal: { id: number; nombre: string } | null;
  // Caché del mayor kilometraje registrado entre sus cargas de combustible,
  // mantenimientos y usos diarios — null si todavía no se registró ninguno
  // (ver backend/src/utils/vehiculos.ts).
  kilometrajeActual: number | null;
  activo: boolean;
  createdAt: string;
  // Uso diario EN_USO ahora mismo (si alguien lo tiene) — arreglo de 0 o 1
  // elemento, ver "usos" en backend/src/routes/vehiculos.ts (SELECT_VEHICULO).
  usos: { id: number; empleado: { id: number; nombres: string; apellidos: string }; kilometrajeInicial: number; fechaInicio: string }[];
}

export type EstadoUsoVehiculo = "EN_USO" | "FINALIZADO";

// Un día de uso de un vehículo por un técnico — abre con el kilometraje
// inicial y cierra con el final, mismo patrón que CajaSesion pero para un
// vehículo (ver backend/prisma/schema.prisma, UsoVehiculo). Reemplaza el
// viejo concepto de "responsable fijo": cualquier técnico puede tomar
// cualquier vehículo libre cualquier día.
export interface UsoVehiculo {
  id: number;
  vehiculoId: number;
  vehiculo: { id: number; placa: string; marca: { nombre: string }; modelo: { nombre: string } };
  empleadoId: number;
  empleado: { id: number; nombres: string; apellidos: string };
  kilometrajeInicial: number;
  fechaInicio: string;
  kilometrajeFinal: number | null;
  fechaFin: string | null;
  estado: EstadoUsoVehiculo;
  observaciones?: string | null;
  // Control de entrega del vehículo (ver POST /vehiculos/uso/abrir) — todos
  // opcionales, texto libre, cargados solo al empezar el día.
  golpesCarroceria?: string | null;
  vidrios?: string | null;
  llantas?: string | null;
  lucesVisibles?: string | null;
  accesorios?: string | null;
  llaves?: string | null;
  documentacion?: string | null;
  equiposHerramientas?: string | null;
  createdAt: string;
}

export interface CargaCombustible {
  id: number;
  vehiculoId: number;
  fecha: string;
  kilometraje: number;
  tipoCombustible: string;
  galones: string;
  costoTotal: string;
  gasolinera?: string | null;
  observaciones?: string | null;
  // Foto del comprobante de pago (factura/ticket de la gasolinera) — ruta
  // relativa, completar con urlArchivoSubido() para mostrarla o enlazarla.
  // null = no se adjuntó ninguna al registrar la carga.
  comprobanteUrl?: string | null;
  usuario: { id: number; nombre: string } | null;
  createdAt: string;
}

export type TipoMantenimientoVehiculo =
  | "CAMBIO_ACEITE"
  | "CAMBIO_FILTRO_ACEITE"
  | "CAMBIO_FILTRO_AIRE"
  | "CAMBIO_PASTILLAS_FRENO"
  | "CAMBIO_LLANTAS"
  | "ALINEACION_BALANCEO"
  | "REVISION_GENERAL"
  | "OTRO";

// Etiquetas legibles para el select/tabla — ver TIPOS_MANTENIMIENTO en
// backend/src/routes/vehiculos.ts (misma lista, mismo orden).
export const ETIQUETAS_MANTENIMIENTO_VEHICULO: Record<TipoMantenimientoVehiculo, string> = {
  CAMBIO_ACEITE: "Cambio de aceite",
  CAMBIO_FILTRO_ACEITE: "Cambio de filtro de aceite",
  CAMBIO_FILTRO_AIRE: "Cambio de filtro de aire",
  CAMBIO_PASTILLAS_FRENO: "Cambio de pastillas de freno",
  CAMBIO_LLANTAS: "Cambio de llantas",
  ALINEACION_BALANCEO: "Alineación y balanceo",
  REVISION_GENERAL: "Revisión general",
  OTRO: "Otro",
};

export interface MantenimientoVehiculo {
  id: number;
  vehiculoId: number;
  tipo: TipoMantenimientoVehiculo;
  fecha: string;
  kilometraje: number;
  costo: string | null;
  taller?: string | null;
  descripcion?: string | null;
  proximoKilometraje: number | null;
  // Respaldo de que se hizo — mismo criterio que CargaCombustible.comprobanteUrl.
  numeroFactura?: string | null;
  comprobanteUrl?: string | null;
  usuario: { id: number; nombre: string } | null;
  createdAt: string;
}

// Regla de mantenimiento preventivo por vehículo ("cada X km toca este
// tipo, avisar cuando falten Y") — ver el comentario del modelo en
// backend/prisma/schema.prisma. Hace que MantenimientoVehiculo.
// proximoKilometraje se calcule solo al registrar el siguiente mantenimiento
// de ese tipo, en vez de escribirlo a mano cada vez.
export interface PlanMantenimientoVehiculo {
  id: number;
  vehiculoId: number;
  tipo: TipoMantenimientoVehiculo;
  intervaloKm: number;
  kmAvisoPrevio: number;
  activo?: boolean;
  createdAt?: string;
}

// Fila de GET /vehiculos/alertas-mantenimiento — solo trae los que ya están
// vencidos o por vencer (dentro de kmAvisoPrevio), pensado para un banner
// de avisos, no para el estado de todos los vehículos.
export interface AlertaMantenimientoVehiculo {
  vehiculoId: number;
  placa: string;
  marca: string;
  modelo: string;
  tipo: TipoMantenimientoVehiculo;
  kilometrajeActual: number | null;
  proximoKilometraje: number;
  kmRestantes: number;
  estado: "VENCIDO" | "PROXIMO";
}

// Respuesta de GET /vehiculos/:id/reporte?desde=&hasta= — resumen de todo lo
// que pasó con un vehículo en un rango de fechas (cargas, mantenimientos,
// usos diarios) más el detalle día por día, para VehiculosPage.tsx.
export interface TecnicoEncargadoVehiculo {
  empleadoId: number;
  nombre: string;
  diasUso: number;
  kmRecorridos: number;
}

export interface ReporteVehiculo {
  vehiculo: Vehiculo;
  rango: { desde: string | null; hasta: string | null };
  resumen: {
    kmRecorridos: number;
    cantidadCargas: number;
    totalGalones: string;
    totalCombustible: string;
    cantidadMantenimientos: number;
    totalMantenimiento: string;
    diasUso: number;
    cantidadTecnicos: number;
  };
  tecnicos: TecnicoEncargadoVehiculo[];
  cargasCombustible: CargaCombustible[];
  mantenimientos: MantenimientoVehiculo[];
  usos: UsoVehiculo[];
}

// Fila de GET /vehiculos/reporte-combustible, agrupada por agencia (sucursal
// del vehículo) o por técnico — ver ReporteCombustibleFlota más abajo.
export interface GastoCombustiblePorAgencia {
  sucursalId: number | null;
  nombre: string;
  cantidadCargas: number;
  totalGalones: string;
  totalCombustible: string;
}

export interface GastoCombustiblePorTecnico {
  empleadoId: number | null;
  nombre: string; // "Sin técnico asignado" cuando la carga no cae dentro de ningún Uso de Vehículo
  cantidadCargas: number;
  totalGalones: string;
  totalCombustible: string;
  // Suma de los "kmRecorridos" (ver CargaCombustibleFlota) de las cargas
  // atribuidas a este técnico — NUNCA el kmRecorridos de ReporteVehiculo
  // (ese sale de UsoVehiculo.kilometrajeFinal-Inicial, un cálculo distinto).
  kmRecorridos: number;
}

// Fila de "cargas" en GET /vehiculos/reporte-combustible — versión acotada
// de CargaCombustible con el vehículo/agencia ya incluidos, para la tabla
// de detalle del reporte de flota (no reemplaza CargaCombustible, que sigue
// siendo la fuente completa por vehículo puntual).
export interface CargaCombustibleFlota {
  id: number;
  fecha: string;
  galones: string;
  costoTotal: string;
  gasolinera: string | null;
  vehiculo: { id: number; placa: string; sucursal: { id: number; nombre: string } | null };
  // Km recorridos con el tanque de ESTA carga (diferencia de kilometraje
  // contra la carga anterior del mismo vehículo) y el rendimiento (km por
  // galón) que salió de ella — ambos null en la primera carga registrada de
  // ese vehículo, o si el odómetro no avanzó respecto a la anterior.
  kmRecorridos: number | null;
  rendimiento: string | null;
}

// Fila de "porVehiculo" en GET /vehiculos/reporte-combustible — a
// diferencia de porAgencia/porTecnico (ordenadas por gasto, de mayor a
// menor), esta viene ordenada por RENDIMIENTO ascendente (la unidad que
// menos km por galón dio primero), pensada para detectar de un vistazo
// cuál vehículo rinde peor. "rendimiento" es null cuando no hay ningún
// delta de kilometraje calculable en el período (ver CargaCombustibleFlota).
export interface GastoCombustiblePorVehiculo {
  vehiculoId: number;
  placa: string;
  cantidadCargas: number;
  totalGalones: string;
  totalCombustible: string;
  kmRecorridos: number;
  rendimiento: string | null;
}

// Respuesta de GET /vehiculos/reporte-combustible?desde=&hasta=&sucursalId=
// — panorama de gasto de combustible de TODA la flota (a diferencia de
// ReporteVehiculo, que es por un solo vehículo), para
// ReporteCombustiblePage.tsx.
export interface ReporteCombustibleFlota {
  rango: { desde: string | null; hasta: string | null };
  resumen: {
    cantidadCargas: number;
    totalGalones: string;
    totalCombustible: string;
    cantidadVehiculos: number;
  };
  porAgencia: GastoCombustiblePorAgencia[];
  porTecnico: GastoCombustiblePorTecnico[];
  porVehiculo: GastoCombustiblePorVehiculo[];
  cargas: CargaCombustibleFlota[];
}

// --- Localización de técnicos ---
// Ver el comentario del módulo en backend/prisma/schema.prisma
// (UbicacionTecnico) — historial append-only de posiciones GPS del celular
// de cada técnico, capturadas por la app móvil cada ~2 min mientras la
// tiene abierta (ver hooks/useUbicacionTecnico.ts).

export type EstadoUbicacionTecnico = "EN_LINEA" | "RECIENTE" | "DESCONECTADO" | "SIN_DATOS";

// Fila de GET /ubicaciones-tecnicos/actual — la última posición conocida de
// cada técnico que alguna vez reportó una, más el vehículo que tiene EN_USO
// ahora mismo (si tiene uno, ver UsoVehiculo) para poder responder también
// "dónde está el vehículo X".
export interface UbicacionActualTecnico {
  empleadoId: number;
  nombre: string;
  latitud: string;
  longitud: string;
  precisionMetros: string | null;
  fecha: string;
  minutos: number;
  estado: EstadoUbicacionTecnico;
  vehiculo: { id: number; placa: string; marca: { nombre: string }; modelo: { nombre: string } } | null;
}

// Punto de GET /ubicaciones-tecnicos/:empleadoId/recorrido — para dibujar la
// línea del recorrido del día de un técnico puntual.
export interface PuntoRecorridoTecnico {
  latitud: string;
  longitud: string;
  precisionMetros: string | null;
  fecha: string;
}

// --- Egresos de bodega (despacho de equipos serializados a un técnico) ---
// Ver el comentario del módulo en backend/prisma/schema.prisma
// (EgresoBodega/EgresoBodegaDetalle) — el documento que cierra la brecha
// entre "el equipo está en bodega" y "quedó entregado a un cliente".

export type EstadoEgresoBodegaDetalle = "EN_TRANSITO" | "ENTREGADO" | "DEVUELTO";

export interface EgresoBodegaDetalle {
  id: number;
  estado: EstadoEgresoBodegaDetalle;
  createdAt: string;
  numeroSerieProducto: {
    id: number;
    numeroSerie: string;
    estado: EstadoNumeroSerie;
    clienteId: number | null;
    cliente: { id: number; razonSocial: string } | null;
    producto: { id: number; nombre: string; marca: string | null; modelo: string | null };
  };
}

export interface EgresoBodega {
  id: number;
  empleado: { id: number; nombres: string; apellidos: string };
  clienteDestino: { id: number; razonSocial: string; identificacion: string } | null;
  usuario: { id: number; nombre: string } | null;
  observaciones: string | null;
  createdAt: string;
  detalles: EgresoBodegaDetalle[];
}

// Fila de GET /egresos-bodega/mis-pendientes — lo que el técnico logueado
// tiene en mano ahora mismo, de cualquier egreso.
export interface EgresoPendienteTecnico {
  id: number; // id del EgresoBodegaDetalle
  createdAt: string;
  egreso: { id: number; clienteDestino: { id: number; razonSocial: string } | null };
  numeroSerieProducto: {
    id: number;
    numeroSerie: string;
    producto: { id: number; nombre: string; marca: string | null; modelo: string | null };
  };
}

// ===========================================================================
// Centro de Control (backend/src/routes/centroControl.ts)
// ===========================================================================

export interface AlertaRed {
  id: number;
  tipo: "CORTE_MASIVO" | "SENAL_DEGRADADA" | "NODO_CAIDO";
  olt: { id: number; nombre: string } | null;
  nodo: { id: number; nombre: string; mikrotikHost: string } | null;
  slot: number | null;
  puerto: number | null;
  cantidadAfectadas: number;
  mensaje: string;
  fechaInicio: string;
  fechaFin: string | null;
  cerradaManualmente: boolean;
  cantidadTickets: number;
  onu: {
    id: number;
    serial: string;
    onuIndex: number;
    rxPowerDbm: string | null;
    estado: string | null;
    cliente: { id: number; razonSocial: string; telefono: string | null } | null;
  } | null;
  clientesAfectados: { id: number; razonSocial: string; telefono: string | null; estadoOnu: string | null }[];
}

export interface DisponibilidadNodo {
  nodoId: number;
  nombre: string;
  host: string;
  clientes: number;
  disponibilidad: number | null;
  chequeos: number;
  latenciaPromedioMs: number | null;
  caidas: number;
  minutosCaido: number;
  caidoAhora: boolean;
  ultimoChequeo: { enLinea: boolean; fecha: string; error: string | null } | null;
  ultimaConexionExitosa: string | null;
}

export interface OnuPeorSenal {
  id: number;
  slot: number;
  puerto: number;
  onuIndex: number;
  serial: string;
  rxPowerDbm: string;
  olt: { nombre: string };
  cliente: { id: number; razonSocial: string } | null;
}

export interface LecturaSenal {
  fecha: string;
  rxPowerDbm: string;
}

export interface VisitasSospechosas {
  umbralMetros: number;
  totalVisitas: number;
  porTecnico: { empleadoId: number; nombre: string; visitas: number; sospechosas: number }[];
  sospechosas: {
    visitaId: number;
    fechaLlegadaReal: string;
    tecnico: string;
    empleadoId: number;
    nombreContacto: string;
    cliente: { id: number; razonSocial: string } | null;
    motivoVisita: string | null;
    distanciaAlPunto: number | null;
    distanciaRastroMetros: number | null;
    motivos: string[];
  }[];
}

export interface CuadreTecnicos {
  promedioGeneralMetrosPorInstalacion: number | null;
  tecnicos: {
    empleadoId: number;
    nombre: string;
    equiposEnMano: { detalleId: number; numeroSerieProductoId: number; producto: string; numeroSerie: string; dias: number }[];
    equiposMasDe7Dias: number;
    rollosActivos: { id: number; producto: string; metrosIniciales: number; metrosRestantes: number; dias: number }[];
    metrosFaltantes: number;
    valorFaltante: string;
    instalaciones90Dias: number;
    promedioMetrosPorInstalacion: number | null;
    consumoAlto: boolean;
  }[];
}

interface ClienteDeBaja {
  id: number;
  razonSocial: string;
  telefono: string | null;
  direccion: string | null;
  fechaBaja: string | null;
}

export interface EquiposNoRecuperados {
  valorEstimado: string;
  conSerie: {
    numeroSerieProductoId: number;
    producto: string;
    numeroSerie: string;
    costo: string | null;
    fechaEntrega: string | null;
    cliente: ClienteDeBaja;
  }[];
  textoLibre: { id: number; tipo: string; modelo: string | null; serial: string | null; fechaInstalacion: string; cliente: ClienteDeBaja | null }[];
}

export interface AnomaliaCombustible {
  cargaId: number;
  fecha: string;
  placa: string;
  kilometraje: number;
  galones: string;
  costoTotal: string;
  gasolinera: string | null;
  registradoPor: string | null;
  motivo: string;
  rendimiento: string | null;
  rendimientoMediano: string | null;
}

export interface IndicadoresIsp {
  clientesActivos: number;
  ingresoMensualRecurrente: string;
  arpu: string;
  porPlan: { plan: string; clientes: number; ingreso: string }[];
  meses: { mes: string; activosAlInicio: number; altas: number; bajas: number; churnPorcentaje: number | null }[];
  motivosBaja: { motivo: string; cantidad: number }[];
  morosidad: {
    evaluados: number;
    alDia: number;
    pendientesDentroDePlazo: number;
    morosos: number;
    porcentaje: number;
    montoMoroso: string;
    detalle: { id: number; razonSocial: string; telefono: string | null; plan: string; monto: string; diasAtraso: number; enProrroga: boolean }[];
  };
  suspensionesRepetidas: { id: number; razonSocial: string; telefono: string | null; activo: boolean; suspensiones: number }[];
  historialSuspensionesDesde: string | null;
}

export interface ResumenEncuestas {
  enviadas: number;
  respondidas: number;
  promedio: number | null;
  porTecnico: { empleadoId: number; nombre: string; enviadas: number; respondidas: number; calificacionesBajas: number; promedio: number | null }[];
  encuestas: {
    id: number;
    enviadaEn: string;
    calificacion: number | null;
    comentario: string | null;
    respondidaEn: string | null;
    visitaId: number;
    cliente: string;
    motivoVisita: string | null;
    tecnico: string;
  }[];
}

// ===========================================================================
// Tickets de soporte (backend/src/routes/tickets.ts)
// ===========================================================================

export type EstadoTicket = "ABIERTO" | "EN_PROCESO" | "RESUELTO" | "CANCELADO";
export type PrioridadTicket = "BAJA" | "MEDIA" | "ALTA";

export interface TicketSoporte {
  id: number;
  clienteId: number | null;
  cliente: { id: number; razonSocial: string; telefono: string | null; direccion: string | null } | null;
  nombreContacto: string;
  telefono: string | null;
  canal: "WHATSAPP" | "LLAMADA" | "PRESENCIAL" | "SISTEMA" | "PORTAL";
  categoria: string;
  prioridad: PrioridadTicket;
  asunto: string;
  estado: EstadoTicket;
  asignadoEmpleadoId: number | null;
  asignadoEmpleado: { id: number; nombres: string; apellidos: string } | null;
  visitaTecnica: { id: number; estado: string; fechaLlegadaReal: string | null; rutaVisita: { fecha: string } } | null;
  alertaRed: { id: number; tipo: string; mensaje: string; fechaFin: string | null } | null;
  creadoPorUsuario: { id: number; nombre: string } | null;
  solucion: string | null;
  createdAt: string;
  fechaPrimeraAtencion: string | null;
  fechaResolucion: string | null;
  sla: { horasTranscurridas: number; horasLimite: number; vencido: boolean };
  _count?: { mensajes: number };
}

export interface MensajeTicket {
  id: number;
  autor: "CLIENTE" | "USUARIO" | "SISTEMA";
  texto: string;
  createdAt: string;
  usuario: { nombre: string } | null;
}

export interface TicketDetalle extends TicketSoporte {
  mensajes: MensajeTicket[];
  puedeResponderWhatsapp: boolean;
}

export interface TecnicosCercanos {
  clienteConUbicacion: boolean;
  tecnicos: {
    empleadoId: number;
    nombre: string;
    cargo: string;
    distanciaMetros: number | null;
    minutosDesdeUbicacion: number | null;
    visitasPendientesHoy: number;
  }[];
}

export interface ResumenTickets {
  abiertos: number;
  enProceso: number;
  vencidos: number;
  resueltos30Dias: number;
  porcentajeDentroSla30Dias: number | null;
  porTecnico: { nombre: string; resueltos: number; horasPromedio: number; porcentajeDentroSla: number }[];
}
