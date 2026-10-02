import { useState } from "react";
import * as XLSX from "xlsx";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  api,
  abrirPdfEnNuevaPestana,
  type Empleado,
  type RolDePagos,
  type DecimoTercero,
  type DecimoCuarto,
  type Vacacion,
  type SaldoVacaciones,
  type Utilidad,
  type Liquidacion,
  type Marcacion,
  type HorasTrabajadas,
  type RespuestaPaginada,
} from "../api/client";
import { EstadoBadge } from "../components/EstadoBadge";
import { useToast } from "../components/ToastProvider";
import { usePermiso } from "../context/AuthContext";
import { Modal } from "../components/Modal";
import { MapaMarcacion } from "../components/MapaMarcacion";
import { useFiltrosListado, BarraBuscadorDocumentos, filtrarLocal, sinPaginacion } from "../components/BuscadorDocumentos";
import { Resaltar } from "../components/FormatoDocumento";

type Pestana = "rolPagos" | "decimos" | "vacaciones" | "utilidades" | "liquidaciones" | "marcaciones";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function useEmpleadosActivos() {
  return useQuery({
    queryKey: ["empleados-activos"],
    queryFn: async () => (await api.get<Empleado[]>("/empleados")).data.filter((e) => e.activo),
  });
}

export function NominaPage() {
  const puedeEditar = usePermiso("nomina_editar");
  const [pestanaActiva, setPestanaActiva] = useState<Pestana>("rolPagos");

  const pestanas: { id: Pestana; etiqueta: string }[] = [
    { id: "rolPagos", etiqueta: "Rol de Pagos" },
    { id: "decimos", etiqueta: "Décimos" },
    { id: "vacaciones", etiqueta: "Vacaciones" },
    { id: "utilidades", etiqueta: "Utilidades" },
    { id: "liquidaciones", etiqueta: "Liquidaciones" },
    { id: "marcaciones", etiqueta: "Marcaciones" },
  ];

  return (
    <div className="bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-stone-300 dark:border-gray-700">
        <h2 className="text-base font-bold text-gray-900 dark:text-gray-50">Nómina</h2>
        <span className="font-mono text-[11px] text-gray-400 dark:text-gray-500">
          {pestanas.find((p) => p.id === pestanaActiva)?.etiqueta}
        </span>
      </div>
      <div className="px-4 py-2 bg-stone-50 dark:bg-gray-900/40 border-b border-stone-200 dark:border-gray-700">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Rol de pagos mensual (con aportes IESS), décimo tercero/cuarto, vacaciones, utilidades y liquidaciones. Los
          nuevos empleados se registran en la pestaña "Empleados" del menú.
        </p>
      </div>

      <div className="flex flex-wrap border-b border-stone-300 dark:border-gray-700 px-2">
        {pestanas.map((p) => (
          <button
            key={p.id}
            onClick={() => setPestanaActiva(p.id)}
            className={`px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px ${
              pestanaActiva === p.id
                ? "border-brand-600 text-brand-700 dark:text-brand-300"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            }`}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      <div className="p-4">

      {pestanaActiva === "rolPagos" && <PestanaRolDePagos puedeEditar={puedeEditar} />}
      {pestanaActiva === "decimos" && <PestanaDecimos puedeEditar={puedeEditar} />}
      {pestanaActiva === "vacaciones" && <PestanaVacaciones puedeEditar={puedeEditar} />}
      {pestanaActiva === "utilidades" && <PestanaUtilidades puedeEditar={puedeEditar} />}
      {pestanaActiva === "liquidaciones" && <PestanaLiquidaciones puedeEditar={puedeEditar} />}
      {pestanaActiva === "marcaciones" && <PestanaMarcaciones puedeEditar={puedeEditar} />}
      </div>
    </div>
  );
}

// Pie de las tablas de montos (como el de Facturas emitidas): cuántos
// registros hay en lo filtrado y su total.
function PieTotalNomina({ cantidad, total, etiqueta = "TOTAL USD" }: { cantidad: number; total: number; etiqueta?: string }) {
  if (cantidad === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 px-4 py-2.5 border-t-2 border-gray-900 dark:border-gray-200">
      <span className="font-mono text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {cantidad} registro{cantidad === 1 ? "" : "s"}
      </span>
      <span className="text-sm font-bold text-gray-900 dark:text-gray-50">
        {etiqueta} <span className="font-mono tabular-nums ml-2">{total.toFixed(2)}</span>
      </span>
    </div>
  );
}

// --- Rol de Pagos ---
function PestanaRolDePagos({ puedeEditar }: { puedeEditar: boolean }) {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const { data: empleados } = useEmpleadosActivos();
  const hoy = new Date();

  const [empleadoId, setEmpleadoId] = useState("");
  const [anio, setAnio] = useState(String(hoy.getFullYear()));
  const [mes, setMes] = useState(String(hoy.getMonth() + 1));
  const [horasSuplementarias, setHorasSuplementarias] = useState("0");
  const [horasExtraordinarias, setHorasExtraordinarias] = useState("0");
  const [otrosIngresos, setOtrosIngresos] = useState("0");
  const [otrosDescuentos, setOtrosDescuentos] = useState("0");
  const [otrosDescuentosDetalle, setOtrosDescuentosDetalle] = useState("");
  const [avisoHoras, setAvisoHoras] = useState<string | null>(null);

  const { data: roles } = useQuery({
    queryKey: ["nomina-rol-pagos"],
    queryFn: async () => (await api.get<RespuestaPaginada<RolDePagos>>("/nomina/rol-pagos", { params: { page: 1, pageSize: 50 } })).data,
    placeholderData: keepPreviousData,
  });

  const generar = useMutation({
    mutationFn: async () =>
      api.post("/nomina/rol-pagos", {
        empleadoId: Number(empleadoId),
        anio: Number(anio),
        mes: Number(mes),
        horasSuplementarias: Number(horasSuplementarias),
        horasExtraordinarias: Number(horasExtraordinarias),
        otrosIngresos: parseFloat(otrosIngresos) || 0,
        otrosDescuentos: parseFloat(otrosDescuentos) || 0,
        otrosDescuentosDetalle: otrosDescuentosDetalle || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nomina-rol-pagos"] });
      setHorasSuplementarias("0");
      setHorasExtraordinarias("0");
      setOtrosIngresos("0");
      setOtrosDescuentos("0");
      setOtrosDescuentosDetalle("");
      mostrarToast("Rol de pagos generado", "success");
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al generar el rol de pagos"),
  });

  const pagar = useMutation({
    mutationFn: async (id: number) => api.post(`/nomina/rol-pagos/${id}/pagar`, { formaPago: "OTRO" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["nomina-rol-pagos"] }),
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al pagar el rol de pagos"),
  });

  // Sugiere horasSuplementarias a partir de las marcaciones ya registradas
  // (nunca las clasifica en extraordinarias — eso queda a criterio del
  // admin, ver utils/horasTrabajadas.ts). Nunca envía el formulario por su
  // cuenta: solo rellena los campos para que el admin los revise.
  const sugerirHoras = useMutation({
    mutationFn: async () =>
      (
        await api.get<HorasTrabajadas>("/marcaciones/horas-trabajadas", {
          params: { empleadoId: Number(empleadoId), anio: Number(anio), mes: Number(mes) },
        })
      ).data,
    onSuccess: (data) => {
      if (data.horasEsperadasDelMes == null) {
        setAvisoHoras(
          `Trabajó ${data.horasTrabajadas.toFixed(1)} h en el período — configura su horario esperado en Empleados para poder sugerir horas de más.`
        );
      } else {
        const horasDeMas = Math.max(0, data.horasTrabajadas - data.horasEsperadasDelMes);
        setHorasSuplementarias(horasDeMas.toFixed(1));
        setAvisoHoras(
          `Trabajó ${data.horasTrabajadas.toFixed(1)} h de ${data.horasEsperadasDelMes.toFixed(1)} h esperadas — se sugirieron ${horasDeMas.toFixed(1)} h como suplementarias. Revísalas antes de guardar (algunas podrían ser extraordinarias si fueron nocturnas o en fin de semana).`
        );
      }
      if (data.anomalias.length > 0) {
        setAvisoHoras(
          (previo) =>
            `${previo ?? ""} ⚠ ${data.anomalias.length} marcación(es) sin pareja en este período — revísalas en la pestaña Marcaciones.`
        );
      }
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al calcular las horas trabajadas"),
  });

  // Buscador de la pestaña (en el navegador: los roles ya vienen cargados).
  const filtros = useFiltrosListado(sinPaginacion);
  const rolesFiltrados = filtrarLocal(roles?.datos, filtros, {
    textos: (r) => [r.empleado.nombres, r.empleado.apellidos, `${MESES[r.mes - 1]} ${r.anio}`, r.netoAPagar],
  });

  return (
    <div>
      {puedeEditar && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            generar.mutate();
          }}
          className="bg-stone-50 dark:bg-gray-900/40 p-4 rounded-sm border border-stone-300 dark:border-gray-700 mb-4 grid grid-cols-3 gap-3"
        >
          <select
            required
            value={empleadoId}
            onChange={(e) => setEmpleadoId(e.target.value)}
            className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
          >
            <option value="">Empleado...</option>
            {empleados?.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.nombres} {emp.apellidos}</option>
            ))}
          </select>
          <select value={mes} onChange={(e) => setMes(e.target.value)} className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm">
            {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <input type="number" value={anio} onChange={(e) => setAnio(e.target.value)} className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm" />
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Horas suplementarias (50%)</label>
            <input type="number" min="0" value={horasSuplementarias} onChange={(e) => setHorasSuplementarias(e.target.value)} className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm w-full" />
          </div>
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Horas extraordinarias (100%)</label>
            <input type="number" min="0" value={horasExtraordinarias} onChange={(e) => setHorasExtraordinarias(e.target.value)} className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm w-full" />
          </div>
          <div className="col-span-3 -mt-1">
            <button
              type="button"
              disabled={!empleadoId || sugerirHoras.isPending}
              onClick={() => {
                setAvisoHoras(null);
                sugerirHoras.mutate();
              }}
              className="text-xs font-medium text-brand-700 dark:text-brand-300 hover:underline disabled:opacity-40 disabled:no-underline"
            >
              {sugerirHoras.isPending ? "Calculando..." : "Sugerir desde marcaciones"}
            </button>
            {avisoHoras && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{avisoHoras}</p>}
          </div>
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Otros ingresos (bonos/comisiones)</label>
            <input type="number" step="0.01" min="0" value={otrosIngresos} onChange={(e) => setOtrosIngresos(e.target.value)} className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm w-full" />
          </div>
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Otros descuentos (anticipos)</label>
            <input type="number" step="0.01" min="0" value={otrosDescuentos} onChange={(e) => setOtrosDescuentos(e.target.value)} className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm w-full" />
          </div>
          <input placeholder="Detalle del descuento (opcional)" value={otrosDescuentosDetalle} onChange={(e) => setOtrosDescuentosDetalle(e.target.value)} className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm col-span-2" />
          <button type="submit" disabled={generar.isPending} className="bg-brand-700 text-white py-2 rounded-sm text-sm font-semibold hover:bg-brand-800 disabled:opacity-50">
            {generar.isPending ? "Generando..." : "Generar rol de pagos"}
          </button>
          {generar.isError && <p className="col-span-3 text-red-600 dark:text-red-400 text-sm">{(generar.error as any)?.response?.data?.error ?? "Error"}</p>}
        </form>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-sm border border-stone-300 dark:border-gray-700 overflow-hidden">
        <BarraBuscadorDocumentos
          filtros={filtros}
          etiquetaBusqueda="Buscar · empleado o período"
          placeholder="Ej: Pérez, Enero 2026..."
          mostrarPago={false}
          mostrarFechas={false}
        />
        <table className="w-full text-sm">
          <thead className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700 text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 [&_th]:font-medium">
            <tr>
              <th className="px-4 py-2">Empleado</th>
              <th className="px-4 py-2">Período</th>
              <th className="px-4 py-2 text-right">Neto a pagar</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {roles?.datos.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">Sin roles de pago generados</td></tr>
            )}
            {rolesFiltrados?.map((r) => (
              <tr key={r.id} className="border-t border-stone-100 dark:border-gray-700">
                <td className="px-4 py-2"><Resaltar texto={`${r.empleado.nombres} ${r.empleado.apellidos}`} termino={filtros.busquedaAplicada} /></td>
                <td className="px-4 py-2"><Resaltar texto={`${MESES[r.mes - 1]} ${r.anio}`} termino={filtros.busquedaAplicada} /></td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">${r.netoAPagar}</td>
                <td className="px-4 py-2"><EstadoBadge estado={r.estado} /></td>
                <td className="px-4 py-2 text-right space-x-3">
                  <button onClick={() => abrirPdfEnNuevaPestana(`/nomina/rol-pagos/${r.id}/pdf`)} className="text-brand-700 dark:text-brand-300 hover:underline text-xs font-medium">Ver PDF</button>
                  {r.estado === "PENDIENTE" && puedeEditar && (
                    <button onClick={() => pagar.mutate(r.id)} disabled={pagar.isPending} className="text-emerald-700 dark:text-emerald-400 hover:underline text-xs font-medium disabled:opacity-40">
                      {pagar.isPending ? "Pagando..." : "Pagar"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <PieTotalNomina cantidad={rolesFiltrados?.length ?? 0} total={(rolesFiltrados ?? []).reduce((a, r) => a + Number(r.netoAPagar), 0)} etiqueta="TOTAL NETO A PAGAR USD" />
      </div>
    </div>
  );
}

// --- Décimos ---
function PestanaDecimos({ puedeEditar }: { puedeEditar: boolean }) {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const { data: empleados } = useEmpleadosActivos();
  const anioActual = new Date().getFullYear();

  const [empleadoIdTercero, setEmpleadoIdTercero] = useState("");
  const [anioTercero, setAnioTercero] = useState(String(anioActual));
  const [empleadoIdCuarto, setEmpleadoIdCuarto] = useState("");
  const [anioCuarto, setAnioCuarto] = useState(String(anioActual));

  const { data: terceros } = useQuery({
    queryKey: ["nomina-decimo-tercero"],
    queryFn: async () => (await api.get<DecimoTercero[]>("/nomina/decimos/tercero")).data,
  });
  const { data: cuartos } = useQuery({
    queryKey: ["nomina-decimo-cuarto"],
    queryFn: async () => (await api.get<DecimoCuarto[]>("/nomina/decimos/cuarto")).data,
  });

  const calcularTercero = useMutation({
    mutationFn: async () => api.post("/nomina/decimos/tercero", { empleadoId: Number(empleadoIdTercero), anio: Number(anioTercero) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nomina-decimo-tercero"] });
      mostrarToast("Décimo tercero calculado", "success");
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al calcular"),
  });
  const calcularCuarto = useMutation({
    mutationFn: async () => api.post("/nomina/decimos/cuarto", { empleadoId: Number(empleadoIdCuarto), anio: Number(anioCuarto) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nomina-decimo-cuarto"] });
      mostrarToast("Décimo cuarto calculado", "success");
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al calcular"),
  });
  const pagarTercero = useMutation({
    mutationFn: async (id: number) => api.post(`/nomina/decimos/tercero/${id}/pagar`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["nomina-decimo-tercero"] }),
  });
  const pagarCuarto = useMutation({
    mutationFn: async (id: number) => api.post(`/nomina/decimos/cuarto/${id}/pagar`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["nomina-decimo-cuarto"] }),
  });

  // Un buscador por tabla (en el navegador: los cálculos ya vienen cargados).
  const filtrosTercero = useFiltrosListado(sinPaginacion);
  const filtrosCuarto = useFiltrosListado(sinPaginacion);
  const tercerosFiltrados = filtrarLocal(terceros, filtrosTercero, {
    textos: (d) => [d.empleado.nombres, d.empleado.apellidos, d.anio],
  });
  const cuartosFiltrados = filtrarLocal(cuartos, filtrosCuarto, {
    textos: (d) => [d.empleado.nombres, d.empleado.apellidos, d.anio],
  });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-mono text-[11px] uppercase tracking-[0.15em] text-gray-600 dark:text-gray-300 mb-2">Décimo Tercero (bono navideño)</h3>
        {puedeEditar && (
          <form onSubmit={(e) => { e.preventDefault(); calcularTercero.mutate(); }} className="bg-stone-50 dark:bg-gray-900/40 p-3 rounded-sm border border-stone-300 dark:border-gray-700 mb-3 flex gap-2 items-end flex-wrap">
            <select required value={empleadoIdTercero} onChange={(e) => setEmpleadoIdTercero(e.target.value)} className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm">
              <option value="">Empleado...</option>
              {empleados?.map((emp) => <option key={emp.id} value={emp.id}>{emp.nombres} {emp.apellidos}</option>)}
            </select>
            <input type="number" value={anioTercero} onChange={(e) => setAnioTercero(e.target.value)} className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm w-24" />
            <button type="submit" disabled={calcularTercero.isPending} className="bg-brand-700 text-white px-3 py-2 rounded-sm text-sm font-semibold hover:bg-brand-800 disabled:opacity-50">Calcular</button>
            {calcularTercero.isError && <p className="text-red-600 dark:text-red-400 text-xs w-full">{(calcularTercero.error as any)?.response?.data?.error}</p>}
          </form>
        )}
        <div className="bg-white dark:bg-gray-800 rounded-sm border border-stone-300 dark:border-gray-700 overflow-hidden">
          <BarraBuscadorDocumentos
            filtros={filtrosTercero}
            etiquetaBusqueda="Buscar · empleado o año"
            placeholder="Ej: Pérez, 2025..."
            mostrarPago={false}
            mostrarFechas={false}
          />
          <table className="w-full text-sm">
            <thead className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700 text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 [&_th]:font-medium">
              <tr><th className="px-4 py-2">Empleado</th><th className="px-4 py-2">Año</th><th className="px-4 py-2 text-right">Valor</th><th className="px-4 py-2">Estado</th><th className="px-4 py-2"></th></tr>
            </thead>
            <tbody>
              {tercerosFiltrados?.length === 0 && <tr><td colSpan={5} className="px-4 py-3 text-center text-gray-400 dark:text-gray-500">{filtrosTercero.hayFiltros ? "Ningún cálculo coincide con la búsqueda." : "Sin cálculos todavía"}</td></tr>}
              {tercerosFiltrados?.map((d) => (
                <tr key={d.id} className="border-t border-stone-100 dark:border-gray-700">
                  <td className="px-4 py-2"><Resaltar texto={`${d.empleado.nombres} ${d.empleado.apellidos}`} termino={filtrosTercero.busquedaAplicada} /></td>
                  <td className="px-4 py-2">{d.anio}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">${d.valor}</td>
                  <td className="px-4 py-2"><EstadoBadge estado={d.estado} /></td>
                  <td className="px-4 py-2 text-right space-x-3">
                    <button onClick={() => abrirPdfEnNuevaPestana(`/nomina/decimos/tercero/${d.id}/pdf`)} className="text-brand-700 dark:text-brand-300 hover:underline text-xs font-medium">Ver PDF</button>
                    {d.estado === "PENDIENTE" && puedeEditar && <button onClick={() => pagarTercero.mutate(d.id)} className="text-emerald-700 dark:text-emerald-400 hover:underline text-xs font-medium">Pagar</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <PieTotalNomina cantidad={tercerosFiltrados?.length ?? 0} total={(tercerosFiltrados ?? []).reduce((a, d) => a + Number(d.valor), 0)} />
        </div>
      </div>

      <div>
        <h3 className="font-mono text-[11px] uppercase tracking-[0.15em] text-gray-600 dark:text-gray-300 mb-2">Décimo Cuarto (bono escolar)</h3>
        {puedeEditar && (
          <form onSubmit={(e) => { e.preventDefault(); calcularCuarto.mutate(); }} className="bg-stone-50 dark:bg-gray-900/40 p-3 rounded-sm border border-stone-300 dark:border-gray-700 mb-3 flex gap-2 items-end flex-wrap">
            <select required value={empleadoIdCuarto} onChange={(e) => setEmpleadoIdCuarto(e.target.value)} className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm">
              <option value="">Empleado...</option>
              {empleados?.map((emp) => <option key={emp.id} value={emp.id}>{emp.nombres} {emp.apellidos}</option>)}
            </select>
            <input type="number" value={anioCuarto} onChange={(e) => setAnioCuarto(e.target.value)} className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm w-24" />
            <button type="submit" disabled={calcularCuarto.isPending} className="bg-brand-700 text-white px-3 py-2 rounded-sm text-sm font-semibold hover:bg-brand-800 disabled:opacity-50">Calcular</button>
            {calcularCuarto.isError && <p className="text-red-600 dark:text-red-400 text-xs w-full">{(calcularCuarto.error as any)?.response?.data?.error}</p>}
          </form>
        )}
        <div className="bg-white dark:bg-gray-800 rounded-sm border border-stone-300 dark:border-gray-700 overflow-hidden">
          <BarraBuscadorDocumentos
            filtros={filtrosCuarto}
            etiquetaBusqueda="Buscar · empleado o año"
            placeholder="Ej: Pérez, 2025..."
            mostrarPago={false}
            mostrarFechas={false}
          />
          <table className="w-full text-sm">
            <thead className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700 text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 [&_th]:font-medium">
              <tr><th className="px-4 py-2">Empleado</th><th className="px-4 py-2">Año</th><th className="px-4 py-2">Meses</th><th className="px-4 py-2 text-right">Valor</th><th className="px-4 py-2">Estado</th><th className="px-4 py-2"></th></tr>
            </thead>
            <tbody>
              {cuartosFiltrados?.length === 0 && <tr><td colSpan={6} className="px-4 py-3 text-center text-gray-400 dark:text-gray-500">{filtrosCuarto.hayFiltros ? "Ningún cálculo coincide con la búsqueda." : "Sin cálculos todavía"}</td></tr>}
              {cuartosFiltrados?.map((d) => (
                <tr key={d.id} className="border-t border-stone-100 dark:border-gray-700">
                  <td className="px-4 py-2"><Resaltar texto={`${d.empleado.nombres} ${d.empleado.apellidos}`} termino={filtrosCuarto.busquedaAplicada} /></td>
                  <td className="px-4 py-2">{d.anio}</td>
                  <td className="px-4 py-2">{d.mesesLaborados}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">${d.valor}</td>
                  <td className="px-4 py-2"><EstadoBadge estado={d.estado} /></td>
                  <td className="px-4 py-2 text-right space-x-3">
                    <button onClick={() => abrirPdfEnNuevaPestana(`/nomina/decimos/cuarto/${d.id}/pdf`)} className="text-brand-700 dark:text-brand-300 hover:underline text-xs font-medium">Ver PDF</button>
                    {d.estado === "PENDIENTE" && puedeEditar && <button onClick={() => pagarCuarto.mutate(d.id)} className="text-emerald-700 dark:text-emerald-400 hover:underline text-xs font-medium">Pagar</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <PieTotalNomina cantidad={cuartosFiltrados?.length ?? 0} total={(cuartosFiltrados ?? []).reduce((a, d) => a + Number(d.valor), 0)} />
        </div>
      </div>
    </div>
  );
}

// --- Vacaciones ---
function PestanaVacaciones({ puedeEditar }: { puedeEditar: boolean }) {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const { data: empleados } = useEmpleadosActivos();

  const [empleadoIdSaldo, setEmpleadoIdSaldo] = useState("");
  const [empleadoId, setEmpleadoId] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [diasTomados, setDiasTomados] = useState("1");
  const [pagarEnDinero, setPagarEnDinero] = useState(false);

  const { data: saldo } = useQuery({
    queryKey: ["nomina-vacaciones-saldo", empleadoIdSaldo],
    queryFn: async () => (await api.get<SaldoVacaciones>(`/nomina/vacaciones/${empleadoIdSaldo}/saldo`)).data,
    enabled: empleadoIdSaldo !== "",
  });

  const { data: historial } = useQuery({
    queryKey: ["nomina-vacaciones"],
    queryFn: async () => (await api.get<Vacacion[]>("/nomina/vacaciones")).data,
  });

  const registrar = useMutation({
    mutationFn: async () =>
      api.post("/nomina/vacaciones", {
        empleadoId: Number(empleadoId),
        fechaInicio,
        fechaFin,
        diasTomados: Number(diasTomados),
        pagarEnDinero,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nomina-vacaciones"] });
      queryClient.invalidateQueries({ queryKey: ["nomina-vacaciones-saldo"] });
      setFechaInicio("");
      setFechaFin("");
      setDiasTomados("1");
      setPagarEnDinero(false);
      mostrarToast("Vacaciones registradas", "success");
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al registrar"),
  });

  // Buscador del historial (en el navegador: ya viene cargado).
  const filtros = useFiltrosListado(sinPaginacion);
  const historialFiltrado = filtrarLocal(historial, filtros, {
    textos: (v) => [v.empleado.nombres, v.empleado.apellidos],
  });

  return (
    <div className="space-y-4">
      <div className="bg-stone-50 dark:bg-gray-900/40 p-4 rounded-sm border border-stone-300 dark:border-gray-700">
        <h3 className="font-mono text-[11px] uppercase tracking-[0.15em] text-gray-600 dark:text-gray-300 mb-2">Consultar saldo disponible</h3>
        <select value={empleadoIdSaldo} onChange={(e) => setEmpleadoIdSaldo(e.target.value)} className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm w-full mb-2">
          <option value="">Empleado...</option>
          {empleados?.map((emp) => <option key={emp.id} value={emp.id}>{emp.nombres} {emp.apellidos}</option>)}
        </select>
        {saldo && (
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Acumulados: <strong>{saldo.diasAcumulados}</strong> · Tomados: <strong>{saldo.diasTomados}</strong> · Disponibles: <strong className="text-emerald-700 dark:text-emerald-400">{saldo.diasDisponibles}</strong>
          </p>
        )}
      </div>

      {puedeEditar && (
        <form onSubmit={(e) => { e.preventDefault(); registrar.mutate(); }} className="bg-stone-50 dark:bg-gray-900/40 p-4 rounded-sm border border-stone-300 dark:border-gray-700 grid grid-cols-2 gap-3">
          <select required value={empleadoId} onChange={(e) => setEmpleadoId(e.target.value)} className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm col-span-2">
            <option value="">Empleado...</option>
            {empleados?.map((emp) => <option key={emp.id} value={emp.id}>{emp.nombres} {emp.apellidos}</option>)}
          </select>
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Fecha inicio</label>
            <input type="date" required value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm w-full" />
          </div>
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Fecha fin</label>
            <input type="date" required value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm w-full" />
          </div>
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Días</label>
            <input type="number" min="1" required value={diasTomados} onChange={(e) => setDiasTomados(e.target.value)} className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm w-full" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={pagarEnDinero} onChange={(e) => setPagarEnDinero(e.target.checked)} />
            Pagar en dinero (no gozadas)
          </label>
          <button type="submit" disabled={registrar.isPending} className="col-span-2 bg-brand-700 text-white py-2 rounded-sm text-sm font-semibold hover:bg-brand-800 disabled:opacity-50">
            {registrar.isPending ? "Guardando..." : "Registrar vacaciones"}
          </button>
          {registrar.isError && <p className="col-span-2 text-red-600 dark:text-red-400 text-sm">{(registrar.error as any)?.response?.data?.error}</p>}
        </form>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-sm border border-stone-300 dark:border-gray-700 overflow-hidden">
        <BarraBuscadorDocumentos
          filtros={filtros}
          etiquetaBusqueda="Buscar · empleado"
          placeholder="Ej: Pérez..."
          mostrarPago={false}
          mostrarFechas={false}
        />
        <table className="w-full text-sm">
          <thead className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700 text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 [&_th]:font-medium">
            <tr><th className="px-4 py-2">Empleado</th><th className="px-4 py-2">Período</th><th className="px-4 py-2">Días</th><th className="px-4 py-2 text-right">Valor pagado</th><th className="px-4 py-2"></th></tr>
          </thead>
          <tbody>
            {historialFiltrado?.length === 0 && <tr><td colSpan={5} className="px-4 py-3 text-center text-gray-400 dark:text-gray-500">{filtros.hayFiltros ? "Ningún registro coincide con la búsqueda." : "Sin registros"}</td></tr>}
            {historialFiltrado?.map((v) => (
              <tr key={v.id} className="border-t border-stone-100 dark:border-gray-700">
                <td className="px-4 py-2"><Resaltar texto={`${v.empleado.nombres} ${v.empleado.apellidos}`} termino={filtros.busquedaAplicada} /></td>
                <td className="px-4 py-2">{new Date(v.fechaInicio).toLocaleDateString("es-EC")} - {new Date(v.fechaFin).toLocaleDateString("es-EC")}</td>
                <td className="px-4 py-2">{v.diasTomados}</td>
                <td className="px-4 py-2 text-right">{v.valorPagado ? `$${v.valorPagado}` : "—"}</td>
                <td className="px-4 py-2 text-right">
                  {v.valorPagado && <button onClick={() => abrirPdfEnNuevaPestana(`/nomina/vacaciones/${v.id}/pdf`)} className="text-brand-700 dark:text-brand-300 hover:underline text-xs font-medium">Ver PDF</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- Utilidades ---
function PestanaUtilidades({ puedeEditar }: { puedeEditar: boolean }) {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const [anio, setAnio] = useState(String(new Date().getFullYear() - 1));
  const [anioVerDetalle, setAnioVerDetalle] = useState("");

  const { data: historial } = useQuery({
    queryKey: ["nomina-utilidades"],
    queryFn: async () => (await api.get<Utilidad[]>("/nomina/utilidades")).data,
  });

  const { data: detalle } = useQuery({
    queryKey: ["nomina-utilidades-detalle", anioVerDetalle],
    queryFn: async () => (await api.get<Utilidad>(`/nomina/utilidades/${anioVerDetalle}`)).data,
    enabled: anioVerDetalle !== "",
  });

  const calcular = useMutation({
    mutationFn: async () => api.post("/nomina/utilidades/calcular", { anio: Number(anio) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nomina-utilidades"] });
      mostrarToast("Utilidades calculadas", "success");
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al calcular las utilidades"),
  });

  return (
    <div className="space-y-4">
      {puedeEditar && (
        <form onSubmit={(e) => { e.preventDefault(); calcular.mutate(); }} className="bg-stone-50 dark:bg-gray-900/40 p-4 rounded-sm border border-stone-300 dark:border-gray-700 flex gap-2 items-end flex-wrap">
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Año a repartir</label>
            <input type="number" value={anio} onChange={(e) => setAnio(e.target.value)} className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm w-24" />
          </div>
          <button type="submit" disabled={calcular.isPending} className="bg-brand-700 text-white px-4 py-2 rounded-sm text-sm font-semibold hover:bg-brand-800 disabled:opacity-50">
            {calcular.isPending ? "Calculando..." : "Calcular utilidades"}
          </button>
          {calcular.isError && <p className="text-red-600 dark:text-red-400 text-sm w-full">{(calcular.error as any)?.response?.data?.error}</p>}
        </form>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-sm border border-stone-300 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700 text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 [&_th]:font-medium">
            <tr><th className="px-4 py-2">Año</th><th className="px-4 py-2 text-right">Utilidad neta</th><th className="px-4 py-2 text-right">15% a repartir</th><th className="px-4 py-2"></th></tr>
          </thead>
          <tbody>
            {historial?.length === 0 && <tr><td colSpan={4} className="px-4 py-3 text-center text-gray-400 dark:text-gray-500">Sin cálculos todavía</td></tr>}
            {historial?.map((u) => (
              <tr key={u.id} className="border-t border-stone-100 dark:border-gray-700">
                <td className="px-4 py-2">{u.anio}</td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">${u.utilidadNetaEmpresa}</td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">${u.monto15Porciento}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => setAnioVerDetalle(anioVerDetalle === String(u.anio) ? "" : String(u.anio))} className="text-brand-700 dark:text-brand-300 hover:underline text-xs font-medium">
                    {anioVerDetalle === String(u.anio) ? "Ocultar" : "Ver reparto"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detalle && (
        <div className="bg-white dark:bg-gray-800 rounded-sm border border-stone-300 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700 text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 [&_th]:font-medium">
              <tr><th className="px-4 py-2">Empleado</th><th className="px-4 py-2">Días trabajados</th><th className="px-4 py-2 text-right">10% días</th><th className="px-4 py-2 text-right">5% cargas</th><th className="px-4 py-2 text-right">Total</th></tr>
            </thead>
            <tbody>
              {detalle.detalles.map((d) => (
                <tr key={d.id} className="border-t border-stone-100 dark:border-gray-700">
                  <td className="px-4 py-2">{d.empleado.nombres} {d.empleado.apellidos}</td>
                  <td className="px-4 py-2">{d.diasTrabajados}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">${d.valorPorDias}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">${d.valorPorCargas}</td>
                  <td className="px-4 py-2 text-right font-medium">${d.totalEmpleado}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// --- Liquidaciones ---
function PestanaLiquidaciones({ puedeEditar }: { puedeEditar: boolean }) {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const { data: empleados } = useEmpleadosActivos();

  const [empleadoId, setEmpleadoId] = useState("");
  const [fechaSalida, setFechaSalida] = useState("");
  const [motivoSalida, setMotivoSalida] = useState("RENUNCIA_VOLUNTARIA");

  const { data: liquidaciones } = useQuery({
    queryKey: ["nomina-liquidaciones"],
    queryFn: async () => (await api.get<Liquidacion[]>("/nomina/liquidaciones")).data,
  });

  const calcular = useMutation({
    mutationFn: async () => api.post("/nomina/liquidaciones", { empleadoId: Number(empleadoId), fechaSalida, motivoSalida }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nomina-liquidaciones"] });
      mostrarToast("Liquidación calculada — es un valor PRELIMINAR, revísalo antes de pagar", "success");
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al calcular la liquidación"),
  });

  // Buscador de la pestaña (en el navegador: ya vienen cargadas).
  const filtros = useFiltrosListado(sinPaginacion);
  const liquidacionesFiltradas = filtrarLocal(liquidaciones, filtros, {
    textos: (l) => [l.empleado.nombres, l.empleado.apellidos, l.motivoSalida],
  });

  return (
    <div className="space-y-4">
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-sm p-3">
        <p className="text-xs text-red-800 dark:text-red-300 font-medium">
          ⚠ Esto es una calculadora de referencia, no un documento legal final. Confirma la indemnización y
          bonificación por desahucio con un contador o abogado laboral antes de pagar una liquidación real.
        </p>
      </div>

      {puedeEditar && (
        <form onSubmit={(e) => { e.preventDefault(); calcular.mutate(); }} className="bg-stone-50 dark:bg-gray-900/40 p-4 rounded-sm border border-stone-300 dark:border-gray-700 grid grid-cols-3 gap-3">
          <select required value={empleadoId} onChange={(e) => setEmpleadoId(e.target.value)} className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm">
            <option value="">Empleado...</option>
            {empleados?.map((emp) => <option key={emp.id} value={emp.id}>{emp.nombres} {emp.apellidos}</option>)}
          </select>
          <input type="date" required value={fechaSalida} onChange={(e) => setFechaSalida(e.target.value)} className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm" />
          <select value={motivoSalida} onChange={(e) => setMotivoSalida(e.target.value)} className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm">
            <option value="RENUNCIA_VOLUNTARIA">Renuncia voluntaria</option>
            <option value="DESPIDO_INTEMPESTIVO">Despido intempestivo</option>
            <option value="MUTUO_ACUERDO">Mutuo acuerdo</option>
            <option value="VISTO_BUENO">Visto bueno</option>
            <option value="OTRO">Otro</option>
          </select>
          <button type="submit" disabled={calcular.isPending} className="col-span-3 bg-brand-700 text-white py-2 rounded-sm text-sm font-semibold hover:bg-brand-800 disabled:opacity-50">
            {calcular.isPending ? "Calculando..." : "Calcular liquidación"}
          </button>
          {calcular.isError && <p className="col-span-3 text-red-600 dark:text-red-400 text-sm">{(calcular.error as any)?.response?.data?.error}</p>}
        </form>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-sm border border-stone-300 dark:border-gray-700 overflow-hidden">
        <BarraBuscadorDocumentos
          filtros={filtros}
          etiquetaBusqueda="Buscar · empleado o motivo de salida"
          placeholder="Ej: Pérez, renuncia..."
          mostrarPago={false}
          mostrarFechas={false}
        />
        <table className="w-full text-sm">
          <thead className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700 text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 [&_th]:font-medium">
            <tr><th className="px-4 py-2">Empleado</th><th className="px-4 py-2">Fecha salida</th><th className="px-4 py-2">Motivo</th><th className="px-4 py-2 text-right">Total</th><th className="px-4 py-2"></th></tr>
          </thead>
          <tbody>
            {liquidacionesFiltradas?.length === 0 && <tr><td colSpan={5} className="px-4 py-3 text-center text-gray-400 dark:text-gray-500">{filtros.hayFiltros ? "Ninguna liquidación coincide con la búsqueda." : "Sin liquidaciones calculadas"}</td></tr>}
            {liquidacionesFiltradas?.map((l) => (
              <tr key={l.id} className="border-t border-stone-100 dark:border-gray-700">
                <td className="px-4 py-2"><Resaltar texto={`${l.empleado.nombres} ${l.empleado.apellidos}`} termino={filtros.busquedaAplicada} /></td>
                <td className="px-4 py-2">{new Date(l.fechaSalida).toLocaleDateString("es-EC")}</td>
                <td className="px-4 py-2"><Resaltar texto={l.motivoSalida} termino={filtros.busquedaAplicada} /></td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">${l.totalLiquidacion}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => abrirPdfEnNuevaPestana(`/nomina/liquidaciones/${l.id}/pdf`)} className="text-brand-700 dark:text-brand-300 hover:underline text-xs font-medium">Ver PDF</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <PieTotalNomina cantidad={liquidacionesFiltradas?.length ?? 0} total={(liquidacionesFiltradas ?? []).reduce((a, l) => a + Number(l.totalLiquidacion), 0)} />
      </div>
    </div>
  );
}

// --- Marcaciones ---
function PestanaMarcaciones({ puedeEditar }: { puedeEditar: boolean }) {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const { data: empleados } = useEmpleadosActivos();

  const [empleadoIdFiltro, setEmpleadoIdFiltro] = useState("");
  const [pagina, setPagina] = useState(1);

  const [empleadoIdManual, setEmpleadoIdManual] = useState("");
  const [tipoManual, setTipoManual] = useState<"ENTRADA" | "SALIDA">("ENTRADA");
  const [observacionManual, setObservacionManual] = useState("");
  const [marcacionSeleccionada, setMarcacionSeleccionada] = useState<Marcacion | null>(null);
  const [exportando, setExportando] = useState(false);

  const { data: respuesta } = useQuery({
    queryKey: ["nomina-marcaciones", empleadoIdFiltro, pagina],
    queryFn: async () =>
      (
        await api.get<RespuestaPaginada<Marcacion>>("/marcaciones", {
          params: { page: pagina, pageSize: 20, empleadoId: empleadoIdFiltro || undefined },
        })
      ).data,
    placeholderData: keepPreviousData,
  });
  const marcaciones = respuesta?.datos;

  const registrarManual = useMutation({
    mutationFn: async () =>
      api.post("/marcaciones", { empleadoId: Number(empleadoIdManual), tipo: tipoManual, observacion: observacionManual }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nomina-marcaciones"] });
      setEmpleadoIdManual("");
      setObservacionManual("");
      mostrarToast("Marcación manual registrada", "success");
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al registrar la marcación"),
  });

  // Exporta TODO el historial que coincide con el filtro actual (no solo
  // los 20 de la página visible) — pide sin "page" para que el backend
  // devuelva el arreglo completo, mismo criterio que ya usa el selector de
  // empleado en Nómina (ver utils/paginacion.ts).
  async function exportarExcel() {
    setExportando(true);
    try {
      const todas = (
        await api.get<Marcacion[]>("/marcaciones", { params: { empleadoId: empleadoIdFiltro || undefined } })
      ).data;

      const datosHoja = todas.map((m) => ({
        Empleado: `${m.empleado.nombres} ${m.empleado.apellidos}`,
        Cédula: m.empleado.cedula,
        Tipo: m.tipo === "ENTRADA" ? "Entrada" : "Salida",
        Fecha: new Date(m.fecha).toLocaleDateString("es-EC"),
        Hora: new Date(m.fecha).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" }),
        Tardanza: m.tardanza === true ? "Sí" : m.tardanza === false ? "No" : "—",
        "Dentro de geocerca": m.dentroDeGeocerca === true ? "Sí" : m.dentroDeGeocerca === false ? "No" : "—",
        Manual: m.creadaManualmente ? "Sí" : "No",
        Observación: m.observacion ?? "",
      }));

      const hoja = XLSX.utils.json_to_sheet(datosHoja);
      const libro = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(libro, hoja, "Marcaciones");
      const sufijoEmpleado = empleadoIdFiltro
        ? `_${empleados?.find((e) => String(e.id) === empleadoIdFiltro)?.nombres ?? empleadoIdFiltro}`
        : "";
      XLSX.writeFile(libro, `marcaciones${sufijoEmpleado}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (error: any) {
      mostrarToast(error.response?.data?.error ?? "Error al exportar las marcaciones");
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-stone-50 dark:bg-gray-900/40 p-3 rounded-sm border border-stone-300 dark:border-gray-700 flex items-end justify-between gap-3">
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Filtrar por empleado</label>
          <select
            value={empleadoIdFiltro}
            onChange={(e) => {
              setEmpleadoIdFiltro(e.target.value);
              setPagina(1);
            }}
            className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
          >
            <option value="">Todos los empleados</option>
            {empleados?.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.nombres} {emp.apellidos}</option>
            ))}
          </select>
        </div>
        <button
          onClick={exportarExcel}
          disabled={exportando || marcaciones?.length === 0}
          className="bg-brand-700 text-white px-4 py-1.5 rounded-sm text-sm font-semibold hover:bg-brand-800 disabled:opacity-40"
        >
          {exportando ? "Exportando..." : "Exportar a Excel"}
        </button>
      </div>

      {puedeEditar && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            registrarManual.mutate();
          }}
          className="bg-stone-50 dark:bg-gray-900/40 p-4 rounded-sm border border-stone-300 dark:border-gray-700 grid grid-cols-3 gap-3"
        >
          <select
            required
            value={empleadoIdManual}
            onChange={(e) => setEmpleadoIdManual(e.target.value)}
            className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
          >
            <option value="">Empleado...</option>
            {empleados?.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.nombres} {emp.apellidos}</option>
            ))}
          </select>
          <select
            value={tipoManual}
            onChange={(e) => setTipoManual(e.target.value as "ENTRADA" | "SALIDA")}
            className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
          >
            <option value="ENTRADA">Entrada</option>
            <option value="SALIDA">Salida</option>
          </select>
          <input
            placeholder="Observación (ej. olvidó marcar)"
            required
            value={observacionManual}
            onChange={(e) => setObservacionManual(e.target.value)}
            className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={registrarManual.isPending}
            className="col-span-3 bg-brand-700 text-white py-2 rounded-sm text-sm font-semibold hover:bg-brand-800 disabled:opacity-50"
          >
            {registrarManual.isPending ? "Guardando..." : "Registrar marcación manual (empleado olvidó marcar)"}
          </button>
          {registrarManual.isError && (
            <p className="col-span-3 text-red-600 dark:text-red-400 text-sm">
              {(registrarManual.error as any)?.response?.data?.error}
            </p>
          )}
        </form>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-sm border border-stone-300 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700 text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 [&_th]:font-medium">
            <tr>
              <th className="px-4 py-2">Empleado</th>
              <th className="px-4 py-2">Tipo</th>
              <th className="px-4 py-2">Fecha/hora</th>
              <th className="px-4 py-2">Avisos</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {marcaciones?.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">Sin marcaciones registradas</td></tr>
            )}
            {marcaciones?.map((m) => (
              <tr key={m.id} className="border-t border-stone-100 dark:border-gray-700">
                <td className="px-4 py-2">{m.empleado.nombres} {m.empleado.apellidos}</td>
                <td className="px-4 py-2">
                  <span className={`font-mono text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-sm ${m.tipo === "ENTRADA" ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" : "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300"}`}>
                    {m.tipo === "ENTRADA" ? "Entrada" : "Salida"}
                  </span>
                </td>
                <td className="px-4 py-2">{new Date(m.fecha).toLocaleString("es-EC", { dateStyle: "short", timeStyle: "short" })}</td>
                <td className="px-4 py-2 space-x-1.5">
                  {m.tardanza && (
                    <span className="font-mono text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-sm bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">Tardanza</span>
                  )}
                  {m.dentroDeGeocerca === false && (
                    <span className="font-mono text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-sm bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">Fuera de zona</span>
                  )}
                  {m.creadaManualmente && (
                    <span className="font-mono text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-sm bg-stone-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300" title={m.observacion ?? undefined}>
                      Manual
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  {m.latitud && m.longitud && (
                    <button
                      onClick={() => setMarcacionSeleccionada(m)}
                      className="text-brand-700 dark:text-brand-300 hover:underline text-xs font-medium"
                    >
                      Ver ubicación
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {respuesta && respuesta.paginacion.totalPaginas > 1 && (
          <div className="flex justify-center gap-2 py-3">
            <button
              disabled={pagina <= 1}
              onClick={() => setPagina((p) => p - 1)}
              className="text-xs px-2 py-1 border border-stone-300 dark:border-gray-600 rounded-sm disabled:opacity-40 text-gray-600 dark:text-gray-300"
            >
              Anterior
            </button>
            <span className="text-xs text-gray-500 dark:text-gray-400 self-center">
              Página {respuesta.paginacion.page} de {respuesta.paginacion.totalPaginas}
            </span>
            <button
              disabled={pagina >= respuesta.paginacion.totalPaginas}
              onClick={() => setPagina((p) => p + 1)}
              className="text-xs px-2 py-1 border border-stone-300 dark:border-gray-600 rounded-sm disabled:opacity-40 text-gray-600 dark:text-gray-300"
            >
              Siguiente
            </button>
          </div>
        )}
      </div>

      {marcacionSeleccionada && marcacionSeleccionada.latitud && marcacionSeleccionada.longitud && (
        <Modal
          titulo={`Ubicación de la marcación — ${marcacionSeleccionada.empleado.nombres} ${marcacionSeleccionada.empleado.apellidos}`}
          onCerrar={() => setMarcacionSeleccionada(null)}
        >
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            {marcacionSeleccionada.tipo === "ENTRADA" ? "Entrada" : "Salida"} del{" "}
            {new Date(marcacionSeleccionada.fecha).toLocaleString("es-EC", { dateStyle: "short", timeStyle: "short" })}
            {marcacionSeleccionada.dentroDeGeocerca === true && " — dentro de la geocerca configurada."}
            {marcacionSeleccionada.dentroDeGeocerca === false && " — FUERA de la geocerca configurada."}
            {marcacionSeleccionada.dentroDeGeocerca === null && " — sin geocerca configurada en ese momento."}
          </p>
          <MapaMarcacion
            latitud={Number(marcacionSeleccionada.latitud)}
            longitud={Number(marcacionSeleccionada.longitud)}
            dentroDeGeocerca={marcacionSeleccionada.dentroDeGeocerca}
            geocerca={
              marcacionSeleccionada.empleado.sucursal?.latitud &&
              marcacionSeleccionada.empleado.sucursal?.longitud &&
              marcacionSeleccionada.empleado.sucursal?.radioGeocercaMetros
                ? {
                    latitud: Number(marcacionSeleccionada.empleado.sucursal.latitud),
                    longitud: Number(marcacionSeleccionada.empleado.sucursal.longitud),
                    radioMetros: marcacionSeleccionada.empleado.sucursal.radioGeocercaMetros,
                  }
                : null
            }
          />
        </Modal>
      )}
    </div>
  );
}
