import { useState } from "react";
import type {
  Factura, FacturaConDetalle, NotaVenta, NotaVentaConDetalle, Compra, CompraConDetalle,
  NotaCredito, NotaCreditoConDetalle, Producto, Cliente, Proveedor, Categoria, Traslado,
  UsuarioAdmin, RegistroAuditoria, CajaSesion, Retencion, RetencionConDetalle,
  RetencionRecibida, RetencionRecibidaConDetalle, DevolucionCompra, DevolucionCompraConDetalle,
  PagoBancario,
} from "../api/client";
import { origenPagoTexto } from "../api/client";
import { ReporteadorTabla, type ColumnaReporte } from "../components/ReporteadorTabla";
import { DetalleDocumentoModal } from "../components/DetalleDocumentoModal";
import { DetalleFilaModal } from "../components/DetalleFilaModal";
import { HistorialClienteModal } from "../components/HistorialClienteModal";
import { HistorialProveedorModal } from "../components/HistorialProveedorModal";
import { HistorialProductoModal } from "../components/HistorialProductoModal";

type Pestana =
  | "facturas" | "notasVenta" | "notasCredito" | "compras" | "devolucionesCompra" | "productos"
  | "clientes" | "proveedores" | "categorias" | "traslados" | "caja" | "retenciones"
  | "retencionesRecibidas" | "usuarios" | "auditoria" | "cobrosBancarios";

interface Props {
  esAdmin: boolean;
  puedeNotasCredito: boolean;
  puedeAuditoria: boolean;
  puedeCaja: boolean;
  puedeRetenciones: boolean;
  puedeDevolucionesCompra: boolean;
}

// Filas con las que hoy se abre un modal de "documento" (detalle + líneas).
type DocumentoAbierto =
  | { tipo: "facturas"; id: number }
  | { tipo: "notasVenta"; id: number }
  | { tipo: "notasCredito"; id: number }
  | { tipo: "compras"; id: number }
  | { tipo: "devolucionesCompra"; id: number }
  | { tipo: "traslados"; id: number }
  | { tipo: "caja"; id: number }
  | { tipo: "retenciones"; id: number }
  | { tipo: "retencionesRecibidas"; id: number };

type HistorialAbierto =
  | { tipo: "clientes"; id: number; nombre: string }
  | { tipo: "proveedores"; id: number; nombre: string }
  | { tipo: "productos"; id: number; nombre: string };

interface FilaPlana {
  titulo: string;
  campos: { etiqueta: string; obtenerValor: (fila: any) => React.ReactNode }[];
  fila: any;
}

export function ReporteadorPrincipalPage({ esAdmin, puedeNotasCredito, puedeAuditoria, puedeCaja, puedeRetenciones, puedeDevolucionesCompra }: Props) {
  const [pestanaActiva, setPestanaActiva] = useState<Pestana>("facturas");
  const [documentoAbierto, setDocumentoAbierto] = useState<DocumentoAbierto | null>(null);
  const [historialAbierto, setHistorialAbierto] = useState<HistorialAbierto | null>(null);
  const [filaAbierta, setFilaAbierta] = useState<FilaPlana | null>(null);

  const pestanas: { id: Pestana; etiqueta: string }[] = [
    { id: "facturas", etiqueta: "Facturas" },
    { id: "notasVenta", etiqueta: "Notas de Venta" },
    ...(puedeNotasCredito ? ([{ id: "notasCredito", etiqueta: "Notas de Crédito" }] as const) : []),
    { id: "compras", etiqueta: "Compras" },
    ...(puedeDevolucionesCompra ? ([{ id: "devolucionesCompra", etiqueta: "Devoluciones a Proveedor" }] as const) : []),
    { id: "productos", etiqueta: "Productos" },
    { id: "clientes", etiqueta: "Clientes" },
    { id: "proveedores", etiqueta: "Proveedores" },
    { id: "categorias", etiqueta: "Categorías" },
    { id: "traslados", etiqueta: "Traslados" },
    { id: "cobrosBancarios", etiqueta: "Cobros Bancarios" },
    ...(puedeCaja ? ([{ id: "caja", etiqueta: "Caja" }] as const) : []),
    ...(puedeRetenciones ? ([{ id: "retenciones", etiqueta: "Retenciones" }] as const) : []),
    ...(puedeRetenciones ? ([{ id: "retencionesRecibidas", etiqueta: "Retenciones Recibidas" }] as const) : []),
    ...(esAdmin ? ([{ id: "usuarios", etiqueta: "Usuarios" }] as const) : []),
    ...(puedeAuditoria ? ([{ id: "auditoria", etiqueta: "Auditoría" }] as const) : []),
  ];

  // --- Columnas por entidad ---
  const columnasFacturas: ColumnaReporte<Factura>[] = [
    { clave: "secuencial", etiqueta: "Secuencial", obtenerValor: (f) => f.secuencial },
    { clave: "fechaEmision", etiqueta: "Fecha", formato: "fecha", obtenerValor: (f) => f.fechaEmision },
    { clave: "cliente", etiqueta: "Cliente", obtenerValor: (f) => f.cliente.razonSocial },
    { clave: "total", etiqueta: "Total", formato: "moneda", obtenerValor: (f) => f.total },
    { clave: "estado", etiqueta: "Estado", formato: "estado", obtenerValor: (f) => f.estado },
    { clave: "estadoPago", etiqueta: "Pago", formato: "estado", obtenerValor: (f) => f.estadoPago },
  ];

  const columnasNotasVenta: ColumnaReporte<NotaVenta>[] = [
    { clave: "secuencial", etiqueta: "Secuencial", obtenerValor: (n) => n.secuencial },
    { clave: "fechaEmision", etiqueta: "Fecha", formato: "fecha", obtenerValor: (n) => n.fechaEmision },
    { clave: "cliente", etiqueta: "Cliente", obtenerValor: (n) => n.cliente.razonSocial },
    { clave: "total", etiqueta: "Total", formato: "moneda", obtenerValor: (n) => n.total },
    { clave: "estado", etiqueta: "Estado", formato: "estado", obtenerValor: (n) => n.estado },
    { clave: "estadoPago", etiqueta: "Pago", formato: "estado", obtenerValor: (n) => n.estadoPago },
  ];

  const columnasNotasCredito: ColumnaReporte<NotaCredito>[] = [
    { clave: "secuencial", etiqueta: "Secuencial", obtenerValor: (n) => n.secuencial },
    { clave: "fechaEmision", etiqueta: "Fecha", formato: "fecha", obtenerValor: (n) => n.fechaEmision },
    { clave: "factura", etiqueta: "Factura corregida", obtenerValor: (n) => n.factura.secuencial },
    { clave: "cliente", etiqueta: "Cliente", obtenerValor: (n) => n.factura.cliente.razonSocial },
    { clave: "motivo", etiqueta: "Motivo", obtenerValor: (n) => n.motivo },
    { clave: "total", etiqueta: "Total", formato: "moneda", obtenerValor: (n) => n.total },
    { clave: "estado", etiqueta: "Estado", formato: "estado", obtenerValor: (n) => n.estado },
  ];

  const columnasCompras: ColumnaReporte<Compra>[] = [
    { clave: "numeroFactura", etiqueta: "Fact. proveedor", obtenerValor: (c) => c.numeroFactura },
    { clave: "fechaEmision", etiqueta: "Fecha", formato: "fecha", obtenerValor: (c) => c.fechaEmision },
    { clave: "proveedor", etiqueta: "Proveedor", obtenerValor: (c) => c.proveedor.razonSocial },
    { clave: "total", etiqueta: "Total", formato: "moneda", obtenerValor: (c) => c.total },
    { clave: "estado", etiqueta: "Estado", formato: "estado", obtenerValor: (c) => c.estado },
    { clave: "estadoPago", etiqueta: "Pago", formato: "estado", obtenerValor: (c) => c.estadoPago },
  ];

  const columnasDevolucionesCompra: ColumnaReporte<DevolucionCompra>[] = [
    { clave: "secuencial", etiqueta: "Secuencial", obtenerValor: (d) => d.secuencial },
    { clave: "fechaEmision", etiqueta: "Fecha", formato: "fecha", obtenerValor: (d) => d.fechaEmision },
    { clave: "compra", etiqueta: "Compra corregida", obtenerValor: (d) => d.compra.numeroFactura },
    { clave: "proveedor", etiqueta: "Proveedor", obtenerValor: (d) => d.compra.proveedor.razonSocial },
    { clave: "motivo", etiqueta: "Motivo", obtenerValor: (d) => d.motivo },
    { clave: "total", etiqueta: "Total", formato: "moneda", obtenerValor: (d) => d.total },
  ];

  const columnasProductos: ColumnaReporte<Producto>[] = [
    { clave: "codigo", etiqueta: "Código", obtenerValor: (p) => p.codigo },
    { clave: "nombre", etiqueta: "Nombre", obtenerValor: (p) => p.nombre },
    { clave: "categoria", etiqueta: "Categoría", obtenerValor: (p) => p.categoria?.nombre },
    { clave: "costoPromedioActual", etiqueta: "Costo", formato: "moneda", obtenerValor: (p) => p.costoPromedioActual },
    { clave: "stockActual", etiqueta: "Stock", obtenerValor: (p) => p.stockActual },
    { clave: "manejaLotes", etiqueta: "Maneja lotes", obtenerValor: (p) => (p.manejaLotes ? "Sí" : "No") },
    { clave: "createdAt", etiqueta: "Alta", formato: "fecha", obtenerValor: (p) => p.createdAt },
  ];

  const columnasClientes: ColumnaReporte<Cliente>[] = [
    { clave: "identificacion", etiqueta: "Identificación", obtenerValor: (c) => c.identificacion },
    { clave: "razonSocial", etiqueta: "Razón social", obtenerValor: (c) => c.razonSocial },
    { clave: "email", etiqueta: "Email", obtenerValor: (c) => c.email },
    { clave: "telefono", etiqueta: "Teléfono", obtenerValor: (c) => c.telefono },
    { clave: "createdAt", etiqueta: "Alta", formato: "fecha", obtenerValor: (c) => c.createdAt },
  ];

  const columnasProveedores: ColumnaReporte<Proveedor>[] = [
    { clave: "identificacion", etiqueta: "Identificación", obtenerValor: (p) => p.identificacion },
    { clave: "razonSocial", etiqueta: "Razón social", obtenerValor: (p) => p.razonSocial },
    { clave: "email", etiqueta: "Email", obtenerValor: (p) => p.email },
    { clave: "telefono", etiqueta: "Teléfono", obtenerValor: (p) => p.telefono },
    { clave: "createdAt", etiqueta: "Alta", formato: "fecha", obtenerValor: (p) => p.createdAt },
  ];

  const columnasCategorias: ColumnaReporte<Categoria>[] = [
    { clave: "nombre", etiqueta: "Nombre", obtenerValor: (c) => c.nombre },
    { clave: "activo", etiqueta: "Activa", obtenerValor: (c) => (c.activo ? "Sí" : "No") },
    { clave: "createdAt", etiqueta: "Alta", formato: "fecha", obtenerValor: (c) => c.createdAt },
  ];

  const columnasTraslados: ColumnaReporte<Traslado>[] = [
    { clave: "createdAt", etiqueta: "Fecha", formato: "fecha", obtenerValor: (t) => t.createdAt },
    { clave: "origen", etiqueta: "De", obtenerValor: (t) => t.sucursalOrigen.nombre },
    { clave: "destino", etiqueta: "A", obtenerValor: (t) => t.sucursalDestino.nombre },
    { clave: "usuario", etiqueta: "Usuario", obtenerValor: (t) => t.usuario?.nombre },
    { clave: "motivo", etiqueta: "Motivo", obtenerValor: (t) => t.motivo },
  ];

  // "Tipo" distingue dinero que entra (cobro a cliente, Factura/NotaVenta) de
  // dinero que sale (pago a proveedor, Compra) — cuál de las 3 relaciones
  // viene no-nula determina tanto el tipo como el documento/tercero a mostrar.
  function tipoPagoBancario(p: PagoBancario): "COBRO" | "PAGO" {
    return p.compra ? "PAGO" : "COBRO";
  }
  function documentoPagoBancario(p: PagoBancario): string {
    if (p.factura) return `Factura ${p.factura.secuencial}`;
    if (p.notaVenta) return `Nota de venta ${p.notaVenta.secuencial}`;
    if (p.compra) return `Compra ${p.compra.numeroFactura}`;
    return "—";
  }
  function terceroPagoBancario(p: PagoBancario): string {
    if (p.factura) return p.factura.cliente.razonSocial;
    if (p.notaVenta) return p.notaVenta.cliente.razonSocial;
    if (p.compra) return p.compra.proveedor.razonSocial;
    return "—";
  }
  // Defensivo: el backend ya excluye pagos sin cuentaBancariaId de este
  // reporte, pero un pago anterior a que existiera el catálogo de cuentas
  // (o cuya cuenta se borró de la base a mano) no debería poder tumbar la
  // pantalla si de todos modos llega sin la relación.
  function cuentaBancariaTexto(p: PagoBancario): string {
    if (!p.cuentaBancaria) return "—";
    return `${p.cuentaBancaria.nombre} — ${p.cuentaBancaria.banco} ${p.cuentaBancaria.numeroCuenta}`;
  }
  const columnasCobrosBancarios: ColumnaReporte<PagoBancario>[] = [
    { clave: "fecha", etiqueta: "Fecha", formato: "fecha", obtenerValor: (p) => p.fecha },
    { clave: "tipo", etiqueta: "Tipo", formato: "estado", obtenerValor: (p) => tipoPagoBancario(p) },
    { clave: "documento", etiqueta: "Documento", obtenerValor: (p) => documentoPagoBancario(p) },
    { clave: "tercero", etiqueta: "Cliente/Proveedor", obtenerValor: (p) => terceroPagoBancario(p) },
    { clave: "formaPago", etiqueta: "Forma de pago", obtenerValor: (p) => p.formaPago },
    { clave: "cuentaBancaria", etiqueta: "Cuenta bancaria", obtenerValor: (p) => cuentaBancariaTexto(p) },
    { clave: "referencia", etiqueta: "Referencia", obtenerValor: (p) => p.referencia },
    { clave: "origenPago", etiqueta: "Origen del pago", obtenerValor: (p) => origenPagoTexto(p) },
    { clave: "monto", etiqueta: "Monto", formato: "moneda", obtenerValor: (p) => p.monto },
  ];

  const columnasCaja: ColumnaReporte<CajaSesion>[] = [
    { clave: "abiertaEn", etiqueta: "Apertura", formato: "fecha", obtenerValor: (s) => s.abiertaEn },
    { clave: "sucursal", etiqueta: "Sucursal", obtenerValor: (s) => s.sucursal.nombre },
    { clave: "abiertaPor", etiqueta: "Abierta por", obtenerValor: (s) => s.abiertaPor.nombre },
    { clave: "estado", etiqueta: "Estado", formato: "estado", obtenerValor: (s) => s.estado },
    { clave: "montoInicial", etiqueta: "Inicial", formato: "moneda", obtenerValor: (s) => s.montoInicial },
    { clave: "montoEsperado", etiqueta: "Esperado", formato: "moneda", obtenerValor: (s) => s.montoEsperado },
    { clave: "montoContado", etiqueta: "Contado", formato: "moneda", obtenerValor: (s) => s.montoContado },
    { clave: "diferencia", etiqueta: "Diferencia", formato: "moneda", obtenerValor: (s) => s.diferencia },
  ];

  const columnasRetenciones: ColumnaReporte<Retencion>[] = [
    { clave: "secuencial", etiqueta: "Secuencial", obtenerValor: (r) => r.secuencial },
    { clave: "fechaEmision", etiqueta: "Fecha", formato: "fecha", obtenerValor: (r) => r.fechaEmision },
    { clave: "proveedor", etiqueta: "Proveedor", obtenerValor: (r) => r.compra.proveedor.razonSocial },
    { clave: "compra", etiqueta: "Fact. compra", obtenerValor: (r) => r.compra.numeroFactura },
    { clave: "totalIva", etiqueta: "IVA retenido", formato: "moneda", obtenerValor: (r) => r.totalIva },
    { clave: "totalRenta", etiqueta: "Renta retenida", formato: "moneda", obtenerValor: (r) => r.totalRenta },
    { clave: "total", etiqueta: "Total", formato: "moneda", obtenerValor: (r) => r.total },
    { clave: "estado", etiqueta: "Estado", formato: "estado", obtenerValor: (r) => r.estado },
  ];

  const columnasRetencionesRecibidas: ColumnaReporte<RetencionRecibida>[] = [
    { clave: "numeroComprobante", etiqueta: "N° comprobante", obtenerValor: (r) => r.numeroComprobante },
    { clave: "fechaEmision", etiqueta: "Fecha", formato: "fecha", obtenerValor: (r) => r.fechaEmision },
    { clave: "cliente", etiqueta: "Cliente", obtenerValor: (r) => r.factura.cliente.razonSocial },
    { clave: "factura", etiqueta: "Factura", obtenerValor: (r) => r.factura.secuencial },
    { clave: "totalIva", etiqueta: "IVA retenido", formato: "moneda", obtenerValor: (r) => r.totalIva },
    { clave: "totalRenta", etiqueta: "Renta retenida", formato: "moneda", obtenerValor: (r) => r.totalRenta },
    { clave: "total", etiqueta: "Total", formato: "moneda", obtenerValor: (r) => r.total },
  ];

  const columnasUsuarios: ColumnaReporte<UsuarioAdmin>[] = [
    { clave: "nombre", etiqueta: "Nombre", obtenerValor: (u) => u.nombre },
    { clave: "usuario", etiqueta: "Usuario", obtenerValor: (u) => u.usuario },
    { clave: "rol", etiqueta: "Rol", obtenerValor: (u) => (u.rol === "ADMIN" ? "Administrador" : "Personalizado") },
    { clave: "sucursal", etiqueta: "Sucursal", obtenerValor: (u) => u.sucursal?.nombre },
    { clave: "activo", etiqueta: "Activo", obtenerValor: (u) => (u.activo ? "Sí" : "No") },
    { clave: "createdAt", etiqueta: "Alta", formato: "fecha", obtenerValor: (u) => u.createdAt },
  ];

  const columnasAuditoria: ColumnaReporte<RegistroAuditoria>[] = [
    { clave: "fecha", etiqueta: "Fecha", formato: "fecha", obtenerValor: (r) => r.fecha },
    { clave: "usuario", etiqueta: "Usuario", obtenerValor: (r) => r.usuario?.nombre ?? r.usuario?.usuario },
    { clave: "accion", etiqueta: "Acción", obtenerValor: (r) => r.accion },
    { clave: "entidad", etiqueta: "Entidad", obtenerValor: (r) => r.entidad },
    { clave: "detalle", etiqueta: "Detalle", obtenerValor: (r) => r.detalle },
  ];

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 dark:text-gray-50 mb-1">Reporteador Principal</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Reportes filtrables por fecha, con detalle por fila y exportación a Excel.
      </p>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {pestanas.map((p) => (
          <button
            key={p.id}
            onClick={() => setPestanaActiva(p.id)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
              pestanaActiva === p.id
                ? "bg-brand-700 dark:bg-brand-700 text-white border-brand-700 dark:border-brand-700"
                : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-stone-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"
            }`}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      {pestanaActiva === "facturas" && (
        <ReporteadorTabla
          endpoint="/facturas"
          columnas={columnasFacturas}
          nombreArchivo="facturas"
          filaId={(f) => f.id}
          onVerDetalle={(f: Factura) => setDocumentoAbierto({ tipo: "facturas", id: f.id })}
          campoMonto={(f) => parseFloat(f.total)}
          campoFechaGrafico={(f) => f.fechaEmision}
        />
      )}
      {pestanaActiva === "notasVenta" && (
        <ReporteadorTabla
          endpoint="/notas-venta"
          columnas={columnasNotasVenta}
          nombreArchivo="notas-venta"
          filaId={(n) => n.id}
          onVerDetalle={(n: NotaVenta) => setDocumentoAbierto({ tipo: "notasVenta", id: n.id })}
          campoMonto={(n) => parseFloat(n.total)}
          campoFechaGrafico={(n) => n.fechaEmision}
        />
      )}
      {pestanaActiva === "notasCredito" && puedeNotasCredito && (
        <ReporteadorTabla
          endpoint="/notas-credito"
          columnas={columnasNotasCredito}
          nombreArchivo="notas-credito"
          filaId={(n) => n.id}
          onVerDetalle={(n: NotaCredito) => setDocumentoAbierto({ tipo: "notasCredito", id: n.id })}
          campoMonto={(n) => parseFloat(n.total)}
          campoFechaGrafico={(n) => n.fechaEmision}
        />
      )}
      {pestanaActiva === "compras" && (
        <ReporteadorTabla
          endpoint="/compras"
          columnas={columnasCompras}
          nombreArchivo="compras"
          filaId={(c) => c.id}
          onVerDetalle={(c: Compra) => setDocumentoAbierto({ tipo: "compras", id: c.id })}
          campoMonto={(c) => parseFloat(c.total)}
          campoFechaGrafico={(c) => c.fechaEmision}
        />
      )}
      {pestanaActiva === "devolucionesCompra" && puedeDevolucionesCompra && (
        <ReporteadorTabla
          endpoint="/devoluciones-compra"
          columnas={columnasDevolucionesCompra}
          nombreArchivo="devoluciones-compra"
          filaId={(d) => d.id}
          onVerDetalle={(d: DevolucionCompra) => setDocumentoAbierto({ tipo: "devolucionesCompra", id: d.id })}
          campoMonto={(d) => parseFloat(d.total)}
          campoFechaGrafico={(d) => d.fechaEmision}
        />
      )}
      {pestanaActiva === "productos" && (
        <ReporteadorTabla
          endpoint="/productos"
          columnas={columnasProductos}
          nombreArchivo="productos"
          filaId={(p) => p.id}
          onVerDetalle={(p: Producto) => setHistorialAbierto({ tipo: "productos", id: p.id, nombre: p.nombre })}
        />
      )}
      {pestanaActiva === "clientes" && (
        <ReporteadorTabla
          endpoint="/clientes"
          columnas={columnasClientes}
          nombreArchivo="clientes"
          filaId={(c) => c.id}
          onVerDetalle={(c: Cliente) => setHistorialAbierto({ tipo: "clientes", id: c.id, nombre: c.razonSocial })}
        />
      )}
      {pestanaActiva === "proveedores" && (
        <ReporteadorTabla
          endpoint="/proveedores"
          columnas={columnasProveedores}
          nombreArchivo="proveedores"
          filaId={(p) => p.id}
          onVerDetalle={(p: Proveedor) => setHistorialAbierto({ tipo: "proveedores", id: p.id, nombre: p.razonSocial })}
        />
      )}
      {pestanaActiva === "categorias" && (
        <ReporteadorTabla
          endpoint="/categorias"
          columnas={columnasCategorias}
          nombreArchivo="categorias"
          filaId={(c) => c.id}
          onVerDetalle={(c: Categoria) =>
            setFilaAbierta({
              titulo: c.nombre,
              fila: c,
              campos: [
                { etiqueta: "Nombre", obtenerValor: (f) => f.nombre },
                { etiqueta: "Activa", obtenerValor: (f) => (f.activo ? "Sí" : "No") },
                { etiqueta: "Alta", obtenerValor: (f) => (f.createdAt ? new Date(f.createdAt).toLocaleDateString("es-EC") : "—") },
              ],
            })
          }
        />
      )}
      {pestanaActiva === "traslados" && (
        <ReporteadorTabla
          endpoint="/traslados"
          columnas={columnasTraslados}
          nombreArchivo="traslados"
          filaId={(t) => t.id}
          onVerDetalle={(t: Traslado) => setDocumentoAbierto({ tipo: "traslados", id: t.id })}
        />
      )}
      {pestanaActiva === "cobrosBancarios" && (
        <ReporteadorTabla
          endpoint="/pagos/bancarios"
          columnas={columnasCobrosBancarios}
          nombreArchivo="cobros-bancarios"
          filaId={(p) => p.id}
          onVerDetalle={(p: PagoBancario) =>
            setFilaAbierta({
              titulo: documentoPagoBancario(p),
              fila: p,
              campos: [
                { etiqueta: "Fecha", obtenerValor: (f) => new Date(f.fecha).toLocaleString("es-EC") },
                { etiqueta: "Tipo", obtenerValor: (f) => (tipoPagoBancario(f) === "COBRO" ? "Cobro" : "Pago a proveedor") },
                { etiqueta: "Cliente/Proveedor", obtenerValor: (f) => terceroPagoBancario(f) },
                { etiqueta: "Forma de pago", obtenerValor: (f) => f.formaPago },
                { etiqueta: "Cuenta bancaria", obtenerValor: (f) => cuentaBancariaTexto(f) },
                { etiqueta: "Referencia", obtenerValor: (f) => f.referencia ?? "—" },
                { etiqueta: "Origen del pago", obtenerValor: (f) => origenPagoTexto(f) ?? "—" },
                { etiqueta: "Monto", obtenerValor: (f) => `$${f.monto}` },
              ],
            })
          }
        />
      )}
      {pestanaActiva === "caja" && puedeCaja && (
        <ReporteadorTabla
          endpoint="/caja/historial"
          columnas={columnasCaja}
          nombreArchivo="caja"
          filaId={(s) => s.id}
          onVerDetalle={(s: CajaSesion) => setDocumentoAbierto({ tipo: "caja", id: s.id })}
        />
      )}
      {pestanaActiva === "retenciones" && puedeRetenciones && (
        <ReporteadorTabla
          endpoint="/retenciones"
          columnas={columnasRetenciones}
          nombreArchivo="retenciones"
          filaId={(r) => r.id}
          onVerDetalle={(r: Retencion) => setDocumentoAbierto({ tipo: "retenciones", id: r.id })}
        />
      )}
      {pestanaActiva === "retencionesRecibidas" && puedeRetenciones && (
        <ReporteadorTabla
          endpoint="/retenciones-recibidas"
          columnas={columnasRetencionesRecibidas}
          nombreArchivo="retenciones-recibidas"
          filaId={(r) => r.id}
          onVerDetalle={(r: RetencionRecibida) => setDocumentoAbierto({ tipo: "retencionesRecibidas", id: r.id })}
        />
      )}
      {pestanaActiva === "usuarios" && esAdmin && (
        <ReporteadorTabla
          endpoint="/usuarios"
          columnas={columnasUsuarios}
          nombreArchivo="usuarios"
          filaId={(u) => u.id}
          onVerDetalle={(u: UsuarioAdmin) =>
            setFilaAbierta({
              titulo: u.nombre,
              fila: u,
              campos: [
                { etiqueta: "Usuario", obtenerValor: (f) => f.usuario },
                { etiqueta: "Rol", obtenerValor: (f) => (f.rol === "ADMIN" ? "Administrador" : "Personalizado") },
                { etiqueta: "Permisos", obtenerValor: (f) => (f.permisos.length > 0 ? f.permisos.join(", ") : "Ninguno") },
                { etiqueta: "Sucursal", obtenerValor: (f) => f.sucursal?.nombre ?? "Sin asignar" },
                { etiqueta: "Activo", obtenerValor: (f) => (f.activo ? "Sí" : "No") },
                { etiqueta: "Alta", obtenerValor: (f) => new Date(f.createdAt).toLocaleDateString("es-EC") },
              ],
            })
          }
        />
      )}
      {pestanaActiva === "auditoria" && puedeAuditoria && (
        <ReporteadorTabla
          endpoint="/auditoria"
          columnas={columnasAuditoria}
          nombreArchivo="auditoria"
          filaId={(r) => r.id}
          onVerDetalle={(r: RegistroAuditoria) =>
            setFilaAbierta({
              titulo: `${r.accion} — ${r.entidad}`,
              fila: r,
              campos: [
                { etiqueta: "Fecha", obtenerValor: (f) => new Date(f.fecha).toLocaleString("es-EC") },
                { etiqueta: "Usuario", obtenerValor: (f) => f.usuario?.nombre ?? f.usuario?.usuario ?? "—" },
                { etiqueta: "Acción", obtenerValor: (f) => f.accion },
                { etiqueta: "Entidad", obtenerValor: (f) => f.entidad },
                { etiqueta: "Detalle", obtenerValor: (f) => f.detalle ?? "—" },
              ],
            })
          }
        />
      )}

      {/* --- Detalle "documento" (Facturas, Notas de Venta, Compras, Notas de Crédito, Traslados) --- */}
      {documentoAbierto?.tipo === "facturas" && (
        <DetalleDocumentoModal<FacturaConDetalle>
          endpoint="/facturas"
          id={documentoAbierto.id}
          titulo={(f) => `Factura ${f.secuencial}`}
          onCerrar={() => setDocumentoAbierto(null)}
          campos={[
            { etiqueta: "Cliente", obtenerValor: (f) => f.cliente.razonSocial },
            { etiqueta: "Fecha", obtenerValor: (f) => new Date(f.fechaEmision).toLocaleDateString("es-EC") },
            { etiqueta: "Estado", obtenerValor: (f) => f.estado },
            { etiqueta: "Estado de pago", obtenerValor: (f) => f.estadoPago },
            { etiqueta: "Total", obtenerValor: (f) => `$${f.total}` },
            { etiqueta: "Clave de acceso", obtenerValor: (f) => f.claveAcceso ?? "—" },
          ]}
          obtenerLineas={(f) => f.detalles}
          columnasLinea={[
            { etiqueta: "Producto", obtenerValor: (l) => l.producto.nombre },
            { etiqueta: "Cantidad", obtenerValor: (l) => l.cantidad },
            { etiqueta: "P. Unit.", obtenerValor: (l) => `$${l.precioUnitario}` },
            { etiqueta: "Subtotal", obtenerValor: (l) => `$${l.subtotal}` },
          ]}
        />
      )}
      {documentoAbierto?.tipo === "notasVenta" && (
        <DetalleDocumentoModal<NotaVentaConDetalle>
          endpoint="/notas-venta"
          id={documentoAbierto.id}
          titulo={(n) => `Nota de venta ${n.secuencial}`}
          onCerrar={() => setDocumentoAbierto(null)}
          campos={[
            { etiqueta: "Cliente", obtenerValor: (n) => n.cliente.razonSocial },
            { etiqueta: "Fecha", obtenerValor: (n) => new Date(n.fechaEmision).toLocaleDateString("es-EC") },
            { etiqueta: "Estado", obtenerValor: (n) => n.estado },
            { etiqueta: "Estado de pago", obtenerValor: (n) => n.estadoPago },
            { etiqueta: "Total", obtenerValor: (n) => `$${n.total}` },
          ]}
          obtenerLineas={(n) => n.detalles}
          columnasLinea={[
            { etiqueta: "Producto", obtenerValor: (l) => l.producto.nombre },
            { etiqueta: "Cantidad", obtenerValor: (l) => l.cantidad },
            { etiqueta: "P. Unit.", obtenerValor: (l) => `$${l.precioUnitario}` },
            { etiqueta: "Subtotal", obtenerValor: (l) => `$${l.subtotal}` },
          ]}
        />
      )}
      {documentoAbierto?.tipo === "notasCredito" && (
        <DetalleDocumentoModal<NotaCreditoConDetalle>
          endpoint="/notas-credito"
          id={documentoAbierto.id}
          titulo={(n) => `Nota de crédito ${n.secuencial}`}
          onCerrar={() => setDocumentoAbierto(null)}
          campos={[
            { etiqueta: "Factura corregida", obtenerValor: (n) => n.factura.secuencial },
            { etiqueta: "Cliente", obtenerValor: (n) => n.factura.cliente.razonSocial },
            { etiqueta: "Fecha", obtenerValor: (n) => new Date(n.fechaEmision).toLocaleDateString("es-EC") },
            { etiqueta: "Motivo", obtenerValor: (n) => n.motivo },
            { etiqueta: "Estado", obtenerValor: (n) => n.estado },
            { etiqueta: "Total", obtenerValor: (n) => `$${n.total}` },
          ]}
          obtenerLineas={(n) => n.detalles}
          columnasLinea={[
            { etiqueta: "Producto", obtenerValor: (l) => l.producto.nombre },
            { etiqueta: "Cantidad", obtenerValor: (l) => l.cantidad },
            { etiqueta: "P. Unit.", obtenerValor: (l) => `$${l.precioUnitario}` },
            { etiqueta: "Subtotal", obtenerValor: (l) => `$${l.subtotal}` },
          ]}
        />
      )}
      {documentoAbierto?.tipo === "compras" && (
        <DetalleDocumentoModal<CompraConDetalle>
          endpoint="/compras"
          id={documentoAbierto.id}
          titulo={(c) => `Compra Fact. ${c.numeroFactura}`}
          onCerrar={() => setDocumentoAbierto(null)}
          campos={[
            { etiqueta: "Proveedor", obtenerValor: (c) => c.proveedor.razonSocial },
            { etiqueta: "Fecha", obtenerValor: (c) => new Date(c.fechaEmision).toLocaleDateString("es-EC") },
            { etiqueta: "Estado", obtenerValor: (c) => c.estado },
            { etiqueta: "Estado de pago", obtenerValor: (c) => c.estadoPago },
            { etiqueta: "Total", obtenerValor: (c) => `$${c.total}` },
          ]}
          obtenerLineas={(c) => c.detalles}
          columnasLinea={[
            { etiqueta: "Producto", obtenerValor: (l) => l.producto.nombre },
            { etiqueta: "Cantidad", obtenerValor: (l) => l.cantidad },
            { etiqueta: "Costo unit.", obtenerValor: (l) => `$${l.costoUnitario}` },
            { etiqueta: "Subtotal", obtenerValor: (l) => `$${l.subtotal}` },
          ]}
        />
      )}
      {documentoAbierto?.tipo === "devolucionesCompra" && (
        <DetalleDocumentoModal<DevolucionCompraConDetalle>
          endpoint="/devoluciones-compra"
          id={documentoAbierto.id}
          titulo={(d) => `Devolución ${d.secuencial}`}
          onCerrar={() => setDocumentoAbierto(null)}
          campos={[
            { etiqueta: "Compra corregida", obtenerValor: (d) => d.compra.numeroFactura },
            { etiqueta: "Proveedor", obtenerValor: (d) => d.compra.proveedor.razonSocial },
            { etiqueta: "Fecha", obtenerValor: (d) => new Date(d.fechaEmision).toLocaleDateString("es-EC") },
            { etiqueta: "Motivo", obtenerValor: (d) => d.motivo },
            { etiqueta: "Total", obtenerValor: (d) => `$${d.total}` },
          ]}
          obtenerLineas={(d) => d.detalles}
          columnasLinea={[
            { etiqueta: "Producto", obtenerValor: (l) => l.producto.nombre },
            { etiqueta: "Cantidad", obtenerValor: (l) => l.cantidad },
            { etiqueta: "Costo unit.", obtenerValor: (l) => `$${l.costoUnitario}` },
            { etiqueta: "Subtotal", obtenerValor: (l) => `$${l.subtotal}` },
          ]}
        />
      )}
      {documentoAbierto?.tipo === "traslados" && (
        <DetalleDocumentoModal<Traslado>
          endpoint="/traslados"
          id={documentoAbierto.id}
          titulo={(t) => `Traslado #${t.id}`}
          onCerrar={() => setDocumentoAbierto(null)}
          campos={[
            { etiqueta: "De", obtenerValor: (t) => t.sucursalOrigen.nombre },
            { etiqueta: "A", obtenerValor: (t) => t.sucursalDestino.nombre },
            { etiqueta: "Usuario", obtenerValor: (t) => t.usuario?.nombre ?? "—" },
            { etiqueta: "Fecha", obtenerValor: (t) => new Date(t.createdAt).toLocaleDateString("es-EC") },
            { etiqueta: "Motivo", obtenerValor: (t) => t.motivo ?? "—" },
          ]}
          obtenerLineas={(t) => t.detalles ?? []}
          columnasLinea={[
            { etiqueta: "Producto", obtenerValor: (l) => l.producto.nombre },
            { etiqueta: "Cantidad", obtenerValor: (l) => l.cantidad },
          ]}
        />
      )}

      {documentoAbierto?.tipo === "caja" && (
        <DetalleDocumentoModal<CajaSesion>
          endpoint="/caja"
          id={documentoAbierto.id}
          titulo={(s) => `Caja — ${s.sucursal.nombre} (${new Date(s.abiertaEn).toLocaleDateString("es-EC")})`}
          onCerrar={() => setDocumentoAbierto(null)}
          campos={[
            { etiqueta: "Sucursal", obtenerValor: (s) => s.sucursal.nombre },
            { etiqueta: "Estado", obtenerValor: (s) => (s.estado === "ABIERTA" ? "Abierta" : "Cerrada") },
            { etiqueta: "Abierta por", obtenerValor: (s) => `${s.abiertaPor.nombre} — ${new Date(s.abiertaEn).toLocaleString("es-EC")}` },
            {
              etiqueta: "Cerrada por",
              obtenerValor: (s) => (s.cerradaPor && s.cerradaEn ? `${s.cerradaPor.nombre} — ${new Date(s.cerradaEn).toLocaleString("es-EC")}` : "—"),
            },
            { etiqueta: "Monto inicial", obtenerValor: (s) => `$${s.montoInicial}` },
            { etiqueta: "Esperado", obtenerValor: (s) => (s.montoEsperado !== null ? `$${s.montoEsperado}` : "—") },
            { etiqueta: "Contado", obtenerValor: (s) => (s.montoContado !== null ? `$${s.montoContado}` : "—") },
            { etiqueta: "Diferencia", obtenerValor: (s) => (s.diferencia !== null ? `$${s.diferencia}` : "—") },
            { etiqueta: "Observaciones", obtenerValor: (s) => s.observacionesCierre ?? "—" },
          ]}
          obtenerLineas={(s) => s.movimientos ?? []}
          columnasLinea={[
            { etiqueta: "Tipo", obtenerValor: (l) => (l.tipo === "INGRESO" ? "Ingreso" : "Egreso") },
            { etiqueta: "Monto", obtenerValor: (l) => `$${l.monto}` },
            { etiqueta: "Motivo", obtenerValor: (l) => l.motivo },
            { etiqueta: "Usuario", obtenerValor: (l) => l.usuario.nombre },
          ]}
        />
      )}

      {documentoAbierto?.tipo === "retenciones" && (
        <DetalleDocumentoModal<RetencionConDetalle>
          endpoint="/retenciones"
          id={documentoAbierto.id}
          titulo={(r) => `Retención ${r.secuencial}`}
          onCerrar={() => setDocumentoAbierto(null)}
          campos={[
            { etiqueta: "Proveedor", obtenerValor: (r) => r.compra.proveedor.razonSocial },
            { etiqueta: "Fact. compra", obtenerValor: (r) => r.compra.numeroFactura },
            { etiqueta: "Fecha", obtenerValor: (r) => new Date(r.fechaEmision).toLocaleDateString("es-EC") },
            { etiqueta: "Periodo fiscal", obtenerValor: (r) => r.periodoFiscal },
            { etiqueta: "Estado", obtenerValor: (r) => r.estado },
            { etiqueta: "Total retenido", obtenerValor: (r) => `$${r.total}` },
            { etiqueta: "Clave de acceso", obtenerValor: (r) => r.claveAcceso ?? "—" },
          ]}
          obtenerLineas={(r) => r.detalles}
          columnasLinea={[
            { etiqueta: "Impuesto", obtenerValor: (l) => (l.tipoImpuesto === "IVA" ? "IVA" : "Renta") },
            { etiqueta: "Clasif.", obtenerValor: (l) => (l.clasificacion === "BIEN" ? "Bien" : "Servicio") },
            { etiqueta: "Código", obtenerValor: (l) => l.codigoRetencion },
            { etiqueta: "Base", obtenerValor: (l) => `$${l.baseImponible}` },
            { etiqueta: "%", obtenerValor: (l) => `${l.porcentaje}%` },
            { etiqueta: "Valor ret.", obtenerValor: (l) => `$${l.valorRetenido}` },
          ]}
        />
      )}

      {documentoAbierto?.tipo === "retencionesRecibidas" && (
        <DetalleDocumentoModal<RetencionRecibidaConDetalle>
          endpoint="/retenciones-recibidas"
          id={documentoAbierto.id}
          titulo={(r) => `Retención recibida ${r.numeroComprobante}`}
          onCerrar={() => setDocumentoAbierto(null)}
          campos={[
            { etiqueta: "Cliente", obtenerValor: (r) => r.factura.cliente.razonSocial },
            { etiqueta: "Factura", obtenerValor: (r) => r.factura.secuencial },
            { etiqueta: "Fecha", obtenerValor: (r) => new Date(r.fechaEmision).toLocaleDateString("es-EC") },
            { etiqueta: "Total retenido", obtenerValor: (r) => `$${r.total}` },
          ]}
          obtenerLineas={(r) => r.detalles}
          columnasLinea={[
            { etiqueta: "Impuesto", obtenerValor: (l) => (l.tipoImpuesto === "IVA" ? "IVA" : "Renta") },
            { etiqueta: "Clasif.", obtenerValor: (l) => (l.clasificacion === "BIEN" ? "Bien" : "Servicio") },
            { etiqueta: "Código", obtenerValor: (l) => l.codigoRetencion },
            { etiqueta: "Base", obtenerValor: (l) => `$${l.baseImponible}` },
            { etiqueta: "%", obtenerValor: (l) => `${l.porcentaje}%` },
            { etiqueta: "Valor ret.", obtenerValor: (l) => `$${l.valorRetenido}` },
          ]}
        />
      )}

      {/* --- Detalle "historial" (Clientes, Proveedores, Productos) --- */}
      {historialAbierto?.tipo === "clientes" && (
        <HistorialClienteModal clienteId={historialAbierto.id} nombreCliente={historialAbierto.nombre} onCerrar={() => setHistorialAbierto(null)} />
      )}
      {historialAbierto?.tipo === "proveedores" && (
        <HistorialProveedorModal proveedorId={historialAbierto.id} nombreProveedor={historialAbierto.nombre} onCerrar={() => setHistorialAbierto(null)} />
      )}
      {historialAbierto?.tipo === "productos" && (
        <HistorialProductoModal productoId={historialAbierto.id} nombreProducto={historialAbierto.nombre} onCerrar={() => setHistorialAbierto(null)} />
      )}

      {/* --- Detalle "plano" (Categorías, Usuarios, Auditoría) --- */}
      {filaAbierta && (
        <DetalleFilaModal
          titulo={filaAbierta.titulo}
          fila={filaAbierta.fila}
          campos={filaAbierta.campos}
          onCerrar={() => setFilaAbierta(null)}
        />
      )}
    </div>
  );
}
