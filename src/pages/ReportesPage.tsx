import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, type CuentasPorCobrar, type CuentasPorPagar, type BucketMora, type MoraPorBucket } from "../api/client";
import { BuscadorReportes } from "../components/BuscadorReportes";

interface ReporteVentas {
  rango: { desde: string; hasta: string };
  resumen: {
    cantidadFacturas: number;
    subtotal0: string;
    subtotal12: string;
    iva: string;
    total: string;
  };
  facturas: {
    id: number;
    secuencial: string;
    fechaEmision: string;
    cliente: string;
    estado: string;
    total: string;
  }[];
}

interface ReporteNotasVenta {
  rango: { desde: string; hasta: string };
  resumen: {
    cantidadNotasVenta: number;
    subtotal0: string;
    subtotal12: string;
    iva: string;
    total: string;
  };
  notasVenta: {
    id: number;
    secuencial: string;
    fechaEmision: string;
    cliente: string;
    estado: string;
    aplicaIva: boolean;
    total: string;
  }[];
}

interface ReporteCompras {
  rango: { desde: string; hasta: string };
  resumen: {
    cantidadCompras: number;
    subtotal0: string;
    subtotal12: string;
    iva: string;
    total: string;
  };
  compras: {
    id: number;
    numeroFactura: string;
    fechaEmision: string;
    proveedor: string;
    estado: string;
    total: string;
  }[];
}

interface ReporteCobrosBancarios {
  rango: { desde: string; hasta: string };
  resumen: {
    cantidadMovimientos: number;
    totalCobrado: string;
    totalPagado: string;
    neto: string;
  };
  porCuenta: {
    cuentaBancariaId: number;
    nombre: string;
    banco: string;
    numeroCuenta: string;
    cantidad: number;
    totalCobrado: string;
    totalPagado: string;
    neto: string;
  }[];
}

interface ReporteIva {
  rango: { desde: string; hasta: string };
  ventas: {
    gravadas0: string;
    gravadas12: string;
    ivaCobrado: string;
    cantidadFacturas: number;
    cantidadNotasCredito: number;
    cantidadNotasVenta: number;
  };
  compras: {
    gravadas0: string;
    gravadas12: string;
    ivaPagado: string;
    cantidadCompras: number;
  };
  retencionesPracticadas: { totalIva: string; totalRenta: string; cantidad: number };
  retencionesRecibidas: { totalIva: string; totalRenta: string; cantidad: number };
  resumen: {
    ivaEnVentas: string;
    ivaEnCompras: string;
    ivaRetenidoRecibido: string;
    ivaCausado: string;
    esAFavor: boolean;
  };
}

interface ProductoRanking {
  productoId: number;
  nombre: string;
  cantidad: number;
  totalVendido: string;
}

interface VentaPorDia {
  fecha: string; // "YYYY-MM-DD"
  total: string;
}

interface ReporteRentabilidad {
  rango: { desde: string; hasta: string };
  ranking: {
    productoId: number;
    nombre: string;
    cantidadVendida: number;
    ingresoTotal: string;
    costoPromedio: string | null;
    margen: string | null;
    margenPorcentaje: string | null;
  }[];
}

// Formatea una fecha como YYYY-MM-DD, el formato que esperan los inputs type="date"
function aInputDate(fecha: Date): string {
  return fecha.toISOString().split("T")[0];
}

// "2026-07-15" -> "15/07", para el eje X del gráfico de tendencia (sin año:
// el rango rara vez cruza más de un año, y el título/rango ya lo da el contexto)
function aFechaCorta(fechaISO: string): string {
  const [, mes, dia] = fechaISO.split("-");
  return `${dia}/${mes}`;
}

// Tooltip del gráfico de ventas por día: una sola serie, así que no hace
// falta leyenda — el valor va primero (en negrita) y la fecha completa después,
// siguiendo la jerarquía "el valor manda" del tooltip.
function TooltipVentasPorDia({ active, payload }: { active?: boolean; payload?: { payload: VentaPorDia }[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const punto = payload[0].payload;
  const fecha = new Date(`${punto.fecha}T00:00:00`);
  return (
    <div
      className="rounded-md px-3 py-2 text-sm shadow-lg"
      style={{
        background: "var(--chart-tooltip-bg)",
        border: "1px solid var(--chart-tooltip-border)",
        color: "var(--chart-tooltip-text)",
      }}
    >
      <p className="font-semibold">${punto.total}</p>
      <p className="text-xs opacity-70">{fecha.toLocaleDateString("es-EC", { weekday: "short", day: "numeric", month: "short" })}</p>
    </div>
  );
}

// --- Mora (días de atraso) en cuentas por cobrar/pagar ---
const ETIQUETAS_BUCKET_MORA: Record<BucketMora, string> = {
  AL_DIA: "Al día",
  "1_30": "1-30 días",
  "31_60": "31-60 días",
  "61_90": "61-90 días",
  MAS_90: "+90 días",
};

function colorAtraso(diasAtraso: number | null): string {
  if (diasAtraso === null) return "text-gray-400 dark:text-gray-500";
  if (diasAtraso <= 30) return "text-amber-600 dark:text-amber-400";
  if (diasAtraso <= 60) return "text-orange-600 dark:text-orange-400";
  return "text-red-600 dark:text-red-400";
}

function textoAtraso(diasAtraso: number | null): string {
  return diasAtraso === null ? "Al día" : `${diasAtraso} día${diasAtraso === 1 ? "" : "s"}`;
}

// Franja de resumen con el desglose por antigüedad — mismo estilo "tile" que
// ya usan cantidadDocumentos/totalPorCobrar arriba de cada tabla.
function ResumenMora({ moraPorBucket }: { moraPorBucket: MoraPorBucket }) {
  const buckets: BucketMora[] = ["1_30", "31_60", "61_90", "MAS_90"];
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {buckets.map((b) => (
        <div key={b} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm px-3 py-2">
          <p className="text-[11px] text-gray-500 dark:text-gray-400">{ETIQUETAS_BUCKET_MORA[b]}</p>
          <p className={`text-sm font-semibold ${colorAtraso(b === "1_30" ? 1 : b === "31_60" ? 31 : b === "61_90" ? 61 : 91)}`}>
            ${moraPorBucket[b]}
          </p>
        </div>
      ))}
    </div>
  );
}

export function ReportesPage() {
  const hoy = new Date();
  const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

  const [desde, setDesde] = useState(aInputDate(primerDiaMes));
  const [hasta, setHasta] = useState(aInputDate(hoy));

  // El buscador dinámico ("ventas de julio") reusa este mismo filtro de
  // fechas — no arma un reporte de ventas aparte, solo lo mueve al mes que
  // se pidió.
  function moverFiltroAlMes(anio: number, mes: number) {
    setDesde(aInputDate(new Date(anio, mes - 1, 1)));
    setHasta(aInputDate(new Date(anio, mes, 0)));
  }

  const { data: reporte, isLoading } = useQuery({
    queryKey: ["reporte-ventas", desde, hasta],
    queryFn: async () =>
      (await api.get<ReporteVentas>("/reportes/ventas", { params: { desde, hasta } })).data,
  });

  const { data: reporteNotasVenta } = useQuery({
    queryKey: ["reporte-notas-venta", desde, hasta],
    queryFn: async () =>
      (await api.get<ReporteNotasVenta>("/reportes/notas-venta", { params: { desde, hasta } })).data,
  });

  const { data: reporteCompras } = useQuery({
    queryKey: ["reporte-compras", desde, hasta],
    queryFn: async () =>
      (await api.get<ReporteCompras>("/reportes/compras", { params: { desde, hasta } })).data,
  });

  const { data: reporteCobrosBancarios } = useQuery({
    queryKey: ["reporte-cobros-bancarios", desde, hasta],
    queryFn: async () =>
      (await api.get<ReporteCobrosBancarios>("/reportes/cobros-bancarios", { params: { desde, hasta } })).data,
  });

  // Cuentas por cobrar/pagar NO se filtran por rango de fechas — una factura
  // de hace 3 meses que sigue sin cobrarse debe seguir apareciendo hoy.
  const { data: cuentasPorCobrar } = useQuery({
    queryKey: ["reporte-cuentas-por-cobrar"],
    queryFn: async () => (await api.get<CuentasPorCobrar>("/reportes/cuentas-por-cobrar")).data,
  });

  const { data: cuentasPorPagar } = useQuery({
    queryKey: ["reporte-cuentas-por-pagar"],
    queryFn: async () => (await api.get<CuentasPorPagar>("/reportes/cuentas-por-pagar")).data,
  });

  const { data: ranking } = useQuery({
    queryKey: ["ranking-productos", desde, hasta],
    queryFn: async () =>
      (await api.get<ProductoRanking[]>("/reportes/productos-mas-vendidos", { params: { desde, hasta } })).data,
  });

  const { data: ventasPorDia } = useQuery({
    queryKey: ["reporte-ventas-por-dia", desde, hasta],
    queryFn: async () =>
      (await api.get<VentaPorDia[]>("/reportes/ventas-por-dia", { params: { desde, hasta } })).data,
  });

  const { data: rentabilidad } = useQuery({
    queryKey: ["reporte-rentabilidad", desde, hasta],
    queryFn: async () =>
      (await api.get<ReporteRentabilidad>("/reportes/rentabilidad", { params: { desde, hasta } })).data,
  });

  const { data: reporteIva } = useQuery({
    queryKey: ["reporte-iva", desde, hasta],
    queryFn: async () =>
      (await api.get<ReporteIva>("/reportes/iva-formulario104", { params: { desde, hasta } })).data,
  });

  // Construye un archivo .xlsx con varias hojas y dispara la descarga en el navegador.
  // Todo ocurre en el cliente (no pasa por el backend), usando la librería xlsx.
  function exportarExcel() {
    if (!reporte) return;

    const libro = XLSX.utils.book_new();

    // Hoja 1: Resumen (facturas + notas de venta, cada una con su propio total)
    const hojaResumen = XLSX.utils.json_to_sheet([
      {
        "Período desde": desde,
        "Período hasta": hasta,
        "Facturas emitidas": reporte.resumen.cantidadFacturas,
        "Subtotal 0% (facturas)": reporte.resumen.subtotal0,
        "Subtotal con IVA (facturas)": reporte.resumen.subtotal12,
        "IVA cobrado (facturas)": reporte.resumen.iva,
        "Total facturas": reporte.resumen.total,
        "Notas de venta emitidas": reporteNotasVenta?.resumen.cantidadNotasVenta ?? 0,
        "IVA cobrado (notas de venta)": reporteNotasVenta?.resumen.iva ?? "0.00",
        "Total notas de venta": reporteNotasVenta?.resumen.total ?? "0.00",
        "Compras registradas": reporteCompras?.resumen.cantidadCompras ?? 0,
        "IVA pagado (compras)": reporteCompras?.resumen.iva ?? "0.00",
        "Total compras": reporteCompras?.resumen.total ?? "0.00",
      },
    ]);
    XLSX.utils.book_append_sheet(libro, hojaResumen, "Resumen");

    // Hoja 2: Detalle de facturas
    const hojaFacturas = XLSX.utils.json_to_sheet(
      reporte.facturas.map((f) => ({
        "No. Factura": f.secuencial,
        "Cliente": f.cliente,
        "Fecha": new Date(f.fechaEmision).toLocaleDateString("es-EC"),
        "Estado": f.estado,
        "Total": f.total,
      }))
    );
    XLSX.utils.book_append_sheet(libro, hojaFacturas, "Facturas");

    // Hoja 3: Detalle de notas de venta
    if (reporteNotasVenta && reporteNotasVenta.notasVenta.length > 0) {
      const hojaNotasVenta = XLSX.utils.json_to_sheet(
        reporteNotasVenta.notasVenta.map((n) => ({
          "No. Nota de venta": n.secuencial,
          "Cliente": n.cliente,
          "Fecha": new Date(n.fechaEmision).toLocaleDateString("es-EC"),
          "Estado": n.estado,
          "IVA": n.aplicaIva ? "Sí" : "No",
          "Total": n.total,
        }))
      );
      XLSX.utils.book_append_sheet(libro, hojaNotasVenta, "Notas de venta");
    }

    // Hoja 4: Detalle de compras
    if (reporteCompras && reporteCompras.compras.length > 0) {
      const hojaCompras = XLSX.utils.json_to_sheet(
        reporteCompras.compras.map((c) => ({
          "Fact. proveedor": c.numeroFactura,
          "Proveedor": c.proveedor,
          "Fecha": new Date(c.fechaEmision).toLocaleDateString("es-EC"),
          "Estado": c.estado,
          "Total": c.total,
        }))
      );
      XLSX.utils.book_append_sheet(libro, hojaCompras, "Compras");
    }

    // Hoja: Cobros bancarios por cuenta (incluye tanto lo cobrado a clientes
    // como lo pagado a proveedores por TRANSFERENCIA/TARJETA/CHEQUE)
    if (reporteCobrosBancarios && reporteCobrosBancarios.porCuenta.length > 0) {
      const hojaCobrosBancarios = XLSX.utils.json_to_sheet(
        reporteCobrosBancarios.porCuenta.map((c) => ({
          "Cuenta": c.nombre,
          "Banco": c.banco,
          "Número de cuenta": c.numeroCuenta,
          "Movimientos": c.cantidad,
          "Cobrado": c.totalCobrado,
          "Pagado a proveedores": c.totalPagado,
          "Neto": c.neto,
        }))
      );
      XLSX.utils.book_append_sheet(libro, hojaCobrosBancarios, "Cobros bancarios");
    }

    // Hoja 5: Cuentas por cobrar (no depende del rango de fechas elegido;
    // combina Facturas y Notas de Venta pendientes de cobro)
    if (cuentasPorCobrar && cuentasPorCobrar.documentos.length > 0) {
      const hojaPorCobrar = XLSX.utils.json_to_sheet(
        cuentasPorCobrar.documentos.map((d) => ({
          "Tipo": d.tipo === "FACTURA" ? "Factura" : "Nota de venta",
          "No. Documento": d.documento,
          "Cliente": d.cliente,
          "Fecha": new Date(d.fechaEmision).toLocaleDateString("es-EC"),
          "Vencimiento": d.fechaVencimiento ? new Date(d.fechaVencimiento).toLocaleDateString("es-EC") : "",
          "Días de atraso": d.diasAtraso ?? "",
          "Estado pago": d.estadoPago,
          "Total": d.total,
          "Pagado": d.montoPagado,
          "Saldo": d.saldo,
        }))
      );
      XLSX.utils.book_append_sheet(libro, hojaPorCobrar, "Cuentas por cobrar");
    }

    // Hoja 6: Cuentas por pagar
    if (cuentasPorPagar && cuentasPorPagar.compras.length > 0) {
      const hojaPorPagar = XLSX.utils.json_to_sheet(
        cuentasPorPagar.compras.map((c) => ({
          "Fact. proveedor": c.numeroFactura,
          "Proveedor": c.proveedor,
          "Fecha": new Date(c.fechaEmision).toLocaleDateString("es-EC"),
          "Vencimiento": c.fechaVencimiento ? new Date(c.fechaVencimiento).toLocaleDateString("es-EC") : "",
          "Días de atraso": c.diasAtraso ?? "",
          "Estado pago": c.estadoPago,
          "Total": c.total,
          "Pagado": c.montoPagado,
          "Saldo": c.saldo,
        }))
      );
      XLSX.utils.book_append_sheet(libro, hojaPorPagar, "Cuentas por pagar");
    }

    // Hoja 7: Productos más vendidos (combina facturas y notas de venta)
    if (ranking && ranking.length > 0) {
      const hojaRanking = XLSX.utils.json_to_sheet(
        ranking.map((p) => ({
          "Producto": p.nombre,
          "Cantidad vendida": p.cantidad,
          "Total vendido": p.totalVendido,
        }))
      );
      XLSX.utils.book_append_sheet(libro, hojaRanking, "Productos mas vendidos");
    }

    // Hoja 8: Ventas por día (la misma serie que el gráfico de tendencia, en
    // forma de tabla — para que el dato quede accesible sin tener que pasar el mouse)
    if (ventasPorDia && ventasPorDia.length > 0) {
      const hojaVentasPorDia = XLSX.utils.json_to_sheet(
        ventasPorDia.map((v) => ({ Fecha: v.fecha, Total: v.total }))
      );
      XLSX.utils.book_append_sheet(libro, hojaVentasPorDia, "Ventas por dia");
    }

    // Hoja 9: Rentabilidad por producto (margen contra el costo promedio de compra)
    if (rentabilidad && rentabilidad.ranking.length > 0) {
      const hojaRentabilidad = XLSX.utils.json_to_sheet(
        rentabilidad.ranking.map((p) => ({
          "Producto": p.nombre,
          "Cantidad vendida": p.cantidadVendida,
          "Ingreso": p.ingresoTotal,
          "Costo promedio": p.costoPromedio ?? "Sin datos",
          "Margen": p.margen ?? "Sin datos",
          "Margen %": p.margenPorcentaje ?? "—",
        }))
      );
      XLSX.utils.book_append_sheet(libro, hojaRentabilidad, "Rentabilidad");
    }

    // Hoja 10: IVA — Formulario 104
    if (reporteIva) {
      const hojaIva = XLSX.utils.json_to_sheet([
        {
          "Período desde": desde,
          "Período hasta": hasta,
          "Ventas gravadas 0%": reporteIva.ventas.gravadas0,
          "Ventas gravadas 12%": reporteIva.ventas.gravadas12,
          "IVA en ventas": reporteIva.ventas.ivaCobrado,
          "Compras gravadas 0%": reporteIva.compras.gravadas0,
          "Compras gravadas 12%": reporteIva.compras.gravadas12,
          "IVA en compras (crédito tributario)": reporteIva.compras.ivaPagado,
          "IVA retenido a proveedores (informativo)": reporteIva.retencionesPracticadas.totalIva,
          "Renta retenida a proveedores (informativo)": reporteIva.retencionesPracticadas.totalRenta,
          "IVA que nos retuvieron clientes": reporteIva.retencionesRecibidas.totalIva,
          "Renta que nos retuvieron clientes": reporteIva.retencionesRecibidas.totalRenta,
          "IVA causado (a pagar si es positivo, crédito a favor si es negativo)": reporteIva.resumen.ivaCausado,
        },
      ]);
      XLSX.utils.book_append_sheet(libro, hojaIva, "IVA Formulario 104");
    }

    // Nombre de archivo incluye el rango de fechas para que sea fácil de identificar
    XLSX.writeFile(libro, `reporte-ventas_${desde}_a_${hasta}.xlsx`);
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Reportes</h2>
        <div className="flex items-center gap-2 text-sm">
          <label className="text-gray-600 dark:text-gray-300">Desde:</label>
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1"
          />
          <label className="text-gray-600 dark:text-gray-300">Hasta:</label>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1"
          />
          <button
            onClick={exportarExcel}
            disabled={!reporte}
            className="bg-emerald-600 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-emerald-700 disabled:opacity-40 ml-2"
          >
            Exportar a Excel
          </button>
        </div>
      </div>

      <BuscadorReportes onVentasPorMes={moverFiltroAlMes} />

      {isLoading && <p className="text-gray-400 dark:text-gray-500 text-sm">Cargando reporte...</p>}

      {reporte && (
        <>
          {/* Tarjetas de resumen */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Facturas emitidas</p>
              <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{reporte.resumen.cantidadFacturas}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Subtotal (sin IVA)</p>
              <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                ${(parseFloat(reporte.resumen.subtotal0) + parseFloat(reporte.resumen.subtotal12)).toFixed(2)}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">IVA cobrado</p>
              <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">${reporte.resumen.iva}</p>
            </div>
            <div className="bg-emerald-600 rounded-lg shadow-sm p-4">
              <p className="text-xs text-emerald-100 mb-1">Total del período</p>
              <p className="text-2xl font-bold text-white">${reporte.resumen.total}</p>
            </div>
          </div>

          {/* Tendencia de ventas por día: una sola serie (facturas + notas de
              venta combinadas), por eso no lleva leyenda — el título ya dice
              qué se grafica. Los días sin ventas quedan en $0, no se ocultan. */}
          {ventasPorDia && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 mb-6">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">Tendencia de ventas por día</h3>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">Incluye facturas y notas de venta</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={ventasPorDia} barCategoryGap={2} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                  <XAxis
                    dataKey="fecha"
                    tickFormatter={aFechaCorta}
                    tick={{ fill: "var(--chart-muted)", fontSize: 11 }}
                    axisLine={{ stroke: "var(--chart-axis)" }}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tickFormatter={(v) => `$${v}`}
                    tick={{ fill: "var(--chart-muted)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={56}
                  />
                  <Tooltip content={<TooltipVentasPorDia />} cursor={{ fill: "var(--chart-grid)" }} />
                  <Bar dataKey="total" fill="var(--chart-series-1)" radius={[4, 4, 0, 0]} maxBarSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            {/* Tabla de facturas del período */}
            <div className="col-span-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Facturas del período</h3>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
                  <tr>
                    <th className="px-4 py-2">No.</th>
                    <th className="px-4 py-2">Cliente</th>
                    <th className="px-4 py-2">Fecha</th>
                    <th className="px-4 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {reporte.facturas.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">
                        No hay facturas en este período
                      </td>
                    </tr>
                  )}
                  {reporte.facturas.map((f) => (
                    <tr key={f.id} className="border-t border-gray-100 dark:border-gray-700">
                      <td className="px-4 py-2 font-mono text-xs">{f.secuencial}</td>
                      <td className="px-4 py-2">{f.cliente}</td>
                      <td className="px-4 py-2">{new Date(f.fechaEmision).toLocaleDateString("es-EC")}</td>
                      <td className="px-4 py-2 text-right">${f.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Ranking de productos más vendidos */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Más vendidos</h3>
                <p className="text-xs text-gray-400 dark:text-gray-500">Incluye facturas y notas de venta</p>
              </div>
              <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                {ranking?.length === 0 && (
                  <li className="px-4 py-4 text-center text-gray-400 dark:text-gray-500 text-sm">Sin datos</li>
                )}
                {ranking?.slice(0, 8).map((p) => (
                  <li key={p.productoId} className="px-4 py-2 flex justify-between text-sm">
                    <span className="text-gray-700 dark:text-gray-300">{p.nombre}</span>
                    <span className="font-semibold text-gray-800 dark:text-gray-100">{p.cantidad}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* --- Notas de venta: sección propia, igual que Facturas arriba --- */}
          {reporteNotasVenta && (
            <div className="mt-8">
              <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-3">Notas de venta</h3>

              <div className="grid grid-cols-4 gap-4 mb-4">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Notas de venta emitidas</p>
                  <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{reporteNotasVenta.resumen.cantidadNotasVenta}</p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Subtotal</p>
                  <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                    ${(parseFloat(reporteNotasVenta.resumen.subtotal0) + parseFloat(reporteNotasVenta.resumen.subtotal12)).toFixed(2)}
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">IVA cobrado</p>
                  <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">${reporteNotasVenta.resumen.iva}</p>
                </div>
                <div className="bg-slate-800 rounded-lg shadow-sm p-4">
                  <p className="text-xs text-slate-300 mb-1">Total del período</p>
                  <p className="text-2xl font-bold text-white">${reporteNotasVenta.resumen.total}</p>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Notas de venta del período</h3>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
                    <tr>
                      <th className="px-4 py-2">No.</th>
                      <th className="px-4 py-2">Cliente</th>
                      <th className="px-4 py-2">Fecha</th>
                      <th className="px-4 py-2">IVA</th>
                      <th className="px-4 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reporteNotasVenta.notasVenta.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">
                          No hay notas de venta en este período
                        </td>
                      </tr>
                    )}
                    {reporteNotasVenta.notasVenta.map((n) => (
                      <tr key={n.id} className="border-t border-gray-100 dark:border-gray-700">
                        <td className="px-4 py-2 font-mono text-xs">{n.secuencial}</td>
                        <td className="px-4 py-2">{n.cliente}</td>
                        <td className="px-4 py-2">{new Date(n.fechaEmision).toLocaleDateString("es-EC")}</td>
                        <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">{n.aplicaIva ? "Sí" : "No"}</td>
                        <td className="px-4 py-2 text-right">${n.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* --- Compras: el "reverso" de las ventas, sección propia --- */}
          {reporteCompras && (
            <div className="mt-8">
              <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-3">Compras</h3>

              <div className="grid grid-cols-4 gap-4 mb-4">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Compras registradas</p>
                  <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{reporteCompras.resumen.cantidadCompras}</p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Subtotal</p>
                  <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                    ${(parseFloat(reporteCompras.resumen.subtotal0) + parseFloat(reporteCompras.resumen.subtotal12)).toFixed(2)}
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">IVA pagado</p>
                  <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">${reporteCompras.resumen.iva}</p>
                </div>
                <div className="bg-amber-600 rounded-lg shadow-sm p-4">
                  <p className="text-xs text-amber-100 mb-1">Total del período</p>
                  <p className="text-2xl font-bold text-white">${reporteCompras.resumen.total}</p>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Compras del período</h3>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
                    <tr>
                      <th className="px-4 py-2">Fact. proveedor</th>
                      <th className="px-4 py-2">Proveedor</th>
                      <th className="px-4 py-2">Fecha</th>
                      <th className="px-4 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reporteCompras.compras.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">
                          No hay compras en este período
                        </td>
                      </tr>
                    )}
                    {reporteCompras.compras.map((c) => (
                      <tr key={c.id} className="border-t border-gray-100 dark:border-gray-700">
                        <td className="px-4 py-2 font-mono text-xs">{c.numeroFactura}</td>
                        <td className="px-4 py-2">{c.proveedor}</td>
                        <td className="px-4 py-2">{new Date(c.fechaEmision).toLocaleDateString("es-EC")}</td>
                        <td className="px-4 py-2 text-right">${c.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* --- Cobros Bancarios: movimiento por TRANSFERENCIA/TARJETA/CHEQUE,
              agrupado por cuenta — incluye tanto lo cobrado a clientes como
              lo pagado a proveedores; el detalle movimiento por movimiento
              está en Reporteador Principal > Cobros Bancarios. --- */}
          {reporteCobrosBancarios && (
            <div className="mt-8">
              <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-1">Cobros Bancarios</h3>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
                Incluye cobros a clientes y pagos a proveedores por transferencia, tarjeta o cheque
              </p>

              <div className="grid grid-cols-4 gap-4 mb-4">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Movimientos</p>
                  <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{reporteCobrosBancarios.resumen.cantidadMovimientos}</p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total cobrado</p>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">${reporteCobrosBancarios.resumen.totalCobrado}</p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total pagado a proveedores</p>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">${reporteCobrosBancarios.resumen.totalPagado}</p>
                </div>
                <div className={`rounded-lg shadow-sm p-4 ${parseFloat(reporteCobrosBancarios.resumen.neto) >= 0 ? "bg-emerald-600" : "bg-red-600"}`}>
                  <p className="text-xs text-white/80 mb-1">Neto del período</p>
                  <p className="text-2xl font-bold text-white">${reporteCobrosBancarios.resumen.neto}</p>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Por cuenta bancaria</h3>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
                    <tr>
                      <th className="px-4 py-2">Cuenta</th>
                      <th className="px-4 py-2">Banco</th>
                      <th className="px-4 py-2 text-right">Movimientos</th>
                      <th className="px-4 py-2 text-right">Cobrado</th>
                      <th className="px-4 py-2 text-right">Pagado</th>
                      <th className="px-4 py-2 text-right">Neto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reporteCobrosBancarios.porCuenta.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">
                          No hay movimientos bancarios en este período
                        </td>
                      </tr>
                    )}
                    {reporteCobrosBancarios.porCuenta.map((c) => (
                      <tr key={c.cuentaBancariaId} className="border-t border-gray-100 dark:border-gray-700">
                        <td className="px-4 py-2 font-semibold text-gray-800 dark:text-gray-100">{c.nombre}</td>
                        <td className="px-4 py-2">
                          {c.banco} — {c.numeroCuenta}
                        </td>
                        <td className="px-4 py-2 text-right">{c.cantidad}</td>
                        <td className="px-4 py-2 text-right text-emerald-600 dark:text-emerald-400">${c.totalCobrado}</td>
                        <td className="px-4 py-2 text-right text-red-600 dark:text-red-400">${c.totalPagado}</td>
                        <td className="px-4 py-2 text-right font-medium">${c.neto}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* --- Cuentas por cobrar/pagar: NO dependen del rango de fechas de arriba --- */}
          {cuentasPorCobrar && (
            <div className="mt-8">
              <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-3">Cuentas por cobrar</h3>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">Incluye facturas y notas de venta pendientes de cobro</p>
              <div className="grid grid-cols-2 gap-4 mb-4 max-w-lg">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Documentos pendientes</p>
                  <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{cuentasPorCobrar.resumen.cantidadDocumentos}</p>
                </div>
                <div className="bg-amber-600 rounded-lg shadow-sm p-4">
                  <p className="text-xs text-amber-100 mb-1">Total por cobrar</p>
                  <p className="text-2xl font-bold text-white">${cuentasPorCobrar.resumen.totalPorCobrar}</p>
                </div>
              </div>
              <ResumenMora moraPorBucket={cuentasPorCobrar.resumen.moraPorBucket} />
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
                    <tr>
                      <th className="px-4 py-2">Tipo</th>
                      <th className="px-4 py-2">No.</th>
                      <th className="px-4 py-2">Cliente</th>
                      <th className="px-4 py-2">Fecha</th>
                      <th className="px-4 py-2">Vencimiento</th>
                      <th className="px-4 py-2">Atraso</th>
                      <th className="px-4 py-2">Estado pago</th>
                      <th className="px-4 py-2 text-right">Total</th>
                      <th className="px-4 py-2 text-right">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cuentasPorCobrar.documentos.length === 0 && (
                      <tr>
                        <td colSpan={9} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">
                          No hay documentos pendientes de cobro
                        </td>
                      </tr>
                    )}
                    {cuentasPorCobrar.documentos.map((d) => (
                      <tr key={`${d.tipo}-${d.id}`} className="border-t border-gray-100 dark:border-gray-700">
                        <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
                          {d.tipo === "FACTURA" ? "Factura" : "Nota de venta"}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs">{d.documento}</td>
                        <td className="px-4 py-2">{d.cliente}</td>
                        <td className="px-4 py-2">{new Date(d.fechaEmision).toLocaleDateString("es-EC")}</td>
                        <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
                          {d.fechaVencimiento ? new Date(d.fechaVencimiento).toLocaleDateString("es-EC") : "—"}
                        </td>
                        <td className={`px-4 py-2 text-xs font-medium ${colorAtraso(d.diasAtraso)}`}>{textoAtraso(d.diasAtraso)}</td>
                        <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">{d.estadoPago}</td>
                        <td className="px-4 py-2 text-right">${d.total}</td>
                        <td className="px-4 py-2 text-right font-semibold">${d.saldo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {cuentasPorPagar && (
            <div className="mt-8">
              <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-3">Cuentas por pagar</h3>
              <div className="grid grid-cols-2 gap-4 mb-4 max-w-lg">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Compras pendientes</p>
                  <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{cuentasPorPagar.resumen.cantidadCompras}</p>
                </div>
                <div className="bg-red-600 rounded-lg shadow-sm p-4">
                  <p className="text-xs text-red-100 mb-1">Total por pagar</p>
                  <p className="text-2xl font-bold text-white">${cuentasPorPagar.resumen.totalPorPagar}</p>
                </div>
              </div>
              <ResumenMora moraPorBucket={cuentasPorPagar.resumen.moraPorBucket} />
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
                    <tr>
                      <th className="px-4 py-2">Fact. proveedor</th>
                      <th className="px-4 py-2">Proveedor</th>
                      <th className="px-4 py-2">Fecha</th>
                      <th className="px-4 py-2">Vencimiento</th>
                      <th className="px-4 py-2">Atraso</th>
                      <th className="px-4 py-2">Estado pago</th>
                      <th className="px-4 py-2 text-right">Total</th>
                      <th className="px-4 py-2 text-right">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cuentasPorPagar.compras.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">
                          No hay compras pendientes de pago
                        </td>
                      </tr>
                    )}
                    {cuentasPorPagar.compras.map((c) => (
                      <tr key={c.id} className="border-t border-gray-100 dark:border-gray-700">
                        <td className="px-4 py-2 font-mono text-xs">{c.numeroFactura}</td>
                        <td className="px-4 py-2">{c.proveedor}</td>
                        <td className="px-4 py-2">{new Date(c.fechaEmision).toLocaleDateString("es-EC")}</td>
                        <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">
                          {c.fechaVencimiento ? new Date(c.fechaVencimiento).toLocaleDateString("es-EC") : "—"}
                        </td>
                        <td className={`px-4 py-2 text-xs font-medium ${colorAtraso(c.diasAtraso)}`}>{textoAtraso(c.diasAtraso)}</td>
                        <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">{c.estadoPago}</td>
                        <td className="px-4 py-2 text-right">${c.total}</td>
                        <td className="px-4 py-2 text-right font-semibold">${c.saldo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* --- Rentabilidad: margen por producto contra el costo promedio de compra --- */}
          {rentabilidad && (
            <div className="mt-8">
              <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-3">Rentabilidad por producto</h3>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
                Ingreso de lo vendido en el período contra el costo promedio ponderado de compra. Los productos sin
                historial en Compras aparecen como "sin datos de costo" (no se asume $0, inflaría el margen).
              </p>
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
                    <tr>
                      <th className="px-4 py-2">Producto</th>
                      <th className="px-4 py-2 text-right">Cant. vendida</th>
                      <th className="px-4 py-2 text-right">Ingreso</th>
                      <th className="px-4 py-2 text-right">Costo prom.</th>
                      <th className="px-4 py-2 text-right">Margen</th>
                      <th className="px-4 py-2 text-right">Margen %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rentabilidad.ranking.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">
                          No hay ventas en este período
                        </td>
                      </tr>
                    )}
                    {rentabilidad.ranking.map((p) => (
                      <tr key={p.productoId} className="border-t border-gray-100 dark:border-gray-700">
                        <td className="px-4 py-2">{p.nombre}</td>
                        <td className="px-4 py-2 text-right">{p.cantidadVendida}</td>
                        <td className="px-4 py-2 text-right">${p.ingresoTotal}</td>
                        <td className="px-4 py-2 text-right text-gray-500 dark:text-gray-400">
                          {p.costoPromedio ? `$${p.costoPromedio}` : "Sin datos"}
                        </td>
                        <td
                          className={`px-4 py-2 text-right font-semibold ${
                            p.margen === null
                              ? "text-gray-400 dark:text-gray-500"
                              : parseFloat(p.margen) < 0
                              ? "text-red-600 dark:text-red-400"
                              : "text-emerald-600 dark:text-emerald-400"
                          }`}
                        >
                          {p.margen ? `$${p.margen}` : "—"}
                        </td>
                        <td className="px-4 py-2 text-right text-xs text-gray-500 dark:text-gray-400">
                          {p.margenPorcentaje ? `${p.margenPorcentaje}%` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* --- IVA — Formulario 104: resumen mensual para la declaración al SRI --- */}
          {reporteIva && (
            <div className="mt-8">
              <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-1">IVA — Formulario 104</h3>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
                Ventas gravadas (Facturas + Notas de venta con IVA, menos Notas de crédito) y compras con derecho a
                crédito tributario, para el período elegido arriba. El IVA que un cliente te haya retenido a vos
                reduce lo que se paga al SRI; el que vos le retuviste a tus proveedores es una obligación aparte
                (no se resta acá).
              </p>

              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Ventas gravadas</p>
                  <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                    ${(parseFloat(reporteIva.ventas.gravadas0) + parseFloat(reporteIva.ventas.gravadas12)).toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">IVA cobrado: ${reporteIva.ventas.ivaCobrado}</p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Compras gravadas</p>
                  <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                    ${(parseFloat(reporteIva.compras.gravadas0) + parseFloat(reporteIva.compras.gravadas12)).toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    IVA pagado (crédito tributario): ${reporteIva.compras.ivaPagado}
                  </p>
                </div>
                <div
                  className={`rounded-lg shadow-sm p-4 ${reporteIva.resumen.esAFavor ? "bg-sky-600" : "bg-emerald-600"}`}
                >
                  <p className={`text-xs mb-1 ${reporteIva.resumen.esAFavor ? "text-sky-100" : "text-emerald-100"}`}>
                    {reporteIva.resumen.esAFavor ? "Crédito tributario a favor" : "IVA a pagar"}
                  </p>
                  <p className="text-2xl font-bold text-white">
                    ${Math.abs(parseFloat(reporteIva.resumen.ivaCausado)).toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    Retenciones que le hiciste a tus proveedores (informativo — obligación aparte de remitir al SRI)
                  </p>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-300">IVA retenido</span>
                    <span className="font-semibold text-gray-800 dark:text-gray-100">${reporteIva.retencionesPracticadas.totalIva}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-300">Renta retenida</span>
                    <span className="font-semibold text-gray-800 dark:text-gray-100">${reporteIva.retencionesPracticadas.totalRenta}</span>
                  </div>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2">
                    {reporteIva.retencionesPracticadas.cantidad} retención(es) en el período
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Retenciones que te hicieron tus clientes (reduce el IVA a pagar)</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-300">IVA retenido</span>
                    <span className="font-semibold text-gray-800 dark:text-gray-100">${reporteIva.retencionesRecibidas.totalIva}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-300">Renta retenida</span>
                    <span className="font-semibold text-gray-800 dark:text-gray-100">${reporteIva.retencionesRecibidas.totalRenta}</span>
                  </div>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2">
                    {reporteIva.retencionesRecibidas.cantidad} retención(es) en el período
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
