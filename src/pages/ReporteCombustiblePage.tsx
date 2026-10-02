import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Fuel, Droplet, DollarSign, Car as CarIcon } from "lucide-react";
import { api, type Sucursal, type ReporteCombustibleFlota } from "../api/client";
import { TarjetaKpi, Resaltar, CLASE_ETIQUETA } from "../components/FormatoDocumento";
import { useFiltrosListado, BarraBuscadorDocumentos, filtrarLocal, sinPaginacion } from "../components/BuscadorDocumentos";


// Colores cíclicos para las porciones de los donuts — no hay una paleta de
// "colores de gráfico" central en la app todavía (DashboardPage solo usa
// barras de una sola serie), así que se define acá.
const PALETA = ["#1f6f68", "#2563eb", "#d97706", "#7c3aed", "#db2777", "#65a30d", "#0891b2", "#b91c1c"];

function aInputDate(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

interface FilaDonut {
  nombre: string;
  totalCombustible: string;
  cantidadCargas: number;
}

function TooltipDonut({ active, payload }: { active?: boolean; payload?: { payload: FilaDonut & { valor: number } }[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const punto = payload[0].payload;
  return (
    <div
      className="rounded-md px-3 py-2 text-sm shadow-lg"
      style={{ background: "var(--chart-tooltip-bg)", border: "1px solid var(--chart-tooltip-border)", color: "var(--chart-tooltip-text)" }}
    >
      <p className="font-semibold">{punto.nombre}</p>
      <p className="text-xs opacity-70">
        ${punto.totalCombustible} · {punto.cantidadCargas} carga{punto.cantidadCargas === 1 ? "" : "s"}
      </p>
    </div>
  );
}

// Donut + leyenda para un agrupado (por agencia o por técnico) — mismas
// filas que trae el backend ya ordenadas de mayor a menor gasto, acá solo
// se filtran las de $0 (no aportan nada al gráfico) y se calcula el % de
// cada una sobre el total del período.
function DonutGasto({ titulo, filas, total, vacio }: { titulo: string; filas: FilaDonut[]; total: number; vacio: string }) {
  const datos = filas.map((f) => ({ ...f, valor: Number(f.totalCombustible) })).filter((f) => f.valor > 0);
  return (
    <div className="border border-stone-300 dark:border-gray-700 rounded-sm p-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-gray-600 dark:text-gray-300 mb-2">{titulo}</p>
      {datos.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 py-8 text-center">{vacio}</p>
      ) : (
        <div className="flex items-center gap-4">
          <div className="w-36 h-36 shrink-0 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={datos} dataKey="valor" nameKey="nombre" innerRadius={42} outerRadius={64} paddingAngle={1} stroke="none">
                  {datos.map((_, i) => (
                    <Cell key={i} fill={PALETA[i % PALETA.length]} />
                  ))}
                </Pie>
                <Tooltip content={<TooltipDonut />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <p className="text-sm font-bold text-gray-800 dark:text-gray-100">${total.toFixed(0)}</p>
              <p className="text-[9px] text-gray-400 dark:text-gray-500">total</p>
            </div>
          </div>
          <div className="flex-1 min-w-0 space-y-1.5">
            {datos.map((f, i) => (
              <div key={f.nombre} className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: PALETA[i % PALETA.length] }} />
                <span className="flex-1 truncate text-gray-700 dark:text-gray-200">{f.nombre}</span>
                <span className="font-semibold text-gray-500 dark:text-gray-400">{total > 0 ? `${Math.round((f.valor / total) * 100)}%` : "0%"}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Panorama de gasto de combustible de TODA la flota (a diferencia de la
// "Reporte del período" que ya existe dentro del detalle de cada vehículo en
// VehiculosPage.tsx, que es por un solo vehículo) — agrupado por agencia y
// por técnico, con el mismo botón de Imprimir/Exportar Excel que el resto
// de reportes de la app (ver comentario de SeccionReporteVehiculo).
export function ReporteCombustiblePage() {
  const hoy = new Date();
  const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  // Buscador compartido de los listados: Desde/Hasta van al servidor (como
  // antes, arrancando en "primer día del mes → hoy"); el texto filtra en el
  // navegador las TRES tablas a la vez (técnicos, vehículos y cargas).
  const filtros = useFiltrosListado(sinPaginacion, { desde: aInputDate(primerDiaMes), hasta: aInputDate(hoy) });
  const { desde, hasta } = filtros;
  // null = todavía no se inicializó con el catálogo de agencias (ver efecto
  // abajo) — una vez inicializado, siempre es la lista EXPLÍCITA de
  // agencias marcadas (nunca se reinterpreta "vacío" como "todas": si el
  // usuario destilda todo, el reporte queda vacío de verdad, no trae todo).
  const [sucursalIds, setSucursalIds] = useState<number[] | null>(null);

  const { data: sucursales } = useQuery({
    queryKey: ["sucursales"],
    queryFn: async () => (await api.get<Sucursal[]>("/sucursales")).data,
  });

  useEffect(() => {
    if (sucursalIds === null && sucursales) setSucursalIds(sucursales.map((s) => s.id));
  }, [sucursales, sucursalIds]);

  const { data: reporte, isLoading } = useQuery({
    queryKey: ["reporte-combustible-flota", desde, hasta, sucursalIds],
    queryFn: async () =>
      (
        await api.get<ReporteCombustibleFlota>("/vehiculos/reporte-combustible", {
          params: { desde, hasta, sucursalId: (sucursalIds ?? []).join(",") },
        })
      ).data,
    enabled: (sucursalIds?.length ?? 0) > 0,
  });
  // Buscador del detalle de cargas (en el navegador: el período ya lo
  // filtran los controles de arriba, esto busca dentro de lo que llegó).
  const tecnicosFiltrados = filtrarLocal(reporte?.porTecnico, filtros, { textos: (t) => [t.nombre] }) ?? [];
  const vehiculosFiltrados = filtrarLocal(reporte?.porVehiculo, filtros, { textos: (v) => [v.placa] }) ?? [];
  const cargasFiltradas = filtrarLocal(reporte?.cargas, filtros, {
    textos: (c) => [c.vehiculo.placa, c.vehiculo.sucursal?.nombre, c.gasolinera],
  });

  // Mismo patrón de impresión acotada que SeccionReporteVehiculo (ver
  // comentario ahí y la regla @media print en index.css).
  useEffect(() => {
    const quitarClase = () => document.body.classList.remove("imprimiendo");
    window.addEventListener("afterprint", quitarClase);
    return () => window.removeEventListener("afterprint", quitarClase);
  }, []);

  function imprimir() {
    document.body.classList.add("imprimiendo");
    window.print();
  }

  function alternarSucursal(id: number) {
    setSucursalIds((actuales) => {
      const base = actuales ?? [];
      return base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    });
  }

  function alternarTodas() {
    if (!sucursales) return;
    setSucursalIds((actuales) => ((actuales?.length ?? 0) === sucursales.length ? [] : sucursales.map((s) => s.id)));
  }

  function exportarExcel() {
    if (!reporte) return;
    const libro = XLSX.utils.book_new();

    const hojaResumen = XLSX.utils.json_to_sheet([
      {
        "Período desde": desde,
        "Período hasta": hasta,
        "Cargas registradas": reporte.resumen.cantidadCargas,
        "Galones cargados": reporte.resumen.totalGalones,
        "Gasto general ($)": reporte.resumen.totalCombustible,
        "Vehículos activos": reporte.resumen.cantidadVehiculos,
      },
    ]);
    XLSX.utils.book_append_sheet(libro, hojaResumen, "Resumen");

    const hojaAgencia = XLSX.utils.json_to_sheet(
      reporte.porAgencia.map((a) => ({ Agencia: a.nombre, Cargas: a.cantidadCargas, Galones: a.totalGalones, "Costo ($)": a.totalCombustible }))
    );
    XLSX.utils.book_append_sheet(libro, hojaAgencia, "Por agencia");

    const hojaTecnico = XLSX.utils.json_to_sheet(
      reporte.porTecnico.map((t) => ({
        Técnico: t.nombre,
        Cargas: t.cantidadCargas,
        Galones: t.totalGalones,
        "Costo ($)": t.totalCombustible,
        "Km recorridos": t.kmRecorridos,
        "Rendimiento (km/gal)": t.kmRecorridos > 0 && Number(t.totalGalones) > 0 ? (t.kmRecorridos / Number(t.totalGalones)).toFixed(1) : "",
      }))
    );
    XLSX.utils.book_append_sheet(libro, hojaTecnico, "Por técnico");

    const hojaVehiculo = XLSX.utils.json_to_sheet(
      reporte.porVehiculo.map((v) => ({
        Vehículo: v.placa,
        Cargas: v.cantidadCargas,
        Galones: v.totalGalones,
        "Costo ($)": v.totalCombustible,
        "Km recorridos": v.kmRecorridos,
        "Rendimiento (km/gal)": v.rendimiento ?? "",
      }))
    );
    XLSX.utils.book_append_sheet(libro, hojaVehiculo, "Por vehículo");

    const hojaCargas = XLSX.utils.json_to_sheet(
      reporte.cargas.map((c) => ({
        Fecha: c.fecha.slice(0, 10),
        Vehículo: c.vehiculo.placa,
        Agencia: c.vehiculo.sucursal?.nombre ?? "Sin agencia",
        Galones: c.galones,
        "Costo ($)": c.costoTotal,
        "Km recorridos": c.kmRecorridos ?? "",
        "Rendimiento (km/gal)": c.rendimiento ?? "",
        Gasolinera: c.gasolinera ?? "",
      }))
    );
    XLSX.utils.book_append_sheet(libro, hojaCargas, "Cargas");

    XLSX.writeFile(libro, `reporte-combustible_${desde}_a_${hasta}.xlsx`);
  }

  const totalCombustibleNum = reporte ? Number(reporte.resumen.totalCombustible) : 0;
  const todasMarcadas = !!sucursales && sucursalIds !== null && sucursalIds.length === sucursales.length;

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-stone-300 dark:border-gray-700">
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-50">Reporte de combustible</h2>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-gray-400 dark:text-gray-500">
              {desde || "inicio"} → {hasta || "hoy"}
            </span>
            <button onClick={exportarExcel} disabled={!reporte} className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 px-3 py-1.5 rounded-sm text-xs font-semibold hover:bg-stone-50 dark:hover:bg-gray-700 disabled:opacity-40">
              Exportar Excel
            </button>
            <button onClick={imprimir} disabled={!reporte} className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 px-3 py-1.5 rounded-sm text-xs font-semibold hover:bg-stone-50 dark:hover:bg-gray-700 disabled:opacity-40">
              Imprimir
            </button>
          </div>
        </div>
        <div className="px-4 py-2 bg-stone-50 dark:bg-gray-900/40 border-b border-stone-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
          Gasto de combustible de toda la flota, por agencia, por técnico y por vehículo.
        </div>
        <BarraBuscadorDocumentos
          filtros={filtros}
          etiquetaBusqueda="Buscar en las tablas · técnico, placa, agencia o gasolinera"
          placeholder="Ej: Pérez, ABC-1234, Primax..."
          mostrarPago={false}
        />
        <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
          <span className={CLASE_ETIQUETA}>Agencias</span>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 dark:text-gray-200 pr-3 border-r border-stone-300 dark:border-gray-600">
                <input type="checkbox" checked={todasMarcadas} onChange={alternarTodas} />
                Todas
              </label>
              {sucursales?.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                  <input type="checkbox" checked={sucursalIds?.includes(s.id) ?? false} onChange={() => alternarSucursal(s.id)} />
                  {s.nombre}
                </label>
              ))}
            </div>
        </div>
      </div>

      <div className="flex gap-4 items-start flex-wrap">
        <div className="flex-1 min-w-0 space-y-4">
          {isLoading && <p className="text-xs text-gray-400 dark:text-gray-500">Calculando...</p>}
          {!isLoading && (sucursalIds?.length ?? 0) === 0 && (
            <p className="text-xs text-gray-400 dark:text-gray-500">Selecciona al menos una agencia para ver el reporte.</p>
          )}

          {reporte && (
            <div className="imprimir-en-blanco space-y-4">
              {/* Solo aparece impreso, igual criterio que SeccionReporteVehiculo */}
              <p className="hidden print:block text-sm font-semibold text-gray-800 mb-1">Reporte de combustible · {desde} a {hasta}</p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <TarjetaKpi icono={Fuel} etiqueta="Cargas registradas" valor={String(reporte.resumen.cantidadCargas)} color="bg-teal-600" />
                <TarjetaKpi icono={Droplet} etiqueta="Galones cargados" valor={reporte.resumen.totalGalones} color="bg-blue-600" />
                <TarjetaKpi icono={DollarSign} etiqueta="Gasto general" valor={`$${reporte.resumen.totalCombustible}`} color="bg-amber-600" />
                <TarjetaKpi icono={CarIcon} etiqueta="Vehículos activos" valor={String(reporte.resumen.cantidadVehiculos)} color="bg-violet-600" />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <DonutGasto titulo="Gasto por agencia" filas={reporte.porAgencia} total={totalCombustibleNum} vacio="Sin cargas en el período elegido" />
                <DonutGasto titulo="Gasto por técnico" filas={reporte.porTecnico} total={totalCombustibleNum} vacio="Sin cargas en el período elegido" />
              </div>

              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-gray-600 dark:text-gray-300 mb-1.5">Consumo por técnico</p>
                <div className="border border-stone-300 dark:border-gray-700 rounded-sm overflow-hidden overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700 text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 [&_th]:font-medium">
                      <tr>
                        <th className="px-2 py-1.5">Técnico</th>
                        <th className="px-2 py-1.5 text-right">Cargas</th>
                        <th className="px-2 py-1.5 text-right">Galones</th>
                        <th className="px-2 py-1.5 text-right">Km recorridos</th>
                        <th className="px-2 py-1.5 text-right">Rendimiento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tecnicosFiltrados.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-2 py-2 text-center text-gray-400 dark:text-gray-500">
                            Sin cargas de combustible en el período elegido
                          </td>
                        </tr>
                      )}
                      {tecnicosFiltrados.map((t) => {
                        const galones = Number(t.totalGalones);
                        const rendimiento = t.kmRecorridos > 0 && galones > 0 ? t.kmRecorridos / galones : null;
                        return (
                          <tr key={t.empleadoId ?? "sin-tecnico"} className="border-t border-stone-100 dark:border-gray-700">
                            <td className="px-2 py-1.5"><Resaltar texto={t.nombre} termino={filtros.busquedaAplicada} /></td>
                            <td className="px-2 py-1.5 text-right font-mono tabular-nums">{t.cantidadCargas}</td>
                            <td className="px-2 py-1.5 text-right font-mono tabular-nums">{t.totalGalones} gal</td>
                            <td className="px-2 py-1.5 text-right font-mono tabular-nums">{t.kmRecorridos.toLocaleString("es-EC")}</td>
                            <td className="px-2 py-1.5 text-right font-mono tabular-nums">{rendimiento != null ? `${rendimiento.toFixed(1)} km/gal` : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-gray-600 dark:text-gray-300 mb-1.5">
                  Consumo por vehículo <span className="normal-case font-normal">(ordenado por el que menos rinde primero)</span>
                </p>
                <div className="border border-stone-300 dark:border-gray-700 rounded-sm overflow-hidden overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700 text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 [&_th]:font-medium">
                      <tr>
                        <th className="px-2 py-1.5">Vehículo</th>
                        <th className="px-2 py-1.5 text-right">Cargas</th>
                        <th className="px-2 py-1.5 text-right">Galones</th>
                        <th className="px-2 py-1.5 text-right">Km recorridos</th>
                        <th className="px-2 py-1.5 text-right">Rendimiento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vehiculosFiltrados.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-2 py-2 text-center text-gray-400 dark:text-gray-500">
                            Sin cargas de combustible en el período elegido
                          </td>
                        </tr>
                      )}
                      {vehiculosFiltrados.map((v) => (
                        <tr key={v.vehiculoId} className="border-t border-stone-100 dark:border-gray-700">
                          <td className="px-2 py-1.5 font-mono"><Resaltar texto={v.placa} termino={filtros.busquedaAplicada} /></td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums">{v.cantidadCargas}</td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums">{v.totalGalones} gal</td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums">{v.kmRecorridos.toLocaleString("es-EC")}</td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums">{v.rendimiento != null ? `${v.rendimiento} km/gal` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-gray-600 dark:text-gray-300 mb-1.5">
                  Cargas del período
                  {reporte.cargas.length < reporte.resumen.cantidadCargas && ` (últimas ${reporte.cargas.length} de ${reporte.resumen.cantidadCargas})`}
                </p>
                <div className="border border-stone-300 dark:border-gray-700 rounded-sm overflow-hidden overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700 text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 [&_th]:font-medium">
                      <tr>
                        <th className="px-2 py-1.5">Fecha</th>
                        <th className="px-2 py-1.5">Vehículo</th>
                        <th className="px-2 py-1.5">Agencia</th>
                        <th className="px-2 py-1.5 text-right">Galones</th>
                        <th className="px-2 py-1.5 text-right">Costo</th>
                        <th className="px-2 py-1.5 text-right">Km recorridos</th>
                        <th className="px-2 py-1.5 text-right">Rendimiento</th>
                        <th className="px-2 py-1.5">Gasolinera</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cargasFiltradas?.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-2 py-2 text-center text-gray-400 dark:text-gray-500">
                            {filtros.hayFiltros ? "Ninguna carga coincide con la búsqueda." : "Sin cargas de combustible en el período elegido"}
                          </td>
                        </tr>
                      )}
                      {cargasFiltradas?.map((c) => (
                        <tr key={c.id} className="border-t border-stone-100 dark:border-gray-700">
                          <td className="px-2 py-1.5 whitespace-nowrap">{c.fecha.slice(0, 10)}</td>
                          <td className="px-2 py-1.5 font-mono"><Resaltar texto={c.vehiculo.placa} termino={filtros.busquedaAplicada} /></td>
                          <td className="px-2 py-1.5">{c.vehiculo.sucursal?.nombre ?? "—"}</td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums">{c.galones}</td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums">{c.costoTotal}</td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums">{c.kmRecorridos != null ? c.kmRecorridos.toLocaleString("es-EC") : "—"}</td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums">{c.rendimiento != null ? `${c.rendimiento} km/gal` : "—"}</td>
                          <td className="px-2 py-1.5"><Resaltar texto={c.gasolinera || "—"} termino={filtros.busquedaAplicada} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
