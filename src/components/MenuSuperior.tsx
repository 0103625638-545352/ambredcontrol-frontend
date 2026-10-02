import { type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ShoppingCart,
  Package,
  Users,
  FileText,
  FileCheck2,
  FileClock,
  FileMinus2,
  Truck,
  Wallet,
  ShoppingBag,
  Undo2,
  Barcode,
  Warehouse,
  LayoutGrid,
  ArrowLeftRight,
  BarChart3,
  Table2,
  UserCog,
  Tags,
  Landmark,
  Building2,
  History,
  Calculator,
  FileSpreadsheet,
  IdCard,
  Banknote,
  Settings,
  MapPin,
  CalendarClock,
  Router,
  Wifi,
  Network,
  Receipt,
  Server,
  MapPinned,
  BadgePercent,
  Cable,
  Ruler,
  Car,
  Fuel,
  LocateFixed,
  PackageOpen,
  Info,
  Siren,
  Headset,
  BadgeDollarSign,
  type LucideIcon,
} from "lucide-react";
import { api, type DashboardResumen } from "../api/client";

export type Pestana =
  | "dashboard"
  | "venta"
  | "caja"
  | "productos"
  | "clientes"
  | "facturas"
  | "notasVenta"
  | "proformas"
  | "notasCredito"
  | "guiasRemision"
  | "compras"
  | "devolucionesCompra"
  | "seriesProductos"
  | "egresosBodega"
  | "metraje"
  | "proveedores"
  | "categorias"
  | "tiposPrecio"
  | "cuentasBancarias"
  | "bancos"
  | "traslados"
  | "reportes"
  | "reporteadorPrincipal"
  | "usuarios"
  | "auditoria"
  | "contabilidad"
  | "ats"
  | "empleados"
  | "nomina"
  | "vehiculos"
  | "reporteCombustible"
  | "visitas"
  | "historialVisitas"
  | "mikrotik"
  | "planesInternet"
  | "promociones"
  | "facturacionInternet"
  | "nodos"
  | "olts"
  | "redFisica"
  | "mapaRed"
  | "ubicacionTecnicos"
  | "centroControl"
  | "tickets"
  | "conciliacion"
  | "ajustes"
  | "acercaDe";

interface Item {
  id: Pestana;
  etiqueta: string;
  icono: ReactNode;
}

interface Grupo {
  titulo: string;
  icono: ReactNode;
  items: Item[];
}

interface Props {
  pestanaActiva: Pestana;
  onSeleccionar: (p: Pestana) => void;
  esAdmin: boolean;
  puedeNotasCredito: boolean;
  puedeReportes: boolean;
  puedeAuditoria: boolean;
  puedeConfiguracion: boolean;
  puedeTraslados: boolean;
  puedeCaja: boolean;
  puedeContabilidad: boolean;
  puedeDevolucionesCompra: boolean;
  puedeGuiasRemision: boolean;
  puedeNomina: boolean;
  puedeVehiculos: boolean;
  mostrarVisitas: boolean;
  puedeVisitas: boolean;
  puedeMikrotik: boolean;
  puedeOlt: boolean;
  puedeRedFisica: boolean;
  puedeMapaRed: boolean;
  puedeUbicacionTecnicos: boolean;
  puedeCentroControl: boolean;
  puedeTickets: boolean;
  puedeVentas: boolean;
  puedeCompras: boolean;
  puedeClientes: boolean;
  puedeProveedores: boolean;
  puedeProductos: boolean;
  puedeInventario: boolean;
  grupoAbierto: string | null;
  onAbrirGrupo: (titulo: string) => void;
}

const trazo = "w-4 h-4 shrink-0";

// Ícono por pestaña, vía lucide-react. Un componente por clave en vez de
// nodos ya renderizados, para poder fijarle stroke/tamaño una sola vez acá.
const iconosPorPestana: Record<Pestana, LucideIcon> = {
  dashboard: LayoutGrid,
  venta: ShoppingCart,
  productos: Package,
  clientes: Users,
  facturas: FileText,
  notasVenta: FileCheck2,
  notasCredito: FileMinus2,
  guiasRemision: Truck,
  proformas: FileClock,
  caja: Wallet,
  compras: ShoppingBag,
  devolucionesCompra: Undo2,
  seriesProductos: Barcode,
  egresosBodega: PackageOpen,
  metraje: Ruler,
  proveedores: Warehouse,
  categorias: LayoutGrid,
  traslados: ArrowLeftRight,
  reportes: BarChart3,
  reporteadorPrincipal: Table2,
  usuarios: UserCog,
  tiposPrecio: Tags,
  cuentasBancarias: Landmark,
  bancos: Building2,
  auditoria: History,
  contabilidad: Calculator,
  ats: FileSpreadsheet,
  empleados: IdCard,
  nomina: Banknote,
  vehiculos: Car,
  reporteCombustible: Fuel,
  ajustes: Settings,
  visitas: MapPin,
  historialVisitas: CalendarClock,
  mikrotik: Router,
  planesInternet: Wifi,
  promociones: BadgePercent,
  nodos: Network,
  facturacionInternet: Receipt,
  olts: Server,
  redFisica: Cable,
  mapaRed: MapPinned,
  ubicacionTecnicos: LocateFixed,
  centroControl: Siren,
  tickets: Headset,
  conciliacion: BadgeDollarSign,
  // No aparece en el menú a propósito — el acceso vive en el encabezado
  // junto a "Cambiar contraseña" (ver App.tsx), pero el ícono igual se
  // define acá para que este Record siga siendo exhaustivo sobre Pestana.
  acercaDe: Info,
};

function Icono({ pestana }: { pestana: Pestana }) {
  const IconoSvg = iconosPorPestana[pestana];
  return <IconoSvg strokeWidth={1.75} className={trazo} />;
}

const iconos: Record<Pestana, ReactNode> = Object.fromEntries(
  (Object.keys(iconosPorPestana) as Pestana[]).map((p) => [p, <Icono key={p} pestana={p} />])
) as Record<Pestana, ReactNode>;

function IconoGrupo({ Svg }: { Svg: LucideIcon }) {
  return <Svg strokeWidth={1.75} className={trazo} />;
}

export function MenuSuperior({
  pestanaActiva,
  onSeleccionar,
  esAdmin,
  puedeNotasCredito,
  puedeReportes,
  puedeAuditoria,
  puedeConfiguracion,
  puedeTraslados,
  puedeCaja,
  puedeContabilidad,
  puedeDevolucionesCompra,
  puedeGuiasRemision,
  puedeNomina,
  puedeVehiculos,
  mostrarVisitas,
  puedeVisitas,
  puedeMikrotik,
  puedeOlt,
  puedeRedFisica,
  puedeMapaRed,
  puedeUbicacionTecnicos,
  puedeCentroControl,
  puedeTickets,
  puedeVentas,
  puedeCompras,
  puedeClientes,
  puedeProveedores,
  puedeProductos,
  puedeInventario,
  grupoAbierto,
  onAbrirGrupo,
}: Props) {
  // Catálogo: cada ítem depende de su propio permiso — un técnico con solo
  // "visitas técnicas (ver)" no debe terminar viendo Productos/Clientes/
  // Proveedores/Categorías igual.
  const itemsCatalogo: Item[] = [
    ...(puedeProductos ? ([{ id: "productos", etiqueta: "Productos", icono: iconos.productos }] as Item[]) : []),
    ...(puedeClientes ? ([{ id: "clientes", etiqueta: "Clientes", icono: iconos.clientes }] as Item[]) : []),
    ...(puedeProveedores ? ([{ id: "proveedores", etiqueta: "Proveedores", icono: iconos.proveedores }] as Item[]) : []),
    ...(puedeProductos ? ([{ id: "categorias", etiqueta: "Categorías", icono: iconos.categorias }] as Item[]) : []),
    ...(puedeTraslados ? ([{ id: "traslados", etiqueta: "Traslados", icono: iconos.traslados }] as Item[]) : []),
    ...(esAdmin ? ([{ id: "tiposPrecio", etiqueta: "Precios de Venta", icono: iconos.tiposPrecio }] as Item[]) : []),
    // Mismo permiso "inventario" que ya gatea los ajustes manuales de stock
    // dentro de Productos (ver ProductosPage.tsx) — asignar un rollo a un
    // técnico también sale de bodega como una salida real.
    ...(puedeInventario ? ([{ id: "metraje", etiqueta: "Metraje de Cable", icono: iconos.metraje }] as Item[]) : []),
    // Mismo permiso "productos" que ya gatea el resto del control de
    // números de serie (ver routes/egresosBodega.ts) — despachar equipos
    // puntuales a un técnico es una acción sobre ESE catálogo.
    ...(puedeProductos ? ([{ id: "egresosBodega", etiqueta: "Egresos de Bodega", icono: iconos.egresosBodega }] as Item[]) : []),
  ];

  const itemsContabilidad: Item[] = [
    ...(esAdmin ? ([{ id: "cuentasBancarias", etiqueta: "Cuentas Bancarias", icono: iconos.cuentasBancarias }] as Item[]) : []),
    ...(esAdmin ? ([{ id: "bancos", etiqueta: "Bancos", icono: iconos.bancos }] as Item[]) : []),
    ...(puedeContabilidad ? ([{ id: "contabilidad", etiqueta: "Contabilidad", icono: iconos.contabilidad }] as Item[]) : []),
    ...(puedeContabilidad ? ([{ id: "ats", etiqueta: "ATS", icono: iconos.ats }] as Item[]) : []),
  ];

  const itemsPersonalTecnico: Item[] = [
    ...(puedeNomina ? ([{ id: "empleados", etiqueta: "Empleados", icono: iconos.empleados }] as Item[]) : []),
    ...(puedeNomina ? ([{ id: "nomina", etiqueta: "Nómina", icono: iconos.nomina }] as Item[]) : []),
    // Permiso propio "vehiculos", separado de "nomina" — la flota de la
    // empresa no siempre la administra quien lleva nómina.
    ...(puedeVehiculos ? ([{ id: "vehiculos", etiqueta: "Vehículos", icono: iconos.vehiculos }] as Item[]) : []),
    // Mismo permiso que "Vehículos" (no uno nuevo): es una vista distinta
    // de los mismos datos (cargas de combustible), no una función aparte.
    ...(puedeVehiculos
      ? ([{ id: "reporteCombustible", etiqueta: "Reporte de Combustible", icono: iconos.reporteCombustible }] as Item[])
      : []),
  ];

  // "Visitas Técnicas" e "Historial de Visitas" — ver Red / ISP más abajo.
  const itemsVisitas: Item[] = [
    // A diferencia del resto de este grupo, "mostrarVisitas" NO depende solo
    // de un permiso — un técnico de campo sin ningún permiso administrativo
    // también necesita verla para acceder a "Mi ruta de hoy" (ver App.tsx).
    ...(mostrarVisitas ? ([{ id: "visitas", etiqueta: "Visitas Técnicas", icono: iconos.visitas }] as Item[]) : []),
    // Reporte/consulta, no algo que un técnico de campo necesite — a
    // diferencia de "visitas" arriba, este va solo con el permiso real, no
    // con tener empleadoId vinculado.
    ...(puedeVisitas ? ([{ id: "historialVisitas", etiqueta: "Historial de Visitas", icono: iconos.historialVisitas }] as Item[]) : []),
  ];

  // Todo lo del servicio de internet del cliente: control del Mikrotik (solo
  // con permiso) y las visitas técnicas de instalación/mantenimiento (con
  // su propia regla de visibilidad, ver itemsVisitas arriba).
  const itemsRedIsp: Item[] = [
    // Primero en el grupo a propósito: es la vista de "panorama general"
    // pensada para quedar fija en una pantalla de la sala de soporte técnico.
    ...(puedeMapaRed ? ([{ id: "mapaRed", etiqueta: "Mapa de Red", icono: iconos.mapaRed }] as Item[]) : []),
    // Todo lo que necesita atención (alertas de red, control de técnicos,
    // indicadores del negocio) y la bandeja de reclamos de clientes —
    // permisos propios, ver utils/permisos.ts.
    ...(puedeCentroControl ? ([{ id: "centroControl", etiqueta: "Centro de Control", icono: iconos.centroControl }] as Item[]) : []),
    ...(puedeTickets ? ([{ id: "tickets", etiqueta: "Tickets de Soporte", icono: iconos.tickets }] as Item[]) : []),
    // Ubicación en vivo del celular de cada técnico — permiso propio
    // "ubicacion_tecnicos", separado de "mapa_red" (uno es sobre la red del
    // ISP, el otro sobre el personal en campo).
    ...(puedeUbicacionTecnicos
      ? ([{ id: "ubicacionTecnicos", etiqueta: "Localización de Técnicos", icono: iconos.ubicacionTecnicos }] as Item[])
      : []),
    ...itemsVisitas,
    ...(puedeMikrotik
      ? ([
          { id: "nodos", etiqueta: "Nodos de Red", icono: iconos.nodos },
          { id: "mikrotik", etiqueta: "Control Mikrotik", icono: iconos.mikrotik },
          { id: "planesInternet", etiqueta: "Planes de Internet", icono: iconos.planesInternet },
          { id: "promociones", etiqueta: "Promociones", icono: iconos.promociones },
          // Pantalla SEPARADA de "Facturas" a propósito (ver
          // FacturacionInternetPage.tsx): factura solo el plan de internet
          // del cliente, nunca se mezcla con la venta de equipos/servicios
          // varios que sigue en Facturas.
          { id: "facturacionInternet", etiqueta: "Facturación de Internet", icono: iconos.facturacionInternet },
          { id: "conciliacion", etiqueta: "Conciliación Bancaria", icono: iconos.conciliacion },
        ] as Item[])
      : []),
    // Permiso propio "olt", separado de "mikrotik" (equipo y responsable
    // suelen ser distintos, ver utils/permisos.ts).
    ...(puedeOlt ? ([{ id: "olts", etiqueta: "OLT (Huawei)", icono: iconos.olts }] as Item[]) : []),
    // Permiso propio "red_fisica" — trazado de fibra (reemplaza el uso de
    // Google Earth para este dato), separado de "mikrotik"/"olt".
    ...(puedeRedFisica ? ([{ id: "redFisica", etiqueta: "Red Física", icono: iconos.redFisica }] as Item[]) : []),
    // "Switches TP-Link" se sacó del menú a propósito — ver la nota en
    // backend/src/index.ts.
  ];

  const itemsReportes: Item[] = [
    ...(puedeReportes ? ([{ id: "reportes", etiqueta: "Reportes", icono: iconos.reportes }] as Item[]) : []),
    ...(puedeReportes
      ? ([{ id: "reporteadorPrincipal", etiqueta: "Reporteador Principal", icono: iconos.reporteadorPrincipal }] as Item[])
      : []),
  ];

  // "Usuarios" se queda siempre admin-only (gestionar permisos de otros no es
  // en sí mismo un permiso configurable — ver backend/src/index.ts).
  const itemsAdministracion: Item[] = [
    ...(esAdmin ? ([{ id: "usuarios", etiqueta: "Usuarios", icono: iconos.usuarios }] as Item[]) : []),
    ...(puedeAuditoria ? ([{ id: "auditoria", etiqueta: "Auditoría", icono: iconos.auditoria }] as Item[]) : []),
    ...(puedeConfiguracion ? ([{ id: "ajustes", etiqueta: "Ajustes", icono: iconos.ajustes }] as Item[]) : []),
  ];

  const itemsComprobantes: Item[] = [
    ...(puedeVentas ? ([{ id: "venta", etiqueta: "Punto de Venta", icono: iconos.venta }] as Item[]) : []),
    ...(puedeCaja ? ([{ id: "caja", etiqueta: "Caja", icono: iconos.caja }] as Item[]) : []),
    ...(puedeVentas ? ([{ id: "proformas", etiqueta: "Proformas", icono: iconos.proformas }] as Item[]) : []),
    ...(puedeVentas ? ([{ id: "facturas", etiqueta: "Facturas", icono: iconos.facturas }] as Item[]) : []),
    ...(puedeVentas ? ([{ id: "notasVenta", etiqueta: "Notas de Venta", icono: iconos.notasVenta }] as Item[]) : []),
    ...(puedeNotasCredito ? ([{ id: "notasCredito", etiqueta: "Notas de Crédito", icono: iconos.notasCredito }] as Item[]) : []),
    ...(puedeGuiasRemision ? ([{ id: "guiasRemision", etiqueta: "Guías de Remisión", icono: iconos.guiasRemision }] as Item[]) : []),
  ];

  const itemsCompras: Item[] = [
    ...(puedeCompras ? ([{ id: "compras", etiqueta: "Compras", icono: iconos.compras }] as Item[]) : []),
    ...(puedeDevolucionesCompra
      ? ([{ id: "devolucionesCompra", etiqueta: "Devolución", icono: iconos.devolucionesCompra }] as Item[])
      : []),
    ...(puedeCompras ? ([{ id: "seriesProductos", etiqueta: "Números de Serie", icono: iconos.seriesProductos }] as Item[]) : []),
  ];

  // El Dashboard NO es un ítem de este menú — es la pantalla principal
  // (arranca ahí, ver App.tsx) y se vuelve a ella haciendo clic en el
  // nombre de la app en el encabezado, no con un botón dedicado acá.
  const grupos: Grupo[] = [
    // Si ningún ítem del grupo es visible para este usuario, el grupo entero
    // se omite — así nunca aparece una pestaña de grupo sin nada debajo.
    ...(itemsComprobantes.length > 0 ? ([{ titulo: "Comprobantes", icono: <IconoGrupo Svg={FileText} />, items: itemsComprobantes }] as Grupo[]) : []),
    ...(itemsCompras.length > 0 ? ([{ titulo: "Compras", icono: <IconoGrupo Svg={ShoppingBag} />, items: itemsCompras }] as Grupo[]) : []),
    ...(itemsCatalogo.length > 0 ? ([{ titulo: "Catálogo", icono: <IconoGrupo Svg={LayoutGrid} />, items: itemsCatalogo }] as Grupo[]) : []),
    ...(itemsContabilidad.length > 0 ? ([{ titulo: "Contabilidad", icono: <IconoGrupo Svg={Calculator} />, items: itemsContabilidad }] as Grupo[]) : []),
    ...(itemsPersonalTecnico.length > 0 ? ([{ titulo: "Personal Técnico", icono: <IconoGrupo Svg={IdCard} />, items: itemsPersonalTecnico }] as Grupo[]) : []),
    ...(itemsRedIsp.length > 0 ? ([{ titulo: "Red / ISP", icono: <IconoGrupo Svg={Network} />, items: itemsRedIsp }] as Grupo[]) : []),
    ...(itemsReportes.length > 0 ? ([{ titulo: "Reportes", icono: <IconoGrupo Svg={BarChart3} />, items: itemsReportes }] as Grupo[]) : []),
    ...(itemsAdministracion.length > 0 ? ([{ titulo: "Administración", icono: <IconoGrupo Svg={Settings} />, items: itemsAdministracion }] as Grupo[]) : []),
  ];

  // Comparte la misma queryKey que DashboardPage: React Query deduplica y
  // cachea la petición, así que no se pide dos veces el mismo resumen.
  const { data } = useQuery({
    queryKey: ["dashboard-resumen"],
    queryFn: async () => (await api.get<DashboardResumen>("/dashboard/resumen")).data,
    staleTime: 60_000,
  });

  const grupoActivo = grupos.find((g) => g.titulo === grupoAbierto) ?? null;

  return (
    <nav className="bg-white dark:bg-gray-900 border-b border-stone-200 dark:border-gray-800 shrink-0">
      <div className="flex items-center justify-between pr-3">
        <div className="flex overflow-x-auto">
          {grupos.map((grupo) => (
            <button
              key={grupo.titulo}
              onClick={() => onAbrirGrupo(grupo.titulo)}
              className={`flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 shrink-0 ${
                grupo.titulo === grupoAbierto
                  ? "border-brand-600 text-brand-700 dark:text-brand-300"
                  : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-stone-50 dark:hover:bg-gray-800/60"
              }`}
            >
              {grupo.icono}
              {grupo.titulo}
            </button>
          ))}
        </div>
        <div className="hidden md:flex items-center gap-4 pl-3 shrink-0 font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 whitespace-nowrap">
          <span>
            Ambiente SRI · <span className="text-gray-700 dark:text-gray-200">{data?.ambiente ?? "..."}</span>
          </span>
          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
            En línea
          </span>
        </div>
      </div>

      {/* Segundo nivel: los ítems del grupo activo, siempre visible debajo
          del primero — no es un menú desplegable transitorio, así el
          usuario siempre ve dónde está parado dentro del grupo. */}
      {grupoActivo && (
        <div className="bg-stone-50 dark:bg-gray-950/40 border-t border-stone-200 dark:border-gray-800">
          <div className="flex overflow-x-auto px-2">
            {grupoActivo.items.map((item) => (
              <button
                key={item.id}
                onClick={() => onSeleccionar(item.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs whitespace-nowrap border-b-2 -mb-px shrink-0 ${
                  pestanaActiva === item.id
                    ? "border-brand-600 text-brand-700 dark:text-brand-300 font-semibold"
                    : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                }`}
              >
                {item.icono}
                {item.etiqueta}
              </button>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}

// Encuentra a qué grupo pertenece una pestaña — usado por App.tsx para
// decidir qué grupo abrir de entrada (o al navegar por código, como el
// salto de Facturas a Notas de Crédito) sin duplicar acá el árbol de
// permisos completo.
export function grupoDePestana(pestana: Pestana): string | null {
  const mapa: Record<string, string> = {
    venta: "Comprobantes", caja: "Comprobantes", proformas: "Comprobantes", facturas: "Comprobantes",
    notasVenta: "Comprobantes", notasCredito: "Comprobantes", guiasRemision: "Comprobantes",
    compras: "Compras", devolucionesCompra: "Compras", seriesProductos: "Compras",
    productos: "Catálogo", clientes: "Catálogo", proveedores: "Catálogo", categorias: "Catálogo",
    traslados: "Catálogo", tiposPrecio: "Catálogo", metraje: "Catálogo", egresosBodega: "Catálogo",
    cuentasBancarias: "Contabilidad", bancos: "Contabilidad", contabilidad: "Contabilidad", ats: "Contabilidad",
    empleados: "Personal Técnico", nomina: "Personal Técnico", vehiculos: "Personal Técnico",
    reporteCombustible: "Personal Técnico",
    mapaRed: "Red / ISP", ubicacionTecnicos: "Red / ISP", centroControl: "Red / ISP", tickets: "Red / ISP", conciliacion: "Red / ISP", visitas: "Red / ISP", historialVisitas: "Red / ISP",
    nodos: "Red / ISP", mikrotik: "Red / ISP", planesInternet: "Red / ISP", promociones: "Red / ISP",
    facturacionInternet: "Red / ISP", olts: "Red / ISP", redFisica: "Red / ISP",
    reportes: "Reportes", reporteadorPrincipal: "Reportes",
    usuarios: "Administración", auditoria: "Administración", ajustes: "Administración",
  };
  return mapa[pestana] ?? null;
}
