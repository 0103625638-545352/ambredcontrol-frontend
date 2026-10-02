import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
  Clock,
  AlertCircle,
  ShieldAlert,
  DatabaseBackup,
  FileText,
  TrendingUp,
  ClipboardList,
  Receipt,
  DollarSign,
  BellRing,
} from "lucide-react";
import { api, type DashboardResumen } from "../api/client";
import { EstadoBadge } from "../components/EstadoBadge";
import { TarjetaKpi, CLASE_TITULO_SECCION } from "../components/FormatoDocumento";


interface Props {
  onNavegar: (pestana: "facturas" | "notasVenta" | "productos" | "ajustes") => void;
  puedeConfiguracion?: boolean;
  // El backend YA filtra estos datos según el permiso de quien pide el
  // resumen (ver GET /dashboard/resumen) — sin "ventas"/"productos" esos
  // campos llegan vacíos/en cero, nunca con las cifras reales. Estos props
  // solo controlan si se muestra la SECCIÓN entera (en vez de una tarjeta
  // vacía rara) — la protección real ya pasó en el servidor.
  puedeVentas: boolean;
  puedeProductos: boolean;
}

// Separa el secuencial guardado ("001-001-000000001") en Serie ("001-001")
// y Número ("000000001"), como lo muestran los sistemas de facturación
// electrónica de referencia — en la base solo guardamos el string completo.
function separarSecuencial(secuencial: string): { serie: string; numero: string } {
  const partes = secuencial.split("-");
  if (partes.length !== 3) return { serie: "-", numero: secuencial };
  return { serie: `${partes[0]}-${partes[1]}`, numero: partes[2] };
}

// "2026-07-15" -> "15/07", para el eje X del gráfico de tendencia (mismo
// formato que ya usa ReportesPage — el rango del Dashboard nunca cruza más
// de un año, así que el año no hace falta).
function aFechaCorta(fechaISO: string): string {
  const [, mes, dia] = fechaISO.split("-");
  return `${dia}/${mes}`;
}

interface PuntoVentaDia {
  fecha: string;
  total: string;
}

// Tooltip del gráfico de tendencia: una sola serie, por eso el valor va
// primero (en negrita) y la fecha completa después — mismo criterio que el
// tooltip equivalente en ReportesPage.
function TooltipVentasPorDia({ active, payload }: { active?: boolean; payload?: { payload: PuntoVentaDia }[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const punto = payload[0].payload;
  const fecha = new Date(`${punto.fecha}T00:00:00`);
  return (
    <div
      className="rounded-md px-3 py-2 text-sm shadow-lg"
      style={{ background: "var(--chart-tooltip-bg)", border: "1px solid var(--chart-tooltip-border)", color: "var(--chart-tooltip-text)" }}
    >
      <p className="font-semibold">${punto.total}</p>
      <p className="text-xs opacity-70">{fecha.toLocaleDateString("es-EC", { weekday: "short", day: "numeric", month: "short" })}</p>
    </div>
  );
}

interface ProductoRanking {
  nombre: string;
  cantidad: number;
}

// Tooltip del ranking de productos: acá el valor es una cantidad (unidades),
// no dinero, así que el formato es distinto al de ventas por día.
function TooltipTopProductos({ active, payload }: { active?: boolean; payload?: { payload: ProductoRanking }[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const punto = payload[0].payload;
  return (
    <div
      className="rounded-md px-3 py-2 text-sm shadow-lg"
      style={{ background: "var(--chart-tooltip-bg)", border: "1px solid var(--chart-tooltip-border)", color: "var(--chart-tooltip-text)" }}
    >
      <p className="font-semibold">{punto.nombre}</p>
      <p className="text-xs opacity-70">{punto.cantidad} unidad{punto.cantidad === 1 ? "" : "es"} vendida{punto.cantidad === 1 ? "" : "s"}</p>
    </div>
  );
}

// Nombre de producto recortado para el eje Y del ranking — nombres largos
// desbordarían el ancho fijo del eje y solaparían la tabla de al lado.
function nombreCorto(nombre: string, maximo = 18): string {
  return nombre.length > maximo ? `${nombre.slice(0, maximo - 1)}…` : nombre;
}

export function DashboardPage({ onNavegar, puedeConfiguracion, puedeVentas, puedeProductos }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-resumen"],
    queryFn: async () => (await api.get<DashboardResumen>("/dashboard/resumen")).data,
  });

  const alertasActivas =
    (data?.productosStockBajo.length ?? 0) +
    (data?.productosPorCaducar.length ?? 0) +
    (data?.certificadoInvalido ? 1 : 0) +
    (data?.certificadoPorCaducar ? 1 : 0) +
    (data?.backupAtrasado ? 1 : 0);

  return (
    <div className="space-y-4">
      {/* Cifras clave de un vistazo — mismo espíritu que un "Overview" de
          panel de soporte: números grandes sobre color sólido, arriba de
          todo, antes de cualquier alerta o tabla. */}
      {puedeVentas && data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <TarjetaKpi icono={FileText} etiqueta="Facturas emitidas (mes)" valor={String(data.resumen.documentosEmitidosMes)} color="bg-brand-700" />
          <TarjetaKpi icono={Receipt} etiqueta="Notas de venta (mes)" valor={String(data.resumen.notasVentaMes)} color="bg-emerald-600" />
          <TarjetaKpi icono={DollarSign} etiqueta="Total vendido (mes)" valor={`$${data.resumen.total}`} color="bg-sky-600" />
          <TarjetaKpi icono={BellRing} etiqueta="Alertas activas" valor={String(alertasActivas)} color={alertasActivas > 0 ? "bg-amber-600" : "bg-gray-500"} />
        </div>
      )}

      {/* Alerta de stock bajo: pasiva antes (había que entrar a Productos a
          fijarse), ahora salta apenas se abre el Dashboard. */}
      {puedeProductos && data && data.productosStockBajo.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-sm p-4 flex items-start gap-3">
          <AlertTriangle strokeWidth={1.75} className="w-5 h-5 text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              {data.productosStockBajo.length === 1
                ? "1 producto está en o por debajo de su stock mínimo"
                : `${data.productosStockBajo.length} productos están en o por debajo de su stock mínimo`}
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
              {data.productosStockBajo
                .slice(0, 5)
                .map((p) => `${p.productoNombre}${p.sucursalNombre ? ` (${p.sucursalNombre})` : ""} (${p.stockActual}/${p.stockMinimo})`)
                .join(" · ")}
              {data.productosStockBajo.length > 5 && ` y ${data.productosStockBajo.length - 5} más`}
            </p>
          </div>
          <button
            onClick={() => onNavegar("productos")}
            className="text-xs font-medium text-amber-800 dark:text-amber-300 hover:underline shrink-0"
          >
            Ver productos →
          </button>
        </div>
      )}

      {/* Alerta de caducidad: productos perecibles (por lote o con fecha
          única) que ya caducaron o caducan dentro de los próximos 30 días. */}
      {puedeProductos && data && data.productosPorCaducar.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-sm p-4 flex items-start gap-3">
          <Clock strokeWidth={1.75} className="w-5 h-5 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-800 dark:text-red-300">
              {data.productosPorCaducar.length === 1
                ? "1 producto está caducado o por caducar"
                : `${data.productosPorCaducar.length} productos están caducados o por caducar`}
            </p>
            <p className="text-xs text-red-700 dark:text-red-400 mt-1">
              {data.productosPorCaducar
                .slice(0, 5)
                .map((p) => {
                  const etiqueta = p.vencido ? "caducado" : new Date(p.fechaCaducidad).toLocaleDateString("es-EC");
                  const lote = p.numeroLote ? ` lote ${p.numeroLote}` : "";
                  return `${p.productoNombre}${lote} (${p.cantidad} — ${etiqueta})`;
                })
                .join(" · ")}
              {data.productosPorCaducar.length > 5 && ` y ${data.productosPorCaducar.length - 5} más`}
            </p>
          </div>
          <button
            onClick={() => onNavegar("productos")}
            className="text-xs font-medium text-red-800 dark:text-red-300 hover:underline shrink-0"
          >
            Ver productos →
          </button>
        </div>
      )}

      {/* Alerta de certificado inválido (más grave que "por caducar": ya ni
          siquiera se puede leer del disco — ninguna factura/comprobante
          puede firmarse hasta que se solucione). Se muestra primero. */}
      {data?.certificadoInvalido && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-sm p-4 flex items-start gap-3">
          <AlertCircle strokeWidth={1.75} className="w-5 h-5 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-800 dark:text-red-300">
              El certificado de firma electrónica no se puede usar
            </p>
            <p className="text-xs text-red-700 dark:text-red-400 mt-1">
              {data.certificadoInvalido.motivo}. Ninguna factura o comprobante podrá firmarse/enviarse al SRI hasta que subas uno válido.
            </p>
          </div>
          {puedeConfiguracion && (
            <button
              onClick={() => onNavegar("ajustes")}
              className="text-xs font-medium text-red-800 dark:text-red-300 hover:underline shrink-0"
            >
              Ir a Ajustes →
            </button>
          )}
        </div>
      )}

      {/* Alerta de certificado por caducar: sin esto, un certificado vencido
          corta la facturación electrónica sin ningún aviso previo. */}
      {data?.certificadoPorCaducar && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-sm p-4 flex items-start gap-3">
          <ShieldAlert strokeWidth={1.75} className="w-5 h-5 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-800 dark:text-red-300">
              {data.certificadoPorCaducar.vencido
                ? `El certificado de firma electrónica está VENCIDO desde hace ${Math.abs(data.certificadoPorCaducar.diasRestantes)} día(s)`
                : `El certificado de firma electrónica vence en ${data.certificadoPorCaducar.diasRestantes} día(s)`}
            </p>
            <p className="text-xs text-red-700 dark:text-red-400 mt-1">
              Fecha de expiración: {new Date(data.certificadoPorCaducar.fechaExpiracion).toLocaleDateString("es-EC")}
              {data.certificadoPorCaducar.vencido && " — la facturación electrónica no funcionará hasta que se renueve."}
            </p>
          </div>
          {puedeConfiguracion && (
            <button
              onClick={() => onNavegar("ajustes")}
              className="text-xs font-medium text-red-800 dark:text-red-300 hover:underline shrink-0"
            >
              Ir a Ajustes →
            </button>
          )}
        </div>
      )}

      {/* Alerta de respaldo de base de datos atrasado: sin esto, un
          programador de tareas que dejó de correr en silencio no se nota
          hasta que hace falta restaurar. */}
      {data?.backupAtrasado && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-sm p-4 flex items-start gap-3">
          <DatabaseBackup strokeWidth={1.75} className="w-5 h-5 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-800 dark:text-red-300">
              El respaldo automático de la base de datos está atrasado
            </p>
            <p className="text-xs text-red-700 dark:text-red-400 mt-1">
              No se ha completado un respaldo exitoso recientemente — revisa BACKUP_DB_PATH y la conexión a la base
              de datos.
            </p>
          </div>
          {puedeConfiguracion && (
            <button
              onClick={() => onNavegar("ajustes")}
              className="text-xs font-medium text-red-800 dark:text-red-300 hover:underline shrink-0"
            >
              Ir a Ajustes →
            </button>
          )}
        </div>
      )}

      {puedeVentas && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* Documentos electrónicos: accesos rápidos a Facturas y Notas de Venta */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-sm border border-stone-300 dark:border-gray-700 p-4">
          <h2 className={`${CLASE_TITULO_SECCION} mb-3 flex items-center gap-2`}>
            <FileText strokeWidth={1.75} className="w-4 h-4 text-gray-400 dark:text-gray-500" />
            Documentos Electrónicos
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => onNavegar("facturas")}
              className="text-left bg-brand-700 hover:bg-brand-800 text-white rounded-sm p-4 h-32 flex flex-col justify-between transition-colors"
            >
              <FileText strokeWidth={1.5} className="w-8 h-8 opacity-80" />
              <div>
                <p className="font-semibold">Facturas</p>
                <p className="font-mono text-[10px] uppercase tracking-wider opacity-80">Ver más →</p>
              </div>
            </button>
            <button
              onClick={() => onNavegar("notasVenta")}
              className="text-left bg-emerald-700 hover:bg-emerald-800 text-white rounded-sm p-4 h-32 flex flex-col justify-between transition-colors"
            >
              <TrendingUp strokeWidth={1.5} className="w-8 h-8 opacity-80" />
              <div>
                <p className="font-semibold">Notas de Venta</p>
                <p className="font-mono text-[10px] uppercase tracking-wider opacity-80">Ver más →</p>
              </div>
            </button>
          </div>
        </div>

        {/* Resumen del mes en curso */}
        <div className="bg-white dark:bg-gray-800 rounded-sm border border-stone-300 dark:border-gray-700 p-4">
          <h2 className={`${CLASE_TITULO_SECCION} mb-3 flex items-center gap-2`}>
            <ClipboardList strokeWidth={1.75} className="w-4 h-4 text-gray-400 dark:text-gray-500" />
            Resumen del mes
          </h2>
          {isLoading || !data ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-stone-100 dark:border-gray-700">
                  <td className="py-2 text-gray-500 dark:text-gray-400">Facturas emitidas</td>
                  <td className="py-2 text-right font-mono tabular-nums text-gray-800 dark:text-gray-100">{data.resumen.documentosEmitidosMes}</td>
                </tr>
                <tr className="border-b border-stone-100 dark:border-gray-700">
                  <td className="py-2 text-gray-500 dark:text-gray-400">Notas de venta</td>
                  <td className="py-2 text-right font-mono tabular-nums text-gray-800 dark:text-gray-100">{data.resumen.notasVentaMes}</td>
                </tr>
                <tr className="border-b border-stone-100 dark:border-gray-700">
                  <td className="py-2 text-gray-500 dark:text-gray-400">Neto</td>
                  <td className="py-2 text-right font-mono tabular-nums text-gray-800 dark:text-gray-100">${data.resumen.neto}</td>
                </tr>
                <tr>
                  <td className="py-2 text-gray-500 dark:text-gray-400">IVA</td>
                  <td className="py-2 text-right font-mono tabular-nums text-gray-800 dark:text-gray-100">${data.resumen.iva}</td>
                </tr>
                <tr className="border-t-2 border-gray-900 dark:border-gray-200">
                  <td className="py-2.5 text-gray-900 dark:text-gray-50 font-bold">TOTAL USD</td>
                  <td className="py-2.5 text-right font-mono tabular-nums font-bold text-gray-900 dark:text-gray-50">{data.resumen.total}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>
      )}

      {puedeVentas && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* Tendencia de ventas: una sola serie (facturas + notas de venta
            combinadas), por eso no lleva leyenda — el título ya dice qué se
            grafica. Los días sin ventas quedan en $0, no se ocultan. */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-sm border border-stone-300 dark:border-gray-700 p-4">
          <h2 className={`${CLASE_TITULO_SECCION} mb-1`}>Tendencia de ventas</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">Últimos 14 días · incluye facturas y notas de venta</p>
          {data && data.ventasUltimosDias.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.ventasUltimosDias} barCategoryGap={2} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
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
                <Bar dataKey="total" fill="var(--chart-series-1)" radius={[1, 1, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-16 text-center">
              {isLoading ? "Cargando..." : "Todavía no hay ventas en este período"}
            </p>
          )}
        </div>

        {/* Top 5 productos del mes: barra horizontal para que los nombres
            (variables en longitud) no compitan por espacio con el eje. */}
        <div className="bg-white dark:bg-gray-800 rounded-sm border border-stone-300 dark:border-gray-700 p-4">
          <h2 className={`${CLASE_TITULO_SECCION} mb-1`}>Productos más vendidos</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">Mes en curso · por unidades</p>
          {data && data.topProductosMes.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={data.topProductosMes}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
                barCategoryGap={6}
              >
                <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
                <XAxis type="number" tick={{ fill: "var(--chart-muted)", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="nombre"
                  tickFormatter={(v: string) => nombreCorto(v)}
                  tick={{ fill: "var(--chart-muted)", fontSize: 11 }}
                  axisLine={{ stroke: "var(--chart-axis)" }}
                  tickLine={false}
                  width={90}
                />
                <Tooltip content={<TooltipTopProductos />} cursor={{ fill: "var(--chart-grid)" }} />
                <Bar dataKey="cantidad" fill="var(--chart-series-1)" radius={[0, 1, 1, 0]} maxBarSize={16} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500 py-16 text-center">
              {isLoading ? "Cargando..." : "Todavía no hay ventas este mes"}
            </p>
          )}
        </div>
      </div>
      )}

      {/* Facturas recientes */}
      {puedeVentas && (
      <div className="bg-white dark:bg-gray-800 rounded-sm border border-stone-300 dark:border-gray-700 overflow-hidden">
        <h2 className={`${CLASE_TITULO_SECCION} px-4 py-2.5 border-b border-stone-300 dark:border-gray-700`}>Facturas recientes</h2>
        <table className="w-full text-sm">
          <thead className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700 text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 [&_th]:font-medium">
            <tr>
              <th className="px-4 py-2">Serie</th>
              <th className="px-4 py-2">Número</th>
              <th className="px-4 py-2">Ambiente</th>
              <th className="px-4 py-2">Cliente</th>
              <th className="px-4 py-2">Emisión</th>
              <th className="px-4 py-2 text-right">Total</th>
              <th className="px-4 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">Cargando...</td>
              </tr>
            )}
            {!isLoading && data?.facturasRecientes.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">Todavía no hay facturas emitidas</td>
              </tr>
            )}
            {data?.facturasRecientes.map((f) => {
              const { serie, numero } = separarSecuencial(f.secuencial);
              return (
                <tr key={f.id} className="border-t border-stone-100 dark:border-gray-700">
                  <td className="px-4 py-2 font-mono text-xs">{serie}</td>
                  <td className="px-4 py-2 font-mono text-xs">{numero}</td>
                  <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">{data.ambiente}</td>
                  <td className="px-4 py-2">{f.cliente}</td>
                  <td className="px-4 py-2">{new Date(f.fechaEmision).toLocaleDateString("es-EC")}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">${f.total}</td>
                  <td className="px-4 py-2">
                    <EstadoBadge estado={f.estado} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      {/* Ventas por sucursal: comparación de locales del mes en curso
          (facturas + notas de venta), solo tiene sentido si hay más de una
          sucursal activa. */}
      {puedeVentas && data && data.ventasPorSucursal.length > 1 && (
        <div className="bg-white dark:bg-gray-800 rounded-sm border border-stone-300 dark:border-gray-700 overflow-hidden">
          <h2 className={`${CLASE_TITULO_SECCION} px-4 py-2.5 border-b border-stone-300 dark:border-gray-700`}>Ventas por sucursal (mes en curso)</h2>
          <table className="w-full text-sm">
            <thead className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700 text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 [&_th]:font-medium">
              <tr>
                <th className="px-4 py-2">Sucursal</th>
                <th className="px-4 py-2 text-right">Documentos</th>
                <th className="px-4 py-2 text-right">Total vendido</th>
              </tr>
            </thead>
            <tbody>
              {data.ventasPorSucursal.map((s) => (
                <tr key={s.sucursalId} className="border-t border-stone-100 dark:border-gray-700">
                  <td className="px-4 py-2">{s.sucursalNombre}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{s.documentos}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-gray-800 dark:text-gray-100">{s.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
