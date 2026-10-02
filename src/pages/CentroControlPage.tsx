import { Fragment, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Siren, Activity, Users, PackageX, Fuel, DollarSign, Star, AlertTriangle, TrendingDown, Percent, Wallet, MapPinOff, Router } from "lucide-react";
import {
  api,
  type AlertaRed,
  type DisponibilidadNodo,
  type OnuPeorSenal,
  type LecturaSenal,
  type VisitasSospechosas,
  type CuadreTecnicos,
  type EquiposNoRecuperados,
  type AnomaliaCombustible,
  type IndicadoresIsp,
  type ResumenEncuestas,
} from "../api/client";
import { PageHeader } from "../components/PageHeader";
import { TarjetaKpi, CLASE_THEAD, CLASE_TITULO_SECCION, CLASE_ACCION, CLASE_ACCION_PELIGRO, CLASE_CAMPO, CLASE_ETIQUETA } from "../components/FormatoDocumento";
import { BotonWhatsapp } from "../components/BotonWhatsapp";
import { useToast } from "../components/ToastProvider";

// Centro de Control — todo lo que necesita atención del lado operativo en
// una sola pantalla, separado en pestañas internas. Ver
// backend/src/routes/centroControl.ts para el detalle de cada regla. Los
// detalles se abren EN FLUJO (filas que se expanden), nunca en ventanas
// flotantes position:fixed (ver memoria del proyecto sobre ese problema de
// pintado en esta máquina).

type Seccion = "red" | "tecnicos" | "equipos" | "combustible" | "negocio" | "encuestas";

const SECCIONES: { id: Seccion; etiqueta: string }[] = [
  { id: "red", etiqueta: "Red" },
  { id: "tecnicos", etiqueta: "Técnicos" },
  { id: "equipos", etiqueta: "Equipos sin recuperar" },
  { id: "combustible", etiqueta: "Combustible" },
  { id: "negocio", etiqueta: "Negocio ISP" },
  { id: "encuestas", etiqueta: "Encuestas" },
];

const CLASE_PANEL = "bg-white dark:bg-gray-800 rounded-sm border border-stone-300 dark:border-gray-700";
const CLASE_TD = "px-4 py-2";

function aInputDate(fecha: Date): string {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const d = String(fecha.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function haceDias(dias: number): string {
  return aInputDate(new Date(Date.now() - dias * 24 * 3600_000));
}

function fechaHora(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-EC", { dateStyle: "short", timeStyle: "short" });
}

function fechaCorta(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-EC");
}

function duracion(desdeIso: string, hastaIso: string | null): string {
  const ms = (hastaIso ? new Date(hastaIso).getTime() : Date.now()) - new Date(desdeIso).getTime();
  const minutos = Math.round(ms / 60_000);
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 48) return `${horas} h ${minutos % 60} min`;
  return `${Math.floor(horas / 24)} días`;
}

function Vacio({ children }: { children: ReactNode }) {
  return <p className="px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500">{children}</p>;
}

function Cargando() {
  return <Vacio>Cargando...</Vacio>;
}

function TituloPanel({ titulo, detalle, acciones }: { titulo: string; detalle?: ReactNode; acciones?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 px-4 py-3 border-b border-stone-200 dark:border-gray-700">
      <div>
        <h3 className={CLASE_TITULO_SECCION}>{titulo}</h3>
        {detalle && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{detalle}</p>}
      </div>
      {acciones}
    </div>
  );
}

function FiltroFechas({ desde, hasta, onCambiar }: { desde: string; hasta: string; onCambiar: (desde: string, hasta: string) => void }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <label className="flex items-center gap-1">
        <span className={CLASE_ETIQUETA}>Desde</span>
        <input type="date" value={desde} onChange={(e) => onCambiar(e.target.value, hasta)} className={`${CLASE_CAMPO} !w-36 !py-1 !text-xs`} />
      </label>
      <label className="flex items-center gap-1">
        <span className={CLASE_ETIQUETA}>Hasta</span>
        <input type="date" value={hasta} onChange={(e) => onCambiar(desde, e.target.value)} className={`${CLASE_CAMPO} !w-36 !py-1 !text-xs`} />
      </label>
    </div>
  );
}

export function CentroControlPage() {
  const [seccion, setSeccion] = useState<Seccion>("red");

  // Se consulta siempre (no solo en la pestaña Red) para mostrar el
  // contador en la pestaña aunque se esté mirando otra sección.
  const { data: alertasAbiertas } = useQuery({
    queryKey: ["centro-control-alertas", "abiertas"],
    queryFn: async () => (await api.get<AlertaRed[]>("/centro-control/red/alertas")).data,
    refetchInterval: 60_000,
  });

  return (
    <div>
      <PageHeader
        titulo="Centro de Control"
        subtitulo="Alertas de red, control del personal técnico y salud del negocio, en un solo lugar."
      />

      <div className="flex overflow-x-auto border-b border-stone-300 dark:border-gray-700 mb-4">
        {SECCIONES.map((s) => (
          <button
            key={s.id}
            onClick={() => setSeccion(s.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${
              seccion === s.id
                ? "border-brand-600 text-brand-700 dark:text-brand-300 font-semibold"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            }`}
          >
            {s.etiqueta}
            {s.id === "red" && (alertasAbiertas?.length ?? 0) > 0 && (
              <span className="bg-red-600 text-white text-[10px] font-mono rounded-full px-1.5 leading-4">{alertasAbiertas!.length}</span>
            )}
          </button>
        ))}
      </div>

      {seccion === "red" && <SeccionRed alertasAbiertas={alertasAbiertas} />}
      {seccion === "tecnicos" && <SeccionTecnicos />}
      {seccion === "equipos" && <SeccionEquipos />}
      {seccion === "combustible" && <SeccionCombustible />}
      {seccion === "negocio" && <SeccionNegocio />}
      {seccion === "encuestas" && <SeccionEncuestas />}
    </div>
  );
}

// ===========================================================================
// RED
// ===========================================================================

function HistorialSenal({ onuId }: { onuId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["centro-control-historial-onu", onuId],
    queryFn: async () => (await api.get<LecturaSenal[]>(`/centro-control/red/onus/${onuId}/historial`, { params: { dias: 30 } })).data,
  });
  if (isLoading) return <Cargando />;
  if (!data || data.length < 2) {
    return <Vacio>Todavía no hay historial suficiente para esta ONU (se guarda una lectura por hora desde que se activó el monitoreo).</Vacio>;
  }
  const puntos = data.map((l) => ({ fecha: l.fecha, rx: Number(l.rxPowerDbm) }));
  return (
    <div className="px-4 py-3">
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">Señal recibida (dBm) — últimos 30 días. La línea roja es el umbral crítico (-27 dBm).</p>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={puntos} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="fecha"
            tickFormatter={(v) => new Date(v).toLocaleDateString("es-EC", { day: "2-digit", month: "2-digit" })}
            tick={{ fill: "var(--chart-muted)", fontSize: 11 }}
            axisLine={{ stroke: "var(--chart-axis)" }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={{ fill: "var(--chart-muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => Number(v).toFixed(0)} />
          <Tooltip
            labelFormatter={(v) => fechaHora(String(v))}
            formatter={(v) => [`${Number(v).toFixed(2)} dBm`, "Señal"]}
            contentStyle={{ background: "var(--chart-tooltip-bg)", border: "1px solid var(--chart-tooltip-border)", color: "var(--chart-tooltip-text)", fontSize: 12 }}
          />
          <ReferenceLine y={-27} stroke="#dc2626" strokeDasharray="4 3" />
          <Line type="monotone" dataKey="rx" stroke="var(--chart-series-1)" strokeWidth={1.75} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function SeccionRed({ alertasAbiertas }: { alertasAbiertas: AlertaRed[] | undefined }) {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const [verCerradas, setVerCerradas] = useState(false);
  const [expandida, setExpandida] = useState<number | null>(null);
  const [historialOnu, setHistorialOnu] = useState<number | null>(null);

  const { data: todas, isLoading: cargandoTodas } = useQuery({
    queryKey: ["centro-control-alertas", "todas"],
    queryFn: async () => (await api.get<AlertaRed[]>("/centro-control/red/alertas", { params: { estado: "todas" } })).data,
    enabled: verCerradas,
  });
  const { data: peores, isLoading: cargandoPeores } = useQuery({
    queryKey: ["centro-control-peores-senales"],
    queryFn: async () => (await api.get<OnuPeorSenal[]>("/centro-control/red/peores-senales")).data,
  });

  const cerrar = useMutation({
    mutationFn: async (id: number) => api.patch(`/centro-control/red/alertas/${id}/cerrar`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["centro-control-alertas"] });
      mostrarToast("Alerta cerrada", "success");
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "No se pudo cerrar la alerta"),
  });

  const resolverTickets = useMutation({
    mutationFn: async (alertaId: number) => (await api.patch<{ resueltos: number }>(`/tickets/alerta/${alertaId}/resolver`, {})).data,
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["centro-control-alertas"] });
      mostrarToast(`${r.resueltos} ticket(s) resuelto(s)`, "success");
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "No se pudieron resolver los tickets"),
  });

  const lista = verCerradas ? todas : alertasAbiertas;
  const cortes = alertasAbiertas?.filter((a) => a.tipo === "CORTE_MASIVO") ?? [];
  const nodosCaidos = alertasAbiertas?.filter((a) => a.tipo === "NODO_CAIDO") ?? [];
  const degradadas = alertasAbiertas?.filter((a) => a.tipo === "SENAL_DEGRADADA") ?? [];
  const clientesSinServicio =
    cortes.reduce((s, a) => s + a.clientesAfectados.filter((c) => c.estadoOnu === "OFFLINE").length, 0) +
    nodosCaidos.reduce((s, a) => s + a.clientesAfectados.length, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <TarjetaKpi icono={Router} etiqueta="Nodos caídos" valor={String(nodosCaidos.length)} color={nodosCaidos.length > 0 ? "bg-red-700" : "bg-gray-500"} />
        <TarjetaKpi icono={Siren} etiqueta="Cortes masivos (fibra)" valor={String(cortes.length)} color={cortes.length > 0 ? "bg-red-600" : "bg-gray-500"} />
        <TarjetaKpi icono={Users} etiqueta="Clientes afectados" valor={String(clientesSinServicio)} color={clientesSinServicio > 0 ? "bg-red-700" : "bg-gray-500"} />
        <TarjetaKpi icono={TrendingDown} etiqueta="Señales degradadas" valor={String(degradadas.length)} color={degradadas.length > 0 ? "bg-amber-600" : "bg-gray-500"} />
      </div>

      <DisponibilidadNodos />

      <div className={CLASE_PANEL}>
        <TituloPanel
          titulo={verCerradas ? "Alertas de red (últimos 30 días)" : "Alertas de red abiertas"}
          detalle="Se detectan solas con cada lectura de las OLT. Un corte se cierra solo cuando el puerto se recupera; una señal degradada, cuando vuelve a niveles normales."
          acciones={
            <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <input type="checkbox" checked={verCerradas} onChange={(e) => setVerCerradas(e.target.checked)} />
              Incluir cerradas
            </label>
          }
        />
        {(verCerradas ? cargandoTodas : !alertasAbiertas) && <Cargando />}
        {lista && lista.length === 0 && <Vacio>Sin alertas{verCerradas ? " en los últimos 30 días" : " abiertas"}. La red está tranquila.</Vacio>}
        {lista?.map((a) => (
          <div key={a.id} className="border-t border-stone-100 dark:border-gray-700 first:border-t-0">
            <div className="flex flex-wrap items-start gap-3 px-4 py-3">
              <span
                className={`mt-0.5 font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm text-white ${
                  a.fechaFin ? "bg-gray-400" : a.tipo === "SENAL_DEGRADADA" ? "bg-amber-600" : "bg-red-600"
                }`}
              >
                {a.tipo === "CORTE_MASIVO" ? "Corte masivo" : a.tipo === "NODO_CAIDO" ? "Nodo caído" : "Señal degradada"}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 dark:text-gray-100">{a.mensaje}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {a.nodo ? `${a.nodo.nombre} (${a.nodo.mikrotikHost})` : `${a.olt?.nombre ?? "OLT"} · PON ${a.slot}/${a.puerto}`} · desde {fechaHora(a.fechaInicio)} ({duracion(a.fechaInicio, a.fechaFin)})
                  {a.fechaFin && ` · cerrada ${a.cerradaManualmente ? "a mano" : "sola"} ${fechaHora(a.fechaFin)}`}
                  {a.cantidadTickets > 0 && ` · ${a.cantidadTickets} ticket(s) vinculado(s)`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {(a.tipo === "CORTE_MASIVO" || a.tipo === "NODO_CAIDO") && (
                  <button onClick={() => setExpandida(expandida === a.id ? null : a.id)} className={CLASE_ACCION}>
                    {expandida === a.id ? "Ocultar clientes" : `Ver ${a.clientesAfectados.length} cliente(s)`}
                  </button>
                )}
                {a.onu && (
                  <button onClick={() => setHistorialOnu(historialOnu === a.onu!.id ? null : a.onu!.id)} className={CLASE_ACCION}>
                    {historialOnu === a.onu.id ? "Ocultar historial" : "Ver historial"}
                  </button>
                )}
                {a.onu?.cliente && <BotonWhatsapp telefono={a.onu.cliente.telefono} conTexto />}
                {a.cantidadTickets > 0 && !a.fechaFin && (
                  <button onClick={() => resolverTickets.mutate(a.id)} disabled={resolverTickets.isPending} className={CLASE_ACCION}>
                    Resolver sus tickets
                  </button>
                )}
                {!a.fechaFin && (
                  <button onClick={() => cerrar.mutate(a.id)} disabled={cerrar.isPending} className={CLASE_ACCION_PELIGRO}>
                    Cerrar
                  </button>
                )}
              </div>
            </div>
            {expandida === a.id && (
              <div className="px-4 pb-3">
                <table className="w-full text-sm border border-stone-200 dark:border-gray-700">
                  <thead className={CLASE_THEAD}>
                    <tr>
                      <th className="px-3 py-1.5">Cliente</th>
                      <th className="px-3 py-1.5">{a.tipo === "NODO_CAIDO" ? "Ping" : "ONU"}</th>
                      <th className="px-3 py-1.5 text-right">Avisar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.clientesAfectados.map((c) => (
                      <tr key={c.id} className="border-t border-stone-100 dark:border-gray-700">
                        <td className="px-3 py-1.5">{c.razonSocial}</td>
                        <td className={`px-3 py-1.5 font-mono text-xs ${c.estadoOnu === "OFFLINE" ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                          {c.estadoOnu ?? "—"}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <BotonWhatsapp
                            telefono={c.telefono}
                            conTexto
                            mensaje={`Estimado/a ${c.razonSocial}: detectamos una falla en la red de su sector y nuestro equipo técnico ya está trabajando para restablecer el servicio. Disculpe las molestias.`}
                          />
                        </td>
                      </tr>
                    ))}
                    {a.clientesAfectados.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-3 py-2 text-center text-xs text-gray-400">{a.tipo === "NODO_CAIDO" ? "Este nodo no tiene clientes activos." : "Ninguna ONU de este puerto está vinculada a un cliente todavía."}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            {a.onu && historialOnu === a.onu.id && <HistorialSenal onuId={a.onu.id} />}
          </div>
        ))}
      </div>

      <div className={CLASE_PANEL}>
        <TituloPanel titulo="Las 30 peores señales ahora" detalle="ONUs conectadas con la señal más baja, tengan o no alerta abierta — útil para planificar mantenimiento preventivo por sector." />
        {cargandoPeores && <Cargando />}
        {peores && peores.length === 0 && <Vacio>No hay lecturas de señal todavía. Revisa que el polling de OLT esté funcionando.</Vacio>}
        {peores && peores.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={CLASE_THEAD}>
                <tr>
                  <th className="px-4 py-2">Cliente / ONU</th>
                  <th className="px-4 py-2">OLT · PON</th>
                  <th className="px-4 py-2 text-right">Señal</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {peores.map((o) => (
                  <Fragment key={o.id}>
                    <tr className="border-t border-stone-100 dark:border-gray-700">
                      <td className={CLASE_TD}>
                        {o.cliente?.razonSocial ?? <span className="text-gray-400">Sin cliente vinculado</span>}
                        <span className="block font-mono text-[11px] text-gray-400">{o.serial}</span>
                      </td>
                      <td className={`${CLASE_TD} text-gray-600 dark:text-gray-300`}>
                        {o.olt.nombre} · {o.slot}/{o.puerto} · #{o.onuIndex}
                      </td>
                      <td className={`${CLASE_TD} text-right font-mono tabular-nums ${Number(o.rxPowerDbm) <= -27 ? "text-red-600 dark:text-red-400 font-semibold" : Number(o.rxPowerDbm) <= -25 ? "text-amber-600 dark:text-amber-400" : ""}`}>
                        {o.rxPowerDbm} dBm
                      </td>
                      <td className={`${CLASE_TD} text-right`}>
                        <button onClick={() => setHistorialOnu(historialOnu === o.id ? null : o.id)} className={CLASE_ACCION}>
                          {historialOnu === o.id ? "Ocultar" : "Historial"}
                        </button>
                      </td>
                    </tr>
                    {historialOnu === o.id && (
                      <tr>
                        <td colSpan={4}>
                          <HistorialSenal onuId={o.id} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function colorDisponibilidad(d: number | null): string {
  if (d === null) return "text-gray-400";
  if (d >= 99) return "text-emerald-600 dark:text-emerald-400";
  if (d >= 95) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400 font-semibold";
}

function textoMinutos(minutos: number): string {
  if (minutos < 60) return `${Math.max(1, minutos)} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 48) return `${horas} h ${minutos % 60} min`;
  return `${Math.floor(horas / 24)} días ${horas % 24} h`;
}

function DisponibilidadNodos() {
  const [dias, setDias] = useState(30);
  const { data, isLoading } = useQuery({
    queryKey: ["centro-control-disponibilidad", dias],
    queryFn: async () => (await api.get<DisponibilidadNodo[]>("/centro-control/red/disponibilidad-nodos", { params: { dias } })).data,
    refetchInterval: 120_000,
  });

  return (
    <div className={CLASE_PANEL}>
      <TituloPanel
        titulo="Disponibilidad de nodos"
        detalle="El sistema prueba la conexión con el Mikrotik de cada nodo cada 5 minutos. Si un nodo que funcionaba deja de responder dos veces seguidas, se abre una alerta y llega un correo."
        acciones={
          <select id="periodo-disponibilidad" value={dias} onChange={(e) => setDias(Number(e.target.value))} className={`${CLASE_CAMPO} !w-auto !py-1 !text-xs`} aria-label="Período">
            <option value={1}>Últimas 24 horas</option>
            <option value={7}>Últimos 7 días</option>
            <option value={30}>Últimos 30 días</option>
            <option value={90}>Últimos 90 días</option>
          </select>
        }
      />
      {isLoading && <Cargando />}
      {data && data.length === 0 && <Vacio>No hay nodos activos.</Vacio>}
      {data && data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className={CLASE_THEAD}>
              <tr>
                <th className="px-4 py-2">Nodo</th>
                <th className="px-4 py-2">Ahora</th>
                <th className="px-4 py-2 text-right">Disponibilidad</th>
                <th className="px-4 py-2 text-right">Caídas</th>
                <th className="px-4 py-2 text-right">Tiempo caído</th>
                <th className="px-4 py-2 text-right">Respuesta</th>
                <th className="px-4 py-2 text-right">Clientes</th>
              </tr>
            </thead>
            <tbody>
              {data.map((n) => (
                <tr key={n.nodoId} className="border-t border-stone-100 dark:border-gray-700 align-top">
                  <td className={CLASE_TD}>
                    {n.nombre}
                    <span className="block font-mono text-[11px] text-gray-400">{n.host}</span>
                  </td>
                  <td className={CLASE_TD}>
                    {!n.ultimoChequeo ? (
                      <span className="text-xs text-gray-400">sin chequeos todavía</span>
                    ) : n.ultimoChequeo.enLinea ? (
                      <span className="font-mono text-[10px] uppercase tracking-wider border border-emerald-500 text-emerald-700 dark:text-emerald-400 px-1 rounded-sm">En línea</span>
                    ) : (
                      <span title={n.ultimoChequeo.error ?? ""}>
                        <span className="font-mono text-[10px] uppercase tracking-wider border border-red-500 text-red-600 dark:text-red-400 px-1 rounded-sm">Sin respuesta</span>
                        <span className="block text-[11px] text-gray-400 mt-0.5">
                          {n.ultimaConexionExitosa ? `última conexión ${fechaHora(n.ultimaConexionExitosa)}` : "nunca respondió a este servidor"}
                        </span>
                      </span>
                    )}
                  </td>
                  <td className={`${CLASE_TD} text-right font-mono tabular-nums ${colorDisponibilidad(n.disponibilidad)}`}>
                    {n.disponibilidad != null ? `${n.disponibilidad}%` : "—"}
                    <span className="block text-[10px] font-sans font-normal text-gray-400">{n.chequeos} chequeos</span>
                  </td>
                  <td className={`${CLASE_TD} text-right font-mono tabular-nums`}>{n.caidas}</td>
                  <td className={`${CLASE_TD} text-right font-mono tabular-nums`}>{n.minutosCaido > 0 ? textoMinutos(n.minutosCaido) : "—"}</td>
                  <td className={`${CLASE_TD} text-right font-mono tabular-nums`}>{n.latenciaPromedioMs != null ? `${n.latenciaPromedioMs} ms` : "—"}</td>
                  <td className={`${CLASE_TD} text-right font-mono tabular-nums`}>{n.clientes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// TÉCNICOS
// ===========================================================================

function SeccionTecnicos() {
  const [desde, setDesde] = useState(haceDias(7));
  const [hasta, setHasta] = useState(aInputDate(new Date()));
  const [expandido, setExpandido] = useState<number | null>(null);

  const { data: visitas, isLoading: cargandoVisitas } = useQuery({
    queryKey: ["centro-control-visitas", desde, hasta],
    queryFn: async () => (await api.get<VisitasSospechosas>("/centro-control/tecnicos/visitas-sospechosas", { params: { desde, hasta } })).data,
  });
  const { data: cuadre, isLoading: cargandoCuadre } = useQuery({
    queryKey: ["centro-control-cuadre"],
    queryFn: async () => (await api.get<CuadreTecnicos>("/centro-control/tecnicos/cuadre")).data,
  });

  const totalFaltante = cuadre?.tecnicos.reduce((s, t) => s + Number(t.valorFaltante), 0) ?? 0;
  const equiposViejos = cuadre?.tecnicos.reduce((s, t) => s + t.equiposMasDe7Dias, 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <TarjetaKpi icono={MapPinOff} etiqueta="Visitas sospechosas" valor={visitas ? `${visitas.sospechosas.length} / ${visitas.totalVisitas}` : "—"} color={(visitas?.sospechosas.length ?? 0) > 0 ? "bg-amber-600" : "bg-gray-500"} />
        <TarjetaKpi icono={PackageX} etiqueta="Equipos en mano > 7 días" valor={String(equiposViejos)} color={equiposViejos > 0 ? "bg-amber-600" : "bg-gray-500"} />
        <TarjetaKpi icono={AlertTriangle} etiqueta="Cable faltante (90 días)" valor={`$${totalFaltante.toFixed(2)}`} color={totalFaltante > 0 ? "bg-red-600" : "bg-gray-500"} />
        <TarjetaKpi icono={Activity} etiqueta="Metros promedio por instalación" valor={cuadre?.promedioGeneralMetrosPorInstalacion != null ? `${cuadre.promedioGeneralMetrosPorInstalacion} m` : "—"} color="bg-brand-700" />
      </div>

      <div className={CLASE_PANEL}>
        <TituloPanel
          titulo="Visitas sospechosas"
          detalle={`Visitas donde el técnico marcó "Llegué" a más de ${visitas?.umbralMetros ?? 300} m del cliente, o donde su GPS de fondo nunca pasó cerca de la casa en esa hora. Desde ahora, si marca a más de 1 km, ya no se cambia la ubicación guardada del cliente.`}
          acciones={<FiltroFechas desde={desde} hasta={hasta} onCambiar={(d, h) => { setDesde(d); setHasta(h); }} />}
        />
        {cargandoVisitas && <Cargando />}
        {visitas && (
          <div className="grid lg:grid-cols-3 gap-0">
            <div className="lg:border-r border-stone-200 dark:border-gray-700">
              <table className="w-full text-sm">
                <thead className={CLASE_THEAD}>
                  <tr>
                    <th className="px-4 py-2">Técnico</th>
                    <th className="px-4 py-2 text-right">Visitas</th>
                    <th className="px-4 py-2 text-right">Sospechosas</th>
                  </tr>
                </thead>
                <tbody>
                  {visitas.porTecnico.map((t) => (
                    <tr key={t.empleadoId} className="border-t border-stone-100 dark:border-gray-700">
                      <td className={CLASE_TD}>{t.nombre}</td>
                      <td className={`${CLASE_TD} text-right font-mono tabular-nums`}>{t.visitas}</td>
                      <td className={`${CLASE_TD} text-right font-mono tabular-nums ${t.sospechosas > 0 ? "text-amber-600 dark:text-amber-400 font-semibold" : ""}`}>{t.sospechosas}</td>
                    </tr>
                  ))}
                  {visitas.porTecnico.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-4 text-center text-gray-400">Sin visitas completadas en el período.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="lg:col-span-2">
              {visitas.sospechosas.length === 0 ? (
                <Vacio>Ninguna visita sospechosa en el período.</Vacio>
              ) : (
                <ul className="divide-y divide-stone-100 dark:divide-gray-700">
                  {visitas.sospechosas.map((v) => (
                    <li key={v.visitaId} className="px-4 py-2.5">
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
                          {v.cliente?.razonSocial ?? v.nombreContacto}
                          <span className="font-normal text-gray-500 dark:text-gray-400"> · {v.tecnico}</span>
                        </span>
                        <span className="text-xs text-gray-400">{fechaHora(v.fechaLlegadaReal)} · visita #{v.visitaId}</span>
                      </div>
                      {v.motivoVisita && <p className="text-xs text-gray-500 dark:text-gray-400">{v.motivoVisita}</p>}
                      <ul className="mt-1 text-xs text-amber-700 dark:text-amber-400 list-disc pl-4">
                        {v.motivos.map((m) => (
                          <li key={m}>{m}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      <div className={CLASE_PANEL}>
        <TituloPanel
          titulo="Cuadre de material por técnico"
          detalle="Equipos despachados que el técnico todavía tiene sin instalar ni devolver, rollos de cable en uso, cable faltante al cerrar rollos con conteo físico (Metraje → Cerrar → m contados) y consumo de cable por instalación comparado con el equipo."
        />
        {cargandoCuadre && <Cargando />}
        {cuadre && cuadre.tecnicos.length === 0 && <Vacio>Ningún técnico tiene material pendiente.</Vacio>}
        {cuadre && cuadre.tecnicos.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={CLASE_THEAD}>
                <tr>
                  <th className="px-4 py-2">Técnico</th>
                  <th className="px-4 py-2 text-right">Equipos en mano</th>
                  <th className="px-4 py-2 text-right">Rollos activos</th>
                  <th className="px-4 py-2 text-right">Cable faltante</th>
                  <th className="px-4 py-2 text-right">m / instalación</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {cuadre.tecnicos.map((t) => (
                  <Fragment key={t.empleadoId}>
                    <tr className="border-t border-stone-100 dark:border-gray-700">
                      <td className={CLASE_TD}>{t.nombre}</td>
                      <td className={`${CLASE_TD} text-right font-mono tabular-nums`}>
                        {t.equiposEnMano.length}
                        {t.equiposMasDe7Dias > 0 && <span className="ml-1 text-amber-600 dark:text-amber-400 text-xs">({t.equiposMasDe7Dias} &gt; 7 días)</span>}
                      </td>
                      <td className={`${CLASE_TD} text-right font-mono tabular-nums`}>{t.rollosActivos.length}</td>
                      <td className={`${CLASE_TD} text-right font-mono tabular-nums ${t.metrosFaltantes > 0 ? "text-red-600 dark:text-red-400 font-semibold" : ""}`}>
                        {t.metrosFaltantes > 0 ? `${t.metrosFaltantes} m · $${t.valorFaltante}` : "—"}
                      </td>
                      <td className={`${CLASE_TD} text-right font-mono tabular-nums ${t.consumoAlto ? "text-amber-600 dark:text-amber-400 font-semibold" : ""}`}>
                        {t.promedioMetrosPorInstalacion != null ? `${t.promedioMetrosPorInstalacion} m (${t.instalaciones90Dias})` : "—"}
                        {t.consumoAlto && <span className="block text-[10px] font-sans font-normal">muy por encima del promedio</span>}
                      </td>
                      <td className={`${CLASE_TD} text-right`}>
                        {(t.equiposEnMano.length > 0 || t.rollosActivos.length > 0) && (
                          <button onClick={() => setExpandido(expandido === t.empleadoId ? null : t.empleadoId)} className={CLASE_ACCION}>
                            {expandido === t.empleadoId ? "Ocultar" : "Detalle"}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandido === t.empleadoId && (
                      <tr className="bg-stone-50 dark:bg-gray-900/40">
                        <td colSpan={6} className="px-4 py-3">
                          <div className="grid md:grid-cols-2 gap-4 text-xs">
                            <div>
                              <p className={`${CLASE_ETIQUETA} mb-1`}>Equipos en mano</p>
                              {t.equiposEnMano.length === 0 && <p className="text-gray-400">Ninguno</p>}
                              {t.equiposEnMano.map((e) => (
                                <p key={e.detalleId} className={e.dias > 7 ? "text-amber-700 dark:text-amber-400" : "text-gray-600 dark:text-gray-300"}>
                                  {e.producto} · <span className="font-mono">{e.numeroSerie}</span> · hace {e.dias} día(s)
                                </p>
                              ))}
                            </div>
                            <div>
                              <p className={`${CLASE_ETIQUETA} mb-1`}>Rollos activos</p>
                              {t.rollosActivos.length === 0 && <p className="text-gray-400">Ninguno</p>}
                              {t.rollosActivos.map((r) => (
                                <p key={r.id} className="text-gray-600 dark:text-gray-300">
                                  {r.producto} · <span className="font-mono">{r.metrosRestantes} / {r.metrosIniciales} m</span> · hace {r.dias} día(s)
                                </p>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// EQUIPOS SIN RECUPERAR
// ===========================================================================

function SeccionEquipos() {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const [confirmando, setConfirmando] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["centro-control-equipos"],
    queryFn: async () => (await api.get<EquiposNoRecuperados>("/centro-control/equipos-no-recuperados")).data,
  });

  const recuperar = useMutation({
    mutationFn: async (serieId: number) => api.post(`/productos/series/${serieId}/regresar-a-bodega`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["centro-control-equipos"] });
      setConfirmando(null);
      mostrarToast("Equipo devuelto a bodega", "success");
    },
    onError: (error: any) =>
      mostrarToast(error.response?.status === 403 ? "Necesitas el permiso de Productos para devolver equipos a bodega" : error.response?.data?.error ?? "No se pudo devolver el equipo"),
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <TarjetaKpi icono={PackageX} etiqueta="Equipos con serie sin recuperar" valor={String(data?.conSerie.length ?? "—")} color={(data?.conSerie.length ?? 0) > 0 ? "bg-amber-600" : "bg-gray-500"} />
        <TarjetaKpi icono={DollarSign} etiqueta="Valor estimado (costo)" valor={data ? `$${data.valorEstimado}` : "—"} color="bg-brand-700" />
        <TarjetaKpi icono={AlertTriangle} etiqueta="Equipos del acta (texto libre)" valor={String(data?.textoLibre.length ?? "—")} color="bg-gray-500" />
      </div>

      <div className={CLASE_PANEL}>
        <TituloPanel
          titulo="Equipos en comodato de clientes dados de baja"
          detalle="ONUs, routers y demás equipos que quedaron instalados en clientes que ya cancelaron el servicio. Al retirarlos, márcalos como recuperados para que vuelvan a bodega."
        />
        {isLoading && <Cargando />}
        {data && data.conSerie.length === 0 && <Vacio>No hay equipos con número de serie pendientes de recuperar.</Vacio>}
        {data && data.conSerie.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={CLASE_THEAD}>
                <tr>
                  <th className="px-4 py-2">Cliente</th>
                  <th className="px-4 py-2">Equipo</th>
                  <th className="px-4 py-2">Baja</th>
                  <th className="px-4 py-2 text-right">Costo</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.conSerie.map((e) => (
                  <tr key={e.numeroSerieProductoId} className="border-t border-stone-100 dark:border-gray-700">
                    <td className={CLASE_TD}>
                      {e.cliente.razonSocial}
                      {e.cliente.direccion && <span className="block text-xs text-gray-400">{e.cliente.direccion}</span>}
                    </td>
                    <td className={CLASE_TD}>
                      {e.producto}
                      <span className="block font-mono text-[11px] text-gray-400">{e.numeroSerie}</span>
                    </td>
                    <td className={`${CLASE_TD} text-gray-600 dark:text-gray-300`}>{fechaCorta(e.cliente.fechaBaja)}</td>
                    <td className={`${CLASE_TD} text-right font-mono tabular-nums`}>{e.costo ? `$${Number(e.costo).toFixed(2)}` : "—"}</td>
                    <td className={`${CLASE_TD} text-right whitespace-nowrap`}>
                      {confirmando === e.numeroSerieProductoId ? (
                        <span className="flex items-center justify-end gap-2">
                          <span className="text-[11px] text-gray-500">¿Ya está físicamente en bodega?</span>
                          <button onClick={() => recuperar.mutate(e.numeroSerieProductoId)} disabled={recuperar.isPending} className={CLASE_ACCION}>
                            Sí
                          </button>
                          <button onClick={() => setConfirmando(null)} className="text-xs text-gray-500 hover:underline">
                            No
                          </button>
                        </span>
                      ) : (
                        <span className="flex items-center justify-end gap-3">
                          <BotonWhatsapp telefono={e.cliente.telefono} mensaje={`Estimado/a ${e.cliente.razonSocial}: le escribimos para coordinar el retiro del equipo de internet (${e.producto}) que quedó en su domicilio.`} />
                          <button onClick={() => setConfirmando(e.numeroSerieProductoId)} className={CLASE_ACCION}>
                            Marcar recuperado
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data && data.textoLibre.length > 0 && (
        <div className={CLASE_PANEL}>
          <TituloPanel titulo="Equipos anotados a mano en el acta" detalle="Equipos con serial escrito a mano en el acta de visita (no elegidos del catálogo), en clientes dados de baja. Solo informativo." />
          <table className="w-full text-sm">
            <thead className={CLASE_THEAD}>
              <tr>
                <th className="px-4 py-2">Cliente</th>
                <th className="px-4 py-2">Equipo</th>
                <th className="px-4 py-2">Instalado</th>
              </tr>
            </thead>
            <tbody>
              {data.textoLibre.map((e) => (
                <tr key={e.id} className="border-t border-stone-100 dark:border-gray-700">
                  <td className={CLASE_TD}>{e.cliente?.razonSocial ?? "—"}</td>
                  <td className={CLASE_TD}>
                    {e.tipo} {e.modelo}
                    <span className="block font-mono text-[11px] text-gray-400">{e.serial}</span>
                  </td>
                  <td className={`${CLASE_TD} text-gray-600 dark:text-gray-300`}>{fechaCorta(e.fechaInstalacion)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// COMBUSTIBLE
// ===========================================================================

function SeccionCombustible() {
  const [desde, setDesde] = useState(haceDias(60));
  const [hasta, setHasta] = useState(aInputDate(new Date()));
  const { data, isLoading } = useQuery({
    queryKey: ["centro-control-combustible", desde, hasta],
    queryFn: async () => (await api.get<AnomaliaCombustible[]>("/centro-control/combustible/anomalias", { params: { desde, hasta } })).data,
  });
  const costo = data?.reduce((s, a) => s + Number(a.costoTotal), 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <TarjetaKpi icono={Fuel} etiqueta="Cargas anormales" valor={String(data?.length ?? "—")} color={(data?.length ?? 0) > 0 ? "bg-amber-600" : "bg-gray-500"} />
        <TarjetaKpi icono={DollarSign} etiqueta="Monto de esas cargas" valor={`$${costo.toFixed(2)}`} color="bg-brand-700" />
      </div>
      <div className={CLASE_PANEL}>
        <TituloPanel
          titulo="Cargas de combustible anormales"
          detalle="Cargas donde el vehículo rindió menos del 70% de su propio rendimiento habitual (posible desvío de combustible, falla mecánica o error al anotar el odómetro), o donde el odómetro no avanzó respecto a la carga anterior."
          acciones={<FiltroFechas desde={desde} hasta={hasta} onCambiar={(d, h) => { setDesde(d); setHasta(h); }} />}
        />
        {isLoading && <Cargando />}
        {data && data.length === 0 && <Vacio>Ninguna carga anormal en el período.</Vacio>}
        {data && data.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={CLASE_THEAD}>
                <tr>
                  <th className="px-4 py-2">Fecha</th>
                  <th className="px-4 py-2">Vehículo</th>
                  <th className="px-4 py-2 text-right">Odómetro</th>
                  <th className="px-4 py-2 text-right">Galones</th>
                  <th className="px-4 py-2 text-right">Costo</th>
                  <th className="px-4 py-2">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {data.map((a) => (
                  <tr key={a.cargaId} className="border-t border-stone-100 dark:border-gray-700 align-top">
                    <td className={`${CLASE_TD} whitespace-nowrap`}>{fechaCorta(a.fecha)}</td>
                    <td className={CLASE_TD}>
                      <span className="font-mono">{a.placa}</span>
                      {a.registradoPor && <span className="block text-xs text-gray-400">registró {a.registradoPor}</span>}
                      {a.gasolinera && <span className="block text-xs text-gray-400">{a.gasolinera}</span>}
                    </td>
                    <td className={`${CLASE_TD} text-right font-mono tabular-nums`}>{a.kilometraje.toLocaleString("es-EC")}</td>
                    <td className={`${CLASE_TD} text-right font-mono tabular-nums`}>{a.galones}</td>
                    <td className={`${CLASE_TD} text-right font-mono tabular-nums`}>${a.costoTotal}</td>
                    <td className={`${CLASE_TD} text-amber-700 dark:text-amber-400 text-xs`}>{a.motivo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// NEGOCIO ISP
// ===========================================================================

function SeccionNegocio() {
  const [verMorosos, setVerMorosos] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["centro-control-indicadores"],
    queryFn: async () => (await api.get<IndicadoresIsp>("/centro-control/indicadores-isp")).data,
  });

  if (isLoading || !data) return <div className={CLASE_PANEL}><Cargando /></div>;

  const bajasUltimos12 = data.meses.reduce((s, m) => s + m.bajas, 0);
  const altasUltimos12 = data.meses.reduce((s, m) => s + m.altas, 0);
  const churnesValidos = data.meses.filter((m) => m.churnPorcentaje !== null);
  const churnPromedio = churnesValidos.length > 0 ? churnesValidos.reduce((s, m) => s + m.churnPorcentaje!, 0) / churnesValidos.length : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <TarjetaKpi icono={Users} etiqueta="Clientes activos" valor={data.clientesActivos.toLocaleString("es-EC")} color="bg-brand-700" />
        <TarjetaKpi icono={Wallet} etiqueta="Ingreso mensual recurrente" valor={`$${Number(data.ingresoMensualRecurrente).toLocaleString("es-EC", { minimumFractionDigits: 2 })}`} color="bg-emerald-600" />
        <TarjetaKpi icono={DollarSign} etiqueta="Ingreso promedio por cliente" valor={`$${data.arpu}`} color="bg-sky-600" />
        <TarjetaKpi icono={Percent} etiqueta="Morosidad del ciclo" valor={`${data.morosidad.porcentaje}%`} color={data.morosidad.porcentaje >= 10 ? "bg-red-600" : data.morosidad.porcentaje > 0 ? "bg-amber-600" : "bg-gray-500"} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 items-start">
        <div className={`${CLASE_PANEL} lg:col-span-2`}>
          <TituloPanel
            titulo="Altas y bajas por mes"
            detalle={`Últimos 12 meses: ${altasUltimos12} alta(s), ${bajasUltimos12} baja(s)${churnPromedio !== null ? ` · pérdida mensual promedio ${churnPromedio.toFixed(1)}%` : ""}`}
          />
          <div className="px-2 py-3">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.meses} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                <XAxis dataKey="mes" tick={{ fill: "var(--chart-muted)", fontSize: 11 }} axisLine={{ stroke: "var(--chart-axis)" }} tickLine={false} tickFormatter={(m) => String(m).slice(5) + "/" + String(m).slice(2, 4)} />
                <YAxis allowDecimals={false} tick={{ fill: "var(--chart-muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
                <Tooltip
                  cursor={{ fill: "var(--chart-grid)" }}
                  contentStyle={{ background: "var(--chart-tooltip-bg)", border: "1px solid var(--chart-tooltip-border)", color: "var(--chart-tooltip-text)", fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="altas" name="Altas" fill="var(--chart-series-1)" radius={[1, 1, 0, 0]} maxBarSize={18} />
                <Bar dataKey="bajas" name="Bajas" fill="#d97706" radius={[1, 1, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={CLASE_PANEL}>
          <TituloPanel titulo="Clientes por plan" />
          <table className="w-full text-sm">
            <tbody>
              {data.porPlan.map((p) => (
                <tr key={p.plan} className="border-t border-stone-100 dark:border-gray-700 first:border-t-0">
                  <td className={CLASE_TD}>{p.plan}</td>
                  <td className={`${CLASE_TD} text-right font-mono tabular-nums`}>{p.clientes}</td>
                  <td className={`${CLASE_TD} text-right font-mono tabular-nums text-gray-500`}>${Number(p.ingreso).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={CLASE_PANEL}>
        <TituloPanel
          titulo="Cobranza del ciclo en curso"
          detalle={`${data.morosidad.alDia} al día · ${data.morosidad.pendientesDentroDePlazo} pendientes pero todavía dentro de su plazo · ${data.morosidad.morosos} vencidos por $${data.morosidad.montoMoroso}`}
          acciones={
            data.morosidad.morosos > 0 && (
              <button onClick={() => setVerMorosos(!verMorosos)} className={CLASE_ACCION}>
                {verMorosos ? "Ocultar" : `Ver ${data.morosidad.morosos} moroso(s)`}
              </button>
            )
          }
        />
        {verMorosos && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={CLASE_THEAD}>
                <tr>
                  <th className="px-4 py-2">Cliente</th>
                  <th className="px-4 py-2">Plan</th>
                  <th className="px-4 py-2 text-right">Monto</th>
                  <th className="px-4 py-2 text-right">Días de atraso</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.morosidad.detalle.map((m) => (
                  <tr key={m.id} className="border-t border-stone-100 dark:border-gray-700">
                    <td className={CLASE_TD}>
                      {m.razonSocial}
                      {m.enProrroga && <span className="ml-2 font-mono text-[10px] uppercase border border-sky-500 text-sky-600 px-1 rounded-sm">prórroga</span>}
                    </td>
                    <td className={`${CLASE_TD} text-gray-600 dark:text-gray-300`}>{m.plan}</td>
                    <td className={`${CLASE_TD} text-right font-mono tabular-nums`}>${m.monto}</td>
                    <td className={`${CLASE_TD} text-right font-mono tabular-nums ${m.diasAtraso > 10 ? "text-red-600 dark:text-red-400 font-semibold" : ""}`}>{m.diasAtraso}</td>
                    <td className={`${CLASE_TD} text-right`}>
                      <BotonWhatsapp telefono={m.telefono} conTexto mensaje={`Estimado/a ${m.razonSocial}: le recordamos que su pago del plan ${m.plan} ($${m.monto}) está pendiente. Si ya pagó, por favor envíenos el comprobante. ¡Gracias!`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <div className={CLASE_PANEL}>
          <TituloPanel
            titulo="Clientes que se suspenden seguido"
            detalle={
              data.historialSuspensionesDesde
                ? `2 o más suspensiones en los últimos 6 meses (historial desde ${fechaCorta(data.historialSuspensionesDesde)}).`
                : "El historial de suspensiones empezó a registrarse con esta versión — se irá llenando con el tiempo."
            }
          />
          {data.suspensionesRepetidas.length === 0 ? (
            <Vacio>Nadie todavía.</Vacio>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {data.suspensionesRepetidas.map((c) => (
                  <tr key={c.id} className="border-t border-stone-100 dark:border-gray-700 first:border-t-0">
                    <td className={CLASE_TD}>
                      {c.razonSocial}
                      {!c.activo && <span className="ml-2 text-xs text-gray-400">(dado de baja)</span>}
                    </td>
                    <td className={`${CLASE_TD} text-right font-mono tabular-nums`}>{c.suspensiones}×</td>
                    <td className={`${CLASE_TD} text-right`}>
                      <BotonWhatsapp telefono={c.telefono} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className={CLASE_PANEL}>
          <TituloPanel titulo="Motivos de baja (12 meses)" />
          {data.motivosBaja.length === 0 ? (
            <Vacio>Sin bajas en los últimos 12 meses.</Vacio>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {data.motivosBaja.map((m) => (
                  <tr key={m.motivo} className="border-t border-stone-100 dark:border-gray-700 first:border-t-0">
                    <td className={CLASE_TD}>{m.motivo}</td>
                    <td className={`${CLASE_TD} text-right font-mono tabular-nums`}>{m.cantidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// ENCUESTAS
// ===========================================================================

function Estrellas({ valor }: { valor: number | null }) {
  if (valor === null) return <span className="text-xs text-gray-400">sin respuesta</span>;
  return (
    <span className={`font-mono text-sm ${valor <= 2 ? "text-red-600 dark:text-red-400" : valor >= 4 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600"}`}>
      {"★".repeat(valor)}
      <span className="text-gray-300 dark:text-gray-600">{"★".repeat(5 - valor)}</span>
    </span>
  );
}

function SeccionEncuestas() {
  const [desde, setDesde] = useState(haceDias(30));
  const [hasta, setHasta] = useState(aInputDate(new Date()));
  const { data, isLoading } = useQuery({
    queryKey: ["centro-control-encuestas", desde, hasta],
    queryFn: async () => (await api.get<ResumenEncuestas>("/centro-control/encuestas", { params: { desde, hasta } })).data,
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <TarjetaKpi icono={Star} etiqueta="Calificación promedio" valor={data?.promedio != null ? `${data.promedio} / 5` : "—"} color={data?.promedio != null && data.promedio < 3.5 ? "bg-amber-600" : "bg-emerald-600"} />
        <TarjetaKpi icono={Users} etiqueta="Encuestas enviadas" valor={String(data?.enviadas ?? "—")} color="bg-brand-700" />
        <TarjetaKpi
          icono={Percent}
          etiqueta="Tasa de respuesta"
          valor={data && data.enviadas > 0 ? `${Math.round((data.respondidas / data.enviadas) * 100)}%` : "—"}
          color="bg-sky-600"
        />
      </div>

      {data && data.enviadas === 0 && (
        <div className="border border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/30 rounded-sm px-4 py-3 text-sm text-sky-800 dark:text-sky-300">
          Para activar las encuestas: crea en tu Meta Business Manager una plantilla de WhatsApp (categoría "Utility") con dos parámetros —
          {" {{1}}"} nombre del cliente y {"{{2}}"} nombre del técnico — que pida responder con un número del 1 al 5, y escribe su nombre
          en <b>Ajustes → WhatsApp → Plantilla de encuesta</b>. Se envía sola 1 hora después de cada visita (entre 8:00 y 20:00).
        </div>
      )}

      <div className={CLASE_PANEL}>
        <TituloPanel titulo="Por técnico" acciones={<FiltroFechas desde={desde} hasta={hasta} onCambiar={(d, h) => { setDesde(d); setHasta(h); }} />} />
        {isLoading && <Cargando />}
        {data && data.porTecnico.length > 0 && (
          <table className="w-full text-sm">
            <thead className={CLASE_THEAD}>
              <tr>
                <th className="px-4 py-2">Técnico</th>
                <th className="px-4 py-2 text-right">Enviadas</th>
                <th className="px-4 py-2 text-right">Respondidas</th>
                <th className="px-4 py-2 text-right">Notas de 1-2</th>
                <th className="px-4 py-2 text-right">Promedio</th>
              </tr>
            </thead>
            <tbody>
              {data.porTecnico.map((t) => (
                <tr key={t.empleadoId} className="border-t border-stone-100 dark:border-gray-700">
                  <td className={CLASE_TD}>{t.nombre}</td>
                  <td className={`${CLASE_TD} text-right font-mono tabular-nums`}>{t.enviadas}</td>
                  <td className={`${CLASE_TD} text-right font-mono tabular-nums`}>{t.respondidas}</td>
                  <td className={`${CLASE_TD} text-right font-mono tabular-nums ${t.calificacionesBajas > 0 ? "text-red-600 dark:text-red-400" : ""}`}>{t.calificacionesBajas}</td>
                  <td className={`${CLASE_TD} text-right font-mono tabular-nums font-semibold`}>{t.promedio ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {data && data.encuestas.length > 0 && (
        <div className={CLASE_PANEL}>
          <TituloPanel titulo="Respuestas" />
          <ul className="divide-y divide-stone-100 dark:divide-gray-700">
            {data.encuestas.map((e) => (
              <li key={e.id} className="px-4 py-2.5 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-gray-800 dark:text-gray-100">
                    {e.cliente} <span className="text-gray-500 dark:text-gray-400">· {e.tecnico}</span>
                  </p>
                  {e.comentario && <p className="text-xs text-gray-600 dark:text-gray-300 italic">"{e.comentario}"</p>}
                  <p className="text-[11px] text-gray-400">
                    Enviada {fechaHora(e.enviadaEn)}
                    {e.motivoVisita && ` · ${e.motivoVisita}`}
                  </p>
                </div>
                <Estrellas valor={e.calificacion} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
