import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
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
  Info,
  ChevronRight,
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
  | "visitas"
  | "historialVisitas"
  | "mikrotik"
  | "planesInternet"
  | "facturacionInternet"
  | "nodos"
  | "ajustes"
  | "acercaDe";

interface Item {
  id: Pestana;
  etiqueta: string;
  icono: ReactNode;
}

interface Grupo {
  titulo: string;
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
  mostrarVisitas: boolean;
  puedeVisitas: boolean;
  puedeMikrotik: boolean;
  puedeVentas: boolean;
  puedeCompras: boolean;
  puedeClientes: boolean;
  puedeProveedores: boolean;
  puedeProductos: boolean;
  abierto: boolean;
}

const trazo = "w-4 h-4 shrink-0";

// Ícono por pestaña, vía lucide-react (antes: 36 SVG dibujados a mano acá
// mismo). Un componente por clave en vez de nodos ya renderizados, para
// poder fijarle stroke/tamaño una sola vez abajo en <Icono>.
const iconosPorPestana: Record<Pestana, LucideIcon> = {
  dashboard: LayoutDashboard,
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
  ajustes: Settings,
  visitas: MapPin,
  historialVisitas: CalendarClock,
  mikrotik: Router,
  planesInternet: Wifi,
  nodos: Network,
  facturacionInternet: Receipt,
  // No aparece en el menú lateral a propósito — el acceso vive en el
  // encabezado junto a "Cambiar contraseña" (ver App.tsx), pero el ícono
  // igual se define acá para que este Record siga siendo exhaustivo sobre
  // Pestana (si algún día se agrega al menú, ya está listo).
  acercaDe: Info,
};

function Icono({ pestana }: { pestana: Pestana }) {
  const IconoSvg = iconosPorPestana[pestana];
  return <IconoSvg strokeWidth={1.75} className={trazo} />;
}

const iconos: Record<Pestana, ReactNode> = Object.fromEntries(
  (Object.keys(iconosPorPestana) as Pestana[]).map((p) => [p, <Icono key={p} pestana={p} />])
) as Record<Pestana, ReactNode>;

export function Sidebar({
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
  mostrarVisitas,
  puedeVisitas,
  puedeMikrotik,
  puedeVentas,
  puedeCompras,
  puedeClientes,
  puedeProveedores,
  puedeProductos,
  abierto,
}: Props) {
  // Catálogo: cada ítem ahora depende de su propio permiso (antes los
  // primeros 4 estaban siempre visibles para cualquier usuario autenticado,
  // sin importar sus permisos — un técnico con solo "visitas técnicas (ver)"
  // terminaba viendo Productos/Clientes/Proveedores/Categorías igual).
  const itemsCatalogo: Item[] = [
    ...(puedeProductos ? ([{ id: "productos", etiqueta: "Productos", icono: iconos.productos }] as Item[]) : []),
    ...(puedeClientes ? ([{ id: "clientes", etiqueta: "Clientes", icono: iconos.clientes }] as Item[]) : []),
    ...(puedeProveedores ? ([{ id: "proveedores", etiqueta: "Proveedores", icono: iconos.proveedores }] as Item[]) : []),
    ...(puedeProductos ? ([{ id: "categorias", etiqueta: "Categorías", icono: iconos.categorias }] as Item[]) : []),
    ...(puedeTraslados ? ([{ id: "traslados", etiqueta: "Traslados", icono: iconos.traslados }] as Item[]) : []),
    ...(esAdmin ? ([{ id: "tiposPrecio", etiqueta: "Precios de Venta", icono: iconos.tiposPrecio }] as Item[]) : []),
  ];

  // Grupo nuevo (antes ambos vivían sueltos en Administración).
  const itemsContabilidad: Item[] = [
    ...(esAdmin ? ([{ id: "cuentasBancarias", etiqueta: "Cuentas Bancarias", icono: iconos.cuentasBancarias }] as Item[]) : []),
    ...(esAdmin ? ([{ id: "bancos", etiqueta: "Bancos", icono: iconos.bancos }] as Item[]) : []),
    ...(puedeContabilidad ? ([{ id: "contabilidad", etiqueta: "Contabilidad", icono: iconos.contabilidad }] as Item[]) : []),
    ...(puedeContabilidad ? ([{ id: "ats", etiqueta: "ATS", icono: iconos.ats }] as Item[]) : []),
  ];

  // Grupo nuevo (antes vivían sueltos en Administración). "Visitas Técnicas"
  // e "Historial de Visitas" viven en "Red / ISP" en vez de acá — son sobre
  // el servicio de internet del cliente, no sobre gestión de personal.
  const itemsPersonalTecnico: Item[] = [
    ...(puedeNomina ? ([{ id: "empleados", etiqueta: "Empleados", icono: iconos.empleados }] as Item[]) : []),
    ...(puedeNomina ? ([{ id: "nomina", etiqueta: "Nómina", icono: iconos.nomina }] as Item[]) : []),
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
  // su propia regla de visibilidad, ver itemsVisitas arriba) — antes
  // "Visitas Técnicas" vivía en "Personal Técnico", pero es sobre atender al
  // cliente de internet, no sobre gestión de personal.
  const itemsRedIsp: Item[] = [
    ...itemsVisitas,
    ...(puedeMikrotik
      ? ([
          { id: "nodos", etiqueta: "Nodos de Red", icono: iconos.nodos },
          { id: "mikrotik", etiqueta: "Control Mikrotik", icono: iconos.mikrotik },
          { id: "planesInternet", etiqueta: "Planes de Internet", icono: iconos.planesInternet },
          // Pantalla SEPARADA de "Facturas" a propósito (ver
          // FacturacionInternetPage.tsx): factura solo el plan de internet
          // del cliente, nunca se mezcla con la venta de equipos/servicios
          // varios que sigue en Facturas.
          { id: "facturacionInternet", etiqueta: "Facturación de Internet", icono: iconos.facturacionInternet },
        ] as Item[])
      : []),
  ];

  // Grupo nuevo (antes vivían sueltos en Administración).
  const itemsReportes: Item[] = [
    ...(puedeReportes ? ([{ id: "reportes", etiqueta: "Reportes", icono: iconos.reportes }] as Item[]) : []),
    ...(puedeReportes
      ? ([{ id: "reporteadorPrincipal", etiqueta: "Reporteador Principal", icono: iconos.reporteadorPrincipal }] as Item[])
      : []),
  ];

  // "Usuarios" se queda siempre admin-only (gestionar permisos de otros no es
  // en sí mismo un permiso configurable — ver backend/src/index.ts). Ahora
  // este grupo queda más chico: los demás ítems se movieron a sus propios
  // grupos (Contabilidad, Personal Técnico, Reportes) arriba.
  const itemsAdministracion: Item[] = [
    ...(esAdmin ? ([{ id: "usuarios", etiqueta: "Usuarios", icono: iconos.usuarios }] as Item[]) : []),
    ...(puedeAuditoria ? ([{ id: "auditoria", etiqueta: "Auditoría", icono: iconos.auditoria }] as Item[]) : []),
    ...(puedeConfiguracion ? ([{ id: "ajustes", etiqueta: "Ajustes", icono: iconos.ajustes }] as Item[]) : []),
  ];

  // Antes "Punto de Venta"/"Proformas"/"Facturas"/"Notas de Venta" estaban
  // siempre visibles para cualquier autenticado — ahora dependen de
  // "ventas", igual que ya dependían "Caja"/"Notas de Crédito"/"Guías de
  // Remisión" de los suyos.
  const itemsComprobantes: Item[] = [
    ...(puedeVentas ? ([{ id: "venta", etiqueta: "Punto de Venta", icono: iconos.venta }] as Item[]) : []),
    ...(puedeCaja ? ([{ id: "caja", etiqueta: "Caja", icono: iconos.caja }] as Item[]) : []),
    ...(puedeVentas ? ([{ id: "proformas", etiqueta: "Proformas", icono: iconos.proformas }] as Item[]) : []),
    ...(puedeVentas ? ([{ id: "facturas", etiqueta: "Facturas", icono: iconos.facturas }] as Item[]) : []),
    ...(puedeVentas ? ([{ id: "notasVenta", etiqueta: "Notas de Venta", icono: iconos.notasVenta }] as Item[]) : []),
    ...(puedeNotasCredito ? ([{ id: "notasCredito", etiqueta: "Notas de Crédito", icono: iconos.notasCredito }] as Item[]) : []),
    ...(puedeGuiasRemision ? ([{ id: "guiasRemision", etiqueta: "Guías de Remisión", icono: iconos.guiasRemision }] as Item[]) : []),
  ];

  // Antes "Compras" estaba siempre visible — ahora depende de "compras".
  const itemsCompras: Item[] = [
    ...(puedeCompras ? ([{ id: "compras", etiqueta: "Compras", icono: iconos.compras }] as Item[]) : []),
    ...(puedeDevolucionesCompra
      ? ([{ id: "devolucionesCompra", etiqueta: "Devolución", icono: iconos.devolucionesCompra }] as Item[])
      : []),
    ...(puedeCompras ? ([{ id: "seriesProductos", etiqueta: "Números de Serie", icono: iconos.seriesProductos }] as Item[]) : []),
  ];

  // El Dashboard ya NO es un ítem de este menú — es la pantalla principal
  // (arranca ahí, ver App.tsx) y se vuelve a ella haciendo clic en el
  // nombre de la app en el encabezado, no con un botón dedicado acá.
  const grupos: Grupo[] = [
    // Si ningún ítem del grupo es visible para este usuario, el grupo entero
    // se omite — así nunca aparece un título sin nada debajo.
    ...(itemsComprobantes.length > 0 ? ([{ titulo: "Comprobantes", items: itemsComprobantes }] as Grupo[]) : []),
    ...(itemsCompras.length > 0 ? ([{ titulo: "Compras", items: itemsCompras }] as Grupo[]) : []),
    ...(itemsCatalogo.length > 0 ? ([{ titulo: "Catálogo", items: itemsCatalogo }] as Grupo[]) : []),
    ...(itemsContabilidad.length > 0 ? ([{ titulo: "Contabilidad", items: itemsContabilidad }] as Grupo[]) : []),
    ...(itemsPersonalTecnico.length > 0 ? ([{ titulo: "Personal Técnico", items: itemsPersonalTecnico }] as Grupo[]) : []),
    ...(itemsRedIsp.length > 0 ? ([{ titulo: "Red / ISP", items: itemsRedIsp }] as Grupo[]) : []),
    ...(itemsReportes.length > 0 ? ([{ titulo: "Reportes", items: itemsReportes }] as Grupo[]) : []),
    ...(itemsAdministracion.length > 0 ? ([{ titulo: "Administración", items: itemsAdministracion }] as Grupo[]) : []),
  ];

  // Comparte la misma queryKey que DashboardPage: React Query deduplica y
  // cachea la petición, así que no se pide dos veces el mismo resumen.
  const { data } = useQuery({
    queryKey: ["dashboard-resumen"],
    queryFn: async () => (await api.get<DashboardResumen>("/dashboard/resumen")).data,
    staleTime: 60_000,
  });

  // Acordeón de UN SOLO grupo abierto a la vez — antes cada grupo se
  // colapsaba/expandía por separado y, con ya 8 secciones, dejarlas todas
  // abiertas hacía crecer el menú sin límite (había que scrollear para
  // llegar a "Administración"). Al abrir un grupo, cierra el que estuviera
  // abierto — nunca hay más de una sección desplegada, así el menú siempre
  // cabe en una altura razonable, sin importar cuántas secciones se agreguen
  // a futuro. Arranca abierto en el grupo de la pestaña activa, para no
  // esconder de entrada dónde está parado el usuario.
  const [grupoAbierto, setGrupoAbierto] = useState<string | null>(
    () => grupos.find((g) => g.items.some((item) => item.id === pestanaActiva))?.titulo ?? grupos[0]?.titulo ?? null
  );

  function alternarGrupo(titulo: string) {
    setGrupoAbierto((actual) => (actual === titulo ? null : titulo));
  }

  return (
    <aside
      className={`bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 shrink-0 overflow-y-auto transition-all duration-200 ${
        abierto ? "w-56" : "w-0 overflow-hidden"
      }`}
    >
      {/* Franja superior de marca — el mismo acento que PageHeader.tsx usa
          en cada pantalla, reforzando la identidad visual en el único lugar
          que se ve siempre, sin importar la pestaña activa. */}
      <div className="h-1 w-56 bg-brand-600" />
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 w-56">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
          Ambiente: <span className="text-gray-700 dark:text-gray-200">{data?.ambiente ?? "..."}</span>
        </p>
        <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
          En línea
        </p>
      </div>
      <nav className="py-3 w-56">
        {grupos.map((grupo) => {
          const grupoColapsado = grupo.titulo !== grupoAbierto;
          return (
            <div key={grupo.titulo} className="mb-1">
              <button
                onClick={() => alternarGrupo(grupo.titulo)}
                className="w-full flex items-center justify-between px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {grupo.titulo}
                <ChevronRight strokeWidth={2} className={`w-3.5 h-3.5 transition-transform ${!grupoColapsado ? "rotate-90" : ""}`} />
              </button>
              {!grupoColapsado && (
                <ul>
                  {grupo.items.map((item) => (
                    <li key={item.id}>
                      <button
                        onClick={() => onSeleccionar(item.id)}
                        className={`w-full flex items-center gap-3 px-4 py-2 text-sm font-medium border-l-2 transition-colors ${
                          pestanaActiva === item.id
                            ? "border-brand-600 dark:border-brand-400 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300"
                            : "border-transparent text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                        }`}
                      >
                        {item.icono}
                        {item.etiqueta}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
