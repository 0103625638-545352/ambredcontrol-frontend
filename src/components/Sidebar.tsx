import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
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
  | "traslados"
  | "reportes"
  | "reporteadorPrincipal"
  | "usuarios"
  | "auditoria"
  | "contabilidad"
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

const iconos: Record<Pestana, ReactNode> = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={trazo}>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  ),
  venta: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={trazo}>
      <circle cx="9" cy="21" r="1" />
      <circle cx="19" cy="21" r="1" />
      <path d="M1 1h3l2.4 12.4a2 2 0 0 0 2 1.6h9.2a2 2 0 0 0 2-1.6L21 6H6" />
    </svg>
  ),
  productos: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={trazo}>
      <path d="M21 8l-9-5-9 5 9 5 9-5Z" />
      <path d="M3 8v8l9 5 9-5V8M12 13v8" />
    </svg>
  ),
  clientes: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={trazo}>
      <circle cx="9" cy="7" r="4" />
      <path d="M2 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2" />
      <path d="M17 3.5a4 4 0 0 1 0 7.5M22 21v-2a5 5 0 0 0-3.5-4.8" />
    </svg>
  ),
  facturas: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={trazo}>
      <path d="M6 2l1.5 1.5L9 2l1.5 1.5L12 2l1.5 1.5L15 2l1.5 1.5L18 2v20l-1.5-1.5L15 22l-1.5-1.5L12 22l-1.5-1.5L9 22l-1.5-1.5L6 22V2Z" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </svg>
  ),
  notasVenta: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={trazo}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6M9 15l2 2 4-4" />
    </svg>
  ),
  notasCredito: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={trazo}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6M9 13h6M9 17h4" />
    </svg>
  ),
  guiasRemision: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={trazo}>
      <rect x="1" y="7" width="15" height="11" rx="1" />
      <path d="M16 10h3l3 3v5h-6" />
      <circle cx="6" cy="19.5" r="1.5" />
      <circle cx="18" cy="19.5" r="1.5" />
    </svg>
  ),
  proformas: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={trazo}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" strokeDasharray="3 2" />
      <path d="M14 2v6h6M9 13h6M9 17h4" />
    </svg>
  ),
  caja: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={trazo}>
      <rect x="2" y="6" width="20" height="14" rx="2" />
      <circle cx="12" cy="13" r="3" />
      <path d="M6 6V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v2" />
    </svg>
  ),
  compras: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={trazo}>
      <path d="M3 6h18l-1.68 10.1A2 2 0 0 1 17.34 18H6.66a2 2 0 0 1-1.98-1.9L3 6Z" />
      <path d="M3 6l-1-3M8 10v4M12 10v4M16 10v4" />
    </svg>
  ),
  devolucionesCompra: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={trazo}>
      <path d="M3 6h18l-1.68 10.1A2 2 0 0 1 17.34 18H6.66a2 2 0 0 1-1.98-1.9L3 6Z" />
      <path d="M9 10l-3 3 3 3M6 13h6" />
    </svg>
  ),
  seriesProductos: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={trazo}>
      <path d="M3 7h1.5v10H3zM6 7h1v10H6zM9 7h2v10H9zM13 7h1v10h-1zM16 7h2v10h-2zM20 7h1v10h-1z" fill="currentColor" stroke="none" />
    </svg>
  ),
  proveedores: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={trazo}>
      <rect x="2" y="7" width="20" height="13" rx="1" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M2 12h20" />
    </svg>
  ),
  categorias: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={trazo}>
      <rect x="3" y="3" width="8" height="8" rx="1" />
      <rect x="13" y="3" width="8" height="8" rx="1" />
      <rect x="3" y="13" width="8" height="8" rx="1" />
      <rect x="13" y="13" width="8" height="8" rx="1" />
    </svg>
  ),
  traslados: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={trazo}>
      <path d="M7 16V4M7 4l-3 3M7 4l3 3" />
      <path d="M17 8v12M17 20l3-3M17 20l-3-3" />
    </svg>
  ),
  reportes: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={trazo}>
      <path d="M3 3v18h18" />
      <path d="M7 15l4-4 3 3 5-6" />
    </svg>
  ),
  reporteadorPrincipal: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={trazo}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 21V9" />
    </svg>
  ),
  usuarios: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={trazo}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
    </svg>
  ),
  tiposPrecio: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={trazo}>
      <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  cuentasBancarias: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={trazo}>
      <path d="M3 10l9-6 9 6" />
      <path d="M4 10v9h16v-9" />
      <path d="M9 21v-6h6v6" />
    </svg>
  ),
  auditoria: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={trazo}>
      <path d="M12 8v4l3 3" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  ),
  contabilidad: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={trazo}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M9 4v16" />
    </svg>
  ),
  empleados: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={trazo}>
      <circle cx="9" cy="7" r="3" />
      <circle cx="17" cy="8" r="2.5" />
      <path d="M3 21v-2a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v2M15.5 13.2A4.5 4.5 0 0 1 21 17.5V19" />
    </svg>
  ),
  nomina: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={trazo}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M8 9h8M8 13h5M7 17h3" />
      <circle cx="17" cy="16.5" r="2.5" />
      <path d="M17 15.3v1.2l0.8 0.8" />
    </svg>
  ),
  ajustes: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={trazo}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  ),
  visitas: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={trazo}>
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  ),
  historialVisitas: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={trazo}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  ),
  mikrotik: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={trazo}>
      <rect x="2" y="4" width="20" height="12" rx="2" />
      <path d="M6 20h.01M10 20h.01M14 20h.01M18 20h.01" />
      <path d="M6 9h.01M6 12h.01" />
    </svg>
  ),
  planesInternet: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={trazo}>
      <path d="M2 8.5a14 14 0 0 1 20 0" />
      <path d="M5 12a9.5 9.5 0 0 1 14 0" />
      <path d="M8.5 15.5a5 5 0 0 1 7 0" />
      <circle cx="12" cy="19" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  ),
  nodos: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={trazo}>
      <circle cx="12" cy="5" r="2.2" />
      <circle cx="5" cy="19" r="2.2" />
      <circle cx="19" cy="19" r="2.2" />
      <path d="M12 7.2V12M12 12L6.5 17M12 12L17.5 17" />
    </svg>
  ),
  facturacionInternet: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={trazo}>
      <path d="M6 2l1.5 1.5L9 2l1.5 1.5L12 2l1.5 1.5L15 2l1.5 1.5L18 2v20l-1.5-1.5L15 22l-1.5-1.5L12 22l-1.5-1.5L9 22l-1.5-1.5L6 22V2Z" />
      <path d="M8.5 10.5a5 5 0 0 1 7 0M10.5 12.8a2.2 2.2 0 0 1 3 0" />
      <circle cx="12" cy="15.3" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  ),
  // No aparece en el menú lateral a propósito — el acceso vive en el
  // encabezado junto a "Cambiar contraseña" (ver App.tsx), pero el ícono
  // igual se define acá para que este Record siga siendo exhaustivo sobre
  // Pestana (si algún día se agrega al menú, ya está listo).
  acercaDe: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={trazo}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  ),
};

// Ícono de flecha usado para expandir/colapsar cada grupo del menú.
function Chevron({ abierto }: { abierto: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`w-3.5 h-3.5 transition-transform ${abierto ? "rotate-90" : ""}`}
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

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
    ...(puedeContabilidad ? ([{ id: "contabilidad", etiqueta: "Contabilidad", icono: iconos.contabilidad }] as Item[]) : []),
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

  const grupos: Grupo[] = [
    { titulo: "Menú principal", items: [{ id: "dashboard", etiqueta: "Dashboard", icono: iconos.dashboard }] },
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
                <Chevron abierto={!grupoColapsado} />
              </button>
              {!grupoColapsado && (
                <ul>
                  {grupo.items.map((item) => (
                    <li key={item.id}>
                      <button
                        onClick={() => onSeleccionar(item.id)}
                        className={`w-full flex items-center gap-3 px-4 py-2 text-sm font-medium border-l-2 transition-colors ${
                          pestanaActiva === item.id
                            ? "border-sky-600 dark:border-sky-400 bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300"
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
