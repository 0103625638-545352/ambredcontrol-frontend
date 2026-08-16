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
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">Nómina</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Rol de pagos mensual (con aportes IESS), décimo tercero/cuarto, vacaciones, utilidades y liquidaciones. Los
          nuevos empleados se registran en la pestaña "Empleados" del menú.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {pestanas.map((p) => (
          <button
            key={p.id}
            onClick={() => setPestanaActiva(p.id)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
              pestanaActiva === p.id
                ? "bg-slate-800 dark:bg-slate-700 text-white border-slate-800 dark:border-slate-700"
                : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"
            }`}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      {pestanaActiva === "rolPagos" && <PestanaRolDePagos puedeEditar={puedeEditar} />}
      {pestanaActiva === "decimos" && <PestanaDecimos puedeEditar={puedeEditar} />}
      {pestanaActiva === "vacaciones" && <PestanaVacaciones puedeEditar={puedeEditar} />}
      {pestanaActiva === "utilidades" && <PestanaUtilidades puedeEditar={puedeEditar} />}
      {pestanaActiva === "liquidaciones" && <PestanaLiquidaciones puedeEditar={puedeEditar} />}
      {pestanaActiva === "marcaciones" && <PestanaMarcaciones puedeEditar={puedeEditar} />}
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

  return (
    <div>
      {puedeEditar && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            generar.mutate();
          }}
          className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm mb-4 grid grid-cols-3 gap-3"
        >
          <select
            required
            value={empleadoId}
            onChange={(e) => setEmpleadoId(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
          >
            <option value="">Empleado...</option>
            {empleados?.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.nombres} {emp.apellidos}</option>
            ))}
          </select>
          <select value={mes} onChange={(e) => setMes(e.target.value)} className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm">
            {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <input type="number" value={anio} onChange={(e) => setAnio(e.target.value)} className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm" />
          <div>
            <label className="block text-[10px] text-gray-500 dark:text-gray-400">Horas suplementarias (50%)</label>
            <input type="number" min="0" value={horasSuplementarias} onChange={(e) => setHorasSuplementarias(e.target.value)} className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm w-full" />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 dark:text-gray-400">Horas extraordinarias (100%)</label>
            <input type="number" min="0" value={horasExtraordinarias} onChange={(e) => setHorasExtraordinarias(e.target.value)} className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm w-full" />
          </div>
          <div className="col-span-3 -mt-1">
            <button
              type="button"
              disabled={!empleadoId || sugerirHoras.isPending}
              onClick={() => {
                setAvisoHoras(null);
                sugerirHoras.mutate();
              }}
              className="text-xs font-medium text-slate-700 dark:text-slate-300 hover:underline disabled:opacity-40 disabled:no-underline"
            >
              {sugerirHoras.isPending ? "Calculando..." : "Sugerir desde marcaciones"}
            </button>
            {avisoHoras && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{avisoHoras}</p>}
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 dark:text-gray-400">Otros ingresos (bonos/comisiones)</label>
            <input type="number" step="0.01" min="0" value={otrosIngresos} onChange={(e) => setOtrosIngresos(e.target.value)} className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm w-full" />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 dark:text-gray-400">Otros descuentos (anticipos)</label>
            <input type="number" step="0.01" min="0" value={otrosDescuentos} onChange={(e) => setOtrosDescuentos(e.target.value)} className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm w-full" />
          </div>
          <input placeholder="Detalle del descuento (opcional)" value={otrosDescuentosDetalle} onChange={(e) => setOtrosDescuentosDetalle(e.target.value)} className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm col-span-2" />
          <button type="submit" disabled={generar.isPending} className="bg-brand-600 text-white py-2 rounded-md text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
            {generar.isPending ? "Generando..." : "Generar rol de pagos"}
          </button>
          {generar.isError && <p className="col-span-3 text-red-600 dark:text-red-400 text-sm">{(generar.error as any)?.response?.data?.error ?? "Error"}</p>}
        </form>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
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
            {roles?.datos.map((r) => (
              <tr key={r.id} className="border-t border-gray-100 dark:border-gray-700">
                <td className="px-4 py-2">{r.empleado.nombres} {r.empleado.apellidos}</td>
                <td className="px-4 py-2">{MESES[r.mes - 1]} {r.anio}</td>
                <td className="px-4 py-2 text-right">${r.netoAPagar}</td>
                <td className="px-4 py-2"><EstadoBadge estado={r.estado} /></td>
                <td className="px-4 py-2 text-right space-x-3">
                  <button onClick={() => abrirPdfEnNuevaPestana(`/nomina/rol-pagos/${r.id}/pdf`)} className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium">Ver PDF</button>
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

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">Décimo Tercero (bono navideño)</h3>
        {puedeEditar && (
          <form onSubmit={(e) => { e.preventDefault(); calcularTercero.mutate(); }} className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm mb-3 flex gap-2 items-end flex-wrap">
            <select required value={empleadoIdTercero} onChange={(e) => setEmpleadoIdTercero(e.target.value)} className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm">
              <option value="">Empleado...</option>
              {empleados?.map((emp) => <option key={emp.id} value={emp.id}>{emp.nombres} {emp.apellidos}</option>)}
            </select>
            <input type="number" value={anioTercero} onChange={(e) => setAnioTercero(e.target.value)} className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm w-24" />
            <button type="submit" disabled={calcularTercero.isPending} className="bg-brand-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-brand-700 disabled:opacity-50">Calcular</button>
            {calcularTercero.isError && <p className="text-red-600 dark:text-red-400 text-xs w-full">{(calcularTercero.error as any)?.response?.data?.error}</p>}
          </form>
        )}
        <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
              <tr><th className="px-4 py-2">Empleado</th><th className="px-4 py-2">Año</th><th className="px-4 py-2 text-right">Valor</th><th className="px-4 py-2">Estado</th><th className="px-4 py-2"></th></tr>
            </thead>
            <tbody>
              {terceros?.length === 0 && <tr><td colSpan={5} className="px-4 py-3 text-center text-gray-400 dark:text-gray-500">Sin cálculos todavía</td></tr>}
              {terceros?.map((d) => (
                <tr key={d.id} className="border-t border-gray-100 dark:border-gray-700">
                  <td className="px-4 py-2">{d.empleado.nombres} {d.empleado.apellidos}</td>
                  <td className="px-4 py-2">{d.anio}</td>
                  <td className="px-4 py-2 text-right">${d.valor}</td>
                  <td className="px-4 py-2"><EstadoBadge estado={d.estado} /></td>
                  <td className="px-4 py-2 text-right space-x-3">
                    <button onClick={() => abrirPdfEnNuevaPestana(`/nomina/decimos/tercero/${d.id}/pdf`)} className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium">Ver PDF</button>
                    {d.estado === "PENDIENTE" && puedeEditar && <button onClick={() => pagarTercero.mutate(d.id)} className="text-emerald-700 dark:text-emerald-400 hover:underline text-xs font-medium">Pagar</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">Décimo Cuarto (bono escolar)</h3>
        {puedeEditar && (
          <form onSubmit={(e) => { e.preventDefault(); calcularCuarto.mutate(); }} className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm mb-3 flex gap-2 items-end flex-wrap">
            <select required value={empleadoIdCuarto} onChange={(e) => setEmpleadoIdCuarto(e.target.value)} className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm">
              <option value="">Empleado...</option>
              {empleados?.map((emp) => <option key={emp.id} value={emp.id}>{emp.nombres} {emp.apellidos}</option>)}
            </select>
            <input type="number" value={anioCuarto} onChange={(e) => setAnioCuarto(e.target.value)} className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm w-24" />
            <button type="submit" disabled={calcularCuarto.isPending} className="bg-brand-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-brand-700 disabled:opacity-50">Calcular</button>
            {calcularCuarto.isError && <p className="text-red-600 dark:text-red-400 text-xs w-full">{(calcularCuarto.error as any)?.response?.data?.error}</p>}
          </form>
        )}
        <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
              <tr><th className="px-4 py-2">Empleado</th><th className="px-4 py-2">Año</th><th className="px-4 py-2">Meses</th><th className="px-4 py-2 text-right">Valor</th><th className="px-4 py-2">Estado</th><th className="px-4 py-2"></th></tr>
            </thead>
            <tbody>
              {cuartos?.length === 0 && <tr><td colSpan={6} className="px-4 py-3 text-center text-gray-400 dark:text-gray-500">Sin cálculos todavía</td></tr>}
              {cuartos?.map((d) => (
                <tr key={d.id} className="border-t border-gray-100 dark:border-gray-700">
                  <td className="px-4 py-2">{d.empleado.nombres} {d.empleado.apellidos}</td>
                  <td className="px-4 py-2">{d.anio}</td>
                  <td className="px-4 py-2">{d.mesesLaborados}</td>
                  <td className="px-4 py-2 text-right">${d.valor}</td>
                  <td className="px-4 py-2"><EstadoBadge estado={d.estado} /></td>
                  <td className="px-4 py-2 text-right space-x-3">
                    <button onClick={() => abrirPdfEnNuevaPestana(`/nomina/decimos/cuarto/${d.id}/pdf`)} className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium">Ver PDF</button>
                    {d.estado === "PENDIENTE" && puedeEditar && <button onClick={() => pagarCuarto.mutate(d.id)} className="text-emerald-700 dark:text-emerald-400 hover:underline text-xs font-medium">Pagar</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">Consultar saldo disponible</h3>
        <select value={empleadoIdSaldo} onChange={(e) => setEmpleadoIdSaldo(e.target.value)} className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm w-full mb-2">
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
        <form onSubmit={(e) => { e.preventDefault(); registrar.mutate(); }} className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm grid grid-cols-2 gap-3">
          <select required value={empleadoId} onChange={(e) => setEmpleadoId(e.target.value)} className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm col-span-2">
            <option value="">Empleado...</option>
            {empleados?.map((emp) => <option key={emp.id} value={emp.id}>{emp.nombres} {emp.apellidos}</option>)}
          </select>
          <div>
            <label className="block text-[10px] text-gray-500 dark:text-gray-400">Fecha inicio</label>
            <input type="date" required value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm w-full" />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 dark:text-gray-400">Fecha fin</label>
            <input type="date" required value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm w-full" />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 dark:text-gray-400">Días</label>
            <input type="number" min="1" required value={diasTomados} onChange={(e) => setDiasTomados(e.target.value)} className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm w-full" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={pagarEnDinero} onChange={(e) => setPagarEnDinero(e.target.checked)} />
            Pagar en dinero (no gozadas)
          </label>
          <button type="submit" disabled={registrar.isPending} className="col-span-2 bg-brand-600 text-white py-2 rounded-md text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
            {registrar.isPending ? "Guardando..." : "Registrar vacaciones"}
          </button>
          {registrar.isError && <p className="col-span-2 text-red-600 dark:text-red-400 text-sm">{(registrar.error as any)?.response?.data?.error}</p>}
        </form>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
            <tr><th className="px-4 py-2">Empleado</th><th className="px-4 py-2">Período</th><th className="px-4 py-2">Días</th><th className="px-4 py-2 text-right">Valor pagado</th><th className="px-4 py-2"></th></tr>
          </thead>
          <tbody>
            {historial?.length === 0 && <tr><td colSpan={5} className="px-4 py-3 text-center text-gray-400 dark:text-gray-500">Sin registros</td></tr>}
            {historial?.map((v) => (
              <tr key={v.id} className="border-t border-gray-100 dark:border-gray-700">
                <td className="px-4 py-2">{v.empleado.nombres} {v.empleado.apellidos}</td>
                <td className="px-4 py-2">{new Date(v.fechaInicio).toLocaleDateString("es-EC")} - {new Date(v.fechaFin).toLocaleDateString("es-EC")}</td>
                <td className="px-4 py-2">{v.diasTomados}</td>
                <td className="px-4 py-2 text-right">{v.valorPagado ? `$${v.valorPagado}` : "—"}</td>
                <td className="px-4 py-2 text-right">
                  {v.valorPagado && <button onClick={() => abrirPdfEnNuevaPestana(`/nomina/vacaciones/${v.id}/pdf`)} className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium">Ver PDF</button>}
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
        <form onSubmit={(e) => { e.preventDefault(); calcular.mutate(); }} className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm flex gap-2 items-end flex-wrap">
          <div>
            <label className="block text-[10px] text-gray-500 dark:text-gray-400">Año a repartir</label>
            <input type="number" value={anio} onChange={(e) => setAnio(e.target.value)} className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm w-24" />
          </div>
          <button type="submit" disabled={calcular.isPending} className="bg-brand-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
            {calcular.isPending ? "Calculando..." : "Calcular utilidades"}
          </button>
          {calcular.isError && <p className="text-red-600 dark:text-red-400 text-sm w-full">{(calcular.error as any)?.response?.data?.error}</p>}
        </form>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
            <tr><th className="px-4 py-2">Año</th><th className="px-4 py-2 text-right">Utilidad neta</th><th className="px-4 py-2 text-right">15% a repartir</th><th className="px-4 py-2"></th></tr>
          </thead>
          <tbody>
            {historial?.length === 0 && <tr><td colSpan={4} className="px-4 py-3 text-center text-gray-400 dark:text-gray-500">Sin cálculos todavía</td></tr>}
            {historial?.map((u) => (
              <tr key={u.id} className="border-t border-gray-100 dark:border-gray-700">
                <td className="px-4 py-2">{u.anio}</td>
                <td className="px-4 py-2 text-right">${u.utilidadNetaEmpresa}</td>
                <td className="px-4 py-2 text-right">${u.monto15Porciento}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => setAnioVerDetalle(anioVerDetalle === String(u.anio) ? "" : String(u.anio))} className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium">
                    {anioVerDetalle === String(u.anio) ? "Ocultar" : "Ver reparto"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detalle && (
        <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
              <tr><th className="px-4 py-2">Empleado</th><th className="px-4 py-2">Días trabajados</th><th className="px-4 py-2 text-right">10% días</th><th className="px-4 py-2 text-right">5% cargas</th><th className="px-4 py-2 text-right">Total</th></tr>
            </thead>
            <tbody>
              {detalle.detalles.map((d) => (
                <tr key={d.id} className="border-t border-gray-100 dark:border-gray-700">
                  <td className="px-4 py-2">{d.empleado.nombres} {d.empleado.apellidos}</td>
                  <td className="px-4 py-2">{d.diasTrabajados}</td>
                  <td className="px-4 py-2 text-right">${d.valorPorDias}</td>
                  <td className="px-4 py-2 text-right">${d.valorPorCargas}</td>
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

  return (
    <div className="space-y-4">
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
        <p className="text-xs text-red-800 dark:text-red-300 font-medium">
          ⚠ Esto es una calculadora de referencia, no un documento legal final. Confirma la indemnización y
          bonificación por desahucio con un contador o abogado laboral antes de pagar una liquidación real.
        </p>
      </div>

      {puedeEditar && (
        <form onSubmit={(e) => { e.preventDefault(); calcular.mutate(); }} className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm grid grid-cols-3 gap-3">
          <select required value={empleadoId} onChange={(e) => setEmpleadoId(e.target.value)} className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm">
            <option value="">Empleado...</option>
            {empleados?.map((emp) => <option key={emp.id} value={emp.id}>{emp.nombres} {emp.apellidos}</option>)}
          </select>
          <input type="date" required value={fechaSalida} onChange={(e) => setFechaSalida(e.target.value)} className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm" />
          <select value={motivoSalida} onChange={(e) => setMotivoSalida(e.target.value)} className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm">
            <option value="RENUNCIA_VOLUNTARIA">Renuncia voluntaria</option>
            <option value="DESPIDO_INTEMPESTIVO">Despido intempestivo</option>
            <option value="MUTUO_ACUERDO">Mutuo acuerdo</option>
            <option value="VISTO_BUENO">Visto bueno</option>
            <option value="OTRO">Otro</option>
          </select>
          <button type="submit" disabled={calcular.isPending} className="col-span-3 bg-brand-600 text-white py-2 rounded-md text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
            {calcular.isPending ? "Calculando..." : "Calcular liquidación"}
          </button>
          {calcular.isError && <p className="col-span-3 text-red-600 dark:text-red-400 text-sm">{(calcular.error as any)?.response?.data?.error}</p>}
        </form>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
            <tr><th className="px-4 py-2">Empleado</th><th className="px-4 py-2">Fecha salida</th><th className="px-4 py-2">Motivo</th><th className="px-4 py-2 text-right">Total</th><th className="px-4 py-2"></th></tr>
          </thead>
          <tbody>
            {liquidaciones?.length === 0 && <tr><td colSpan={5} className="px-4 py-3 text-center text-gray-400 dark:text-gray-500">Sin liquidaciones calculadas</td></tr>}
            {liquidaciones?.map((l) => (
              <tr key={l.id} className="border-t border-gray-100 dark:border-gray-700">
                <td className="px-4 py-2">{l.empleado.nombres} {l.empleado.apellidos}</td>
                <td className="px-4 py-2">{new Date(l.fechaSalida).toLocaleDateString("es-EC")}</td>
                <td className="px-4 py-2">{l.motivoSalida}</td>
                <td className="px-4 py-2 text-right">${l.totalLiquidacion}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => abrirPdfEnNuevaPestana(`/nomina/liquidaciones/${l.id}/pdf`)} className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium">Ver PDF</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
      <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm flex items-end justify-between gap-3">
        <div>
          <label className="block text-[10px] text-gray-500 dark:text-gray-400 mb-1">Filtrar por empleado</label>
          <select
            value={empleadoIdFiltro}
            onChange={(e) => {
              setEmpleadoIdFiltro(e.target.value);
              setPagina(1);
            }}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
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
          className="bg-brand-600 text-white px-4 py-1.5 rounded-md text-sm font-medium hover:bg-brand-700 disabled:opacity-40"
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
          className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm grid grid-cols-3 gap-3"
        >
          <select
            required
            value={empleadoIdManual}
            onChange={(e) => setEmpleadoIdManual(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
          >
            <option value="">Empleado...</option>
            {empleados?.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.nombres} {emp.apellidos}</option>
            ))}
          </select>
          <select
            value={tipoManual}
            onChange={(e) => setTipoManual(e.target.value as "ENTRADA" | "SALIDA")}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
          >
            <option value="ENTRADA">Entrada</option>
            <option value="SALIDA">Salida</option>
          </select>
          <input
            placeholder="Observación (ej. olvidó marcar)"
            required
            value={observacionManual}
            onChange={(e) => setObservacionManual(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={registrarManual.isPending}
            className="col-span-3 bg-brand-600 text-white py-2 rounded-md text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
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

      <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
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
              <tr key={m.id} className="border-t border-gray-100 dark:border-gray-700">
                <td className="px-4 py-2">{m.empleado.nombres} {m.empleado.apellidos}</td>
                <td className="px-4 py-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${m.tipo === "ENTRADA" ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" : "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300"}`}>
                    {m.tipo === "ENTRADA" ? "Entrada" : "Salida"}
                  </span>
                </td>
                <td className="px-4 py-2">{new Date(m.fecha).toLocaleString("es-EC", { dateStyle: "short", timeStyle: "short" })}</td>
                <td className="px-4 py-2 space-x-1.5">
                  {m.tardanza && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">Tardanza</span>
                  )}
                  {m.dentroDeGeocerca === false && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">Fuera de zona</span>
                  )}
                  {m.creadaManualmente && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300" title={m.observacion ?? undefined}>
                      Manual
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  {m.latitud && m.longitud && (
                    <button
                      onClick={() => setMarcacionSeleccionada(m)}
                      className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium"
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
              className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-40 text-gray-600 dark:text-gray-300"
            >
              Anterior
            </button>
            <span className="text-xs text-gray-500 dark:text-gray-400 self-center">
              Página {respuesta.paginacion.page} de {respuesta.paginacion.totalPaginas}
            </span>
            <button
              disabled={pagina >= respuesta.paginacion.totalPaginas}
              onClick={() => setPagina((p) => p + 1)}
              className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-40 text-gray-600 dark:text-gray-300"
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
