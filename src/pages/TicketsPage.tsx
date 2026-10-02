import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, Clock, AlertTriangle, CheckCircle2, MessageCircle, Phone, User, Monitor } from "lucide-react";
import { api, type TicketSoporte, type TicketDetalle, type ResumenTickets, type EstadoTicket, type PrioridadTicket, type TecnicosCercanos } from "../api/client";
import { PageHeader } from "../components/PageHeader";
import { TarjetaKpi, CLASE_CAMPO, CLASE_ETIQUETA, CLASE_THEAD, CLASE_TITULO_SECCION, CLASE_ACCION } from "../components/FormatoDocumento";
import { BuscadorCliente } from "../components/BuscadorCliente";
import { BotonWhatsapp } from "../components/BotonWhatsapp";
import { useToast } from "../components/ToastProvider";
import { useDebounce } from "../hooks/useDebounce";

// Tickets de soporte — bandeja de reclamos de clientes. Entran a mano o
// solos por WhatsApp (ver backend/src/utils/tickets.ts). El detalle y el
// formulario de nuevo ticket se muestran EN FLUJO (no en ventanas flotantes
// position:fixed, ver memoria del proyecto sobre ese problema de pintado).

const CATEGORIAS: { valor: string; etiqueta: string }[] = [
  { valor: "SIN_SERVICIO", etiqueta: "Sin servicio" },
  { valor: "LENTITUD", etiqueta: "Lentitud" },
  { valor: "INTERMITENCIA", etiqueta: "Intermitencia" },
  { valor: "FACTURACION", etiqueta: "Facturación / pagos" },
  { valor: "CAMBIO_PLAN", etiqueta: "Cambio de plan" },
  { valor: "TRASLADO", etiqueta: "Traslado de servicio" },
  { valor: "OTRO", etiqueta: "Otro" },
];
const ETIQUETA_CATEGORIA = Object.fromEntries(CATEGORIAS.map((c) => [c.valor, c.etiqueta]));

const ETIQUETA_ESTADO: Record<EstadoTicket, string> = { ABIERTO: "Abierto", EN_PROCESO: "En proceso", RESUELTO: "Resuelto", CANCELADO: "Cancelado" };
const COLOR_ESTADO: Record<EstadoTicket, string> = {
  ABIERTO: "border-sky-500 text-sky-700 dark:text-sky-300",
  EN_PROCESO: "border-amber-500 text-amber-700 dark:text-amber-300",
  RESUELTO: "border-emerald-500 text-emerald-700 dark:text-emerald-300",
  CANCELADO: "border-gray-400 text-gray-500",
};
const COLOR_PRIORIDAD: Record<PrioridadTicket, string> = {
  ALTA: "bg-red-600 text-white",
  MEDIA: "bg-amber-500 text-white",
  BAJA: "bg-gray-400 text-white",
};
const ICONO_CANAL = { WHATSAPP: MessageCircle, LLAMADA: Phone, PRESENCIAL: User, SISTEMA: Monitor } as const;

interface Tecnico {
  id: number;
  nombres: string;
  apellidos: string;
  cargo: string;
}

type Filtro = "pendientes" | "todos" | "resueltos";

const FORM_VACIO = {
  clienteId: "" as number | "",
  nombreContacto: "",
  telefono: "",
  canal: "LLAMADA",
  categoria: "SIN_SERVICIO",
  prioridad: "ALTA" as PrioridadTicket,
  asunto: "",
  descripcion: "",
  asignadoEmpleadoId: "",
};

function fechaHora(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-EC", { dateStyle: "short", timeStyle: "short" });
}

function hoyInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function textoDistancia(metros: number): string {
  return metros < 1000 ? `${metros} m` : `${(metros / 1000).toFixed(1)} km`;
}

// Técnicos ordenados por cercanía a la casa del cliente (según la última
// ubicación GPS de su celular) — para elegir a quién mandar sin abrir el mapa.
function SugerenciaTecnicos({ ticketId, onElegir, elegido }: { ticketId: number; onElegir: (empleadoId: number) => void; elegido: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["tickets-tecnicos-cercanos", ticketId],
    queryFn: async () => (await api.get<TecnicosCercanos>(`/tickets/${ticketId}/tecnicos-cercanos`)).data,
    refetchInterval: 60_000,
  });
  if (isLoading || !data) return <p className="text-xs text-gray-400">Buscando técnicos cercanos...</p>;
  return (
    <div className="w-full">
      <p className={`${CLASE_ETIQUETA} mb-1`}>
        {data.clienteConUbicacion ? "Técnicos más cercanos al cliente ahora" : "El cliente no tiene ubicación guardada — técnicos por carga de trabajo"}
      </p>
      <ul className="divide-y divide-stone-200 dark:divide-gray-700 border border-stone-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        {data.tecnicos.slice(0, 5).map((t, i) => (
          <li key={t.empleadoId} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-2 py-1.5 text-sm">
            <span className="flex-1 min-w-32">
              {t.nombre}
              {i === 0 && t.distanciaMetros != null && <span className="ml-2 font-mono text-[10px] uppercase tracking-wider border border-emerald-500 text-emerald-700 dark:text-emerald-400 px-1 rounded-sm">Más cerca</span>}
            </span>
            <span className="font-mono text-xs tabular-nums text-gray-600 dark:text-gray-300">
              {t.distanciaMetros != null ? `${textoDistancia(t.distanciaMetros)} · hace ${t.minutosDesdeUbicacion} min` : "sin ubicación reciente"}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">{t.visitasPendientesHoy} visita(s) pendiente(s) hoy</span>
            <button
              onClick={() => onElegir(t.empleadoId)}
              className={`text-xs font-semibold ${elegido === String(t.empleadoId) ? "text-emerald-700 dark:text-emerald-400" : "text-brand-700 dark:text-brand-300 hover:underline"}`}
            >
              {elegido === String(t.empleadoId) ? "Elegido" : "Elegir"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TiempoSla({ ticket }: { ticket: TicketSoporte }) {
  const { horasTranscurridas, horasLimite, vencido } = ticket.sla;
  const cerrado = ticket.estado === "RESUELTO" || ticket.estado === "CANCELADO";
  const texto = horasTranscurridas < 1 ? `${Math.round(horasTranscurridas * 60)} min` : `${horasTranscurridas} h`;
  return (
    <span className={`font-mono text-xs tabular-nums ${vencido ? "text-red-600 dark:text-red-400 font-semibold" : cerrado ? "text-gray-400" : "text-gray-600 dark:text-gray-300"}`}>
      {texto} / {horasLimite} h{vencido && !cerrado ? " · vencido" : ""}
    </span>
  );
}

export function TicketsPage() {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const [filtro, setFiltro] = useState<Filtro>("pendientes");
  const [texto, setTexto] = useState("");
  const textoDebounced = useDebounce(texto);
  const [seleccionado, setSeleccionado] = useState<number | null>(null);
  const [creando, setCreando] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);

  const estadoParam = filtro === "pendientes" ? "ABIERTO,EN_PROCESO" : filtro === "resueltos" ? "RESUELTO,CANCELADO" : undefined;

  const { data: tickets, isLoading } = useQuery({
    queryKey: ["tickets", filtro, textoDebounced],
    queryFn: async () => (await api.get<TicketSoporte[]>("/tickets", { params: { estado: estadoParam, q: textoDebounced || undefined } })).data,
    refetchInterval: 30_000,
  });
  const { data: resumen } = useQuery({
    queryKey: ["tickets-resumen"],
    queryFn: async () => (await api.get<ResumenTickets>("/tickets/resumen")).data,
    refetchInterval: 60_000,
  });
  const { data: tecnicos } = useQuery({
    queryKey: ["tickets-tecnicos"],
    queryFn: async () => (await api.get<Tecnico[]>("/tickets/tecnicos")).data,
  });

  const crear = useMutation({
    mutationFn: async () =>
      (
        await api.post<TicketSoporte>("/tickets", {
          ...form,
          clienteId: form.clienteId || undefined,
          asignadoEmpleadoId: form.asignadoEmpleadoId ? Number(form.asignadoEmpleadoId) : undefined,
        })
      ).data,
    onSuccess: (ticket) => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["tickets-resumen"] });
      setForm(FORM_VACIO);
      setCreando(false);
      setSeleccionado(ticket.id);
      mostrarToast(`Ticket #${ticket.id} creado${ticket.alertaRed ? " — vinculado a un corte de red ya detectado" : ""}`, "success");
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "No se pudo crear el ticket"),
  });

  return (
    <div>
      <PageHeader
        titulo="Tickets de Soporte"
        subtitulo="Reclamos y pedidos de clientes, desde que llegan hasta que se resuelven. Los mensajes de WhatsApp entran solos."
        acciones={
          <button
            onClick={() => setCreando(!creando)}
            className="bg-brand-700 hover:bg-brand-800 text-white text-sm font-semibold px-3 py-1.5 rounded-sm"
          >
            {creando ? "Cancelar" : "+ Nuevo ticket"}
          </button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <TarjetaKpi icono={Inbox} etiqueta="Abiertos" valor={String(resumen?.abiertos ?? "—")} color="bg-sky-600" />
        <TarjetaKpi icono={Clock} etiqueta="En proceso" valor={String(resumen?.enProceso ?? "—")} color="bg-amber-600" />
        <TarjetaKpi icono={AlertTriangle} etiqueta="Fuera de tiempo" valor={String(resumen?.vencidos ?? "—")} color={(resumen?.vencidos ?? 0) > 0 ? "bg-red-600" : "bg-gray-500"} />
        <TarjetaKpi
          icono={CheckCircle2}
          etiqueta="Resueltos a tiempo (30 días)"
          valor={resumen?.porcentajeDentroSla30Dias != null ? `${resumen.porcentajeDentroSla30Dias}% de ${resumen.resueltos30Dias}` : "—"}
          color="bg-emerald-600"
        />
      </div>

      {creando && (
        <div className="bg-white dark:bg-gray-800 rounded-sm border border-stone-300 dark:border-gray-700 p-4 mb-4">
          <h3 className={`${CLASE_TITULO_SECCION} mb-3`}>Nuevo ticket</h3>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <span className={CLASE_ETIQUETA}>Cliente (opcional si es alguien que todavía no es cliente)</span>
              <BuscadorCliente clienteId={form.clienteId} onSeleccionar={(id) => setForm({ ...form, clienteId: id })} />
            </div>
            {!form.clienteId && (
              <>
                <label>
                  <span className={CLASE_ETIQUETA}>Nombre de contacto</span>
                  <input value={form.nombreContacto} onChange={(e) => setForm({ ...form, nombreContacto: e.target.value })} className={CLASE_CAMPO} />
                </label>
                <label>
                  <span className={CLASE_ETIQUETA}>Teléfono</span>
                  <input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} className={CLASE_CAMPO} />
                </label>
              </>
            )}
            <label>
              <span className={CLASE_ETIQUETA}>Canal</span>
              <select value={form.canal} onChange={(e) => setForm({ ...form, canal: e.target.value })} className={CLASE_CAMPO}>
                <option value="LLAMADA">Llamada</option>
                <option value="WHATSAPP">WhatsApp</option>
                <option value="PRESENCIAL">En persona</option>
                <option value="SISTEMA">Interno</option>
              </select>
            </label>
            <label>
              <span className={CLASE_ETIQUETA}>Categoría</span>
              <select
                value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value, prioridad: e.target.value === "SIN_SERVICIO" ? "ALTA" : form.prioridad === "ALTA" ? "MEDIA" : form.prioridad })}
                className={CLASE_CAMPO}
              >
                {CATEGORIAS.map((c) => (
                  <option key={c.valor} value={c.valor}>
                    {c.etiqueta}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className={CLASE_ETIQUETA}>Prioridad (tiempo para resolver)</span>
              <select value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value as PrioridadTicket })} className={CLASE_CAMPO}>
                <option value="ALTA">Alta — 4 horas</option>
                <option value="MEDIA">Media — 24 horas</option>
                <option value="BAJA">Baja — 72 horas</option>
              </select>
            </label>
            <label>
              <span className={CLASE_ETIQUETA}>Asignar a (opcional)</span>
              <select value={form.asignadoEmpleadoId} onChange={(e) => setForm({ ...form, asignadoEmpleadoId: e.target.value })} className={CLASE_CAMPO}>
                <option value="">— Sin asignar —</option>
                {tecnicos?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombres} {t.apellidos}
                  </option>
                ))}
              </select>
            </label>
            <label className="md:col-span-2">
              <span className={CLASE_ETIQUETA}>Asunto</span>
              <input value={form.asunto} onChange={(e) => setForm({ ...form, asunto: e.target.value })} placeholder="Ej. Sin internet desde la mañana" className={CLASE_CAMPO} />
            </label>
            <label className="md:col-span-2">
              <span className={CLASE_ETIQUETA}>Lo que cuenta el cliente</span>
              <textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} rows={3} className={CLASE_CAMPO} />
            </label>
          </div>
          <div className="flex justify-end mt-3">
            <button
              onClick={() => crear.mutate()}
              disabled={crear.isPending || !form.asunto.trim() || (!form.clienteId && !form.nombreContacto.trim())}
              className="bg-brand-700 hover:bg-brand-800 disabled:opacity-50 text-white text-sm font-semibold px-4 py-1.5 rounded-sm"
            >
              {crear.isPending ? "Guardando..." : "Crear ticket"}
            </button>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-5 gap-4 items-start">
        <div className={`bg-white dark:bg-gray-800 rounded-sm border border-stone-300 dark:border-gray-700 ${seleccionado ? "lg:col-span-2" : "lg:col-span-5"}`}>
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-stone-200 dark:border-gray-700">
            {(["pendientes", "todos", "resueltos"] as Filtro[]).map((f) => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={`text-xs px-2 py-1 rounded-sm ${filtro === f ? "bg-brand-700 text-white font-semibold" : "text-gray-500 dark:text-gray-400 hover:bg-stone-100 dark:hover:bg-gray-700"}`}
              >
                {f === "pendientes" ? "Pendientes" : f === "todos" ? "Todos" : "Cerrados"}
              </button>
            ))}
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Buscar por cliente, teléfono, asunto o N°..."
              className={`${CLASE_CAMPO} !w-auto flex-1 min-w-40 !py-1 !text-xs`}
            />
          </div>
          {isLoading && <p className="px-4 py-6 text-center text-sm text-gray-400">Cargando...</p>}
          {tickets && tickets.length === 0 && <p className="px-4 py-6 text-center text-sm text-gray-400">No hay tickets {filtro === "pendientes" ? "pendientes" : "con ese filtro"}.</p>}
          {tickets && tickets.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className={CLASE_THEAD}>
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Cliente / asunto</th>
                    {!seleccionado && <th className="px-3 py-2">Asignado</th>}
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2 text-right">Tiempo</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t) => {
                    const IconoCanal = ICONO_CANAL[t.canal] ?? Monitor;
                    return (
                      <tr
                        key={t.id}
                        onClick={() => setSeleccionado(t.id === seleccionado ? null : t.id)}
                        className={`border-t border-stone-100 dark:border-gray-700 cursor-pointer align-top ${t.id === seleccionado ? "bg-brand-50 dark:bg-brand-900/30" : "hover:bg-stone-50 dark:hover:bg-gray-700/30"}`}
                      >
                        <td className="px-3 py-2 font-mono text-xs text-gray-500">{t.id}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <span className={`font-mono text-[9px] px-1 rounded-sm ${COLOR_PRIORIDAD[t.prioridad]}`}>{t.prioridad}</span>
                            <IconoCanal strokeWidth={1.75} className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span className="font-medium text-gray-800 dark:text-gray-100 truncate">{t.cliente?.razonSocial ?? t.nombreContacto}</span>
                            {!t.cliente && <span className="text-[10px] text-gray-400">(no vinculado)</span>}
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-md">
                            {ETIQUETA_CATEGORIA[t.categoria] ?? t.categoria} · {t.asunto}
                          </p>
                          {t.alertaRed && !t.alertaRed.fechaFin && <p className="text-[11px] text-red-600 dark:text-red-400">En sector con corte de red detectado</p>}
                        </td>
                        {!seleccionado && (
                          <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-300">
                            {t.asignadoEmpleado ? `${t.asignadoEmpleado.nombres} ${t.asignadoEmpleado.apellidos}` : <span className="text-gray-400">—</span>}
                          </td>
                        )}
                        <td className="px-3 py-2">
                          <span className={`font-mono text-[10px] uppercase tracking-wider border px-1 rounded-sm whitespace-nowrap ${COLOR_ESTADO[t.estado]}`}>{ETIQUETA_ESTADO[t.estado]}</span>
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <TiempoSla ticket={t} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {seleccionado && (
          <div className="lg:col-span-3">
            <DetalleTicket id={seleccionado} tecnicos={tecnicos ?? []} onCerrar={() => setSeleccionado(null)} />
          </div>
        )}
      </div>

      {resumen && resumen.porTecnico.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-sm border border-stone-300 dark:border-gray-700 mt-4">
          <h3 className={`${CLASE_TITULO_SECCION} px-4 py-3 border-b border-stone-200 dark:border-gray-700`}>Tickets resueltos por técnico (30 días)</h3>
          <table className="w-full text-sm">
            <thead className={CLASE_THEAD}>
              <tr>
                <th className="px-4 py-2">Técnico</th>
                <th className="px-4 py-2 text-right">Resueltos</th>
                <th className="px-4 py-2 text-right">Tiempo promedio</th>
                <th className="px-4 py-2 text-right">A tiempo</th>
              </tr>
            </thead>
            <tbody>
              {resumen.porTecnico.map((t) => (
                <tr key={t.nombre} className="border-t border-stone-100 dark:border-gray-700">
                  <td className="px-4 py-2">{t.nombre}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{t.resueltos}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{t.horasPromedio} h</td>
                  <td className={`px-4 py-2 text-right font-mono tabular-nums ${t.porcentajeDentroSla < 80 ? "text-amber-600 dark:text-amber-400" : ""}`}>{t.porcentajeDentroSla}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DetalleTicket({ id, tecnicos, onCerrar }: { id: number; tecnicos: Tecnico[]; onCerrar: () => void }) {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const [mensaje, setMensaje] = useState("");
  const [solucion, setSolucion] = useState("");
  const [agendando, setAgendando] = useState(false);
  const [visita, setVisita] = useState({ empleadoId: "", fecha: hoyInput() });

  const { data: ticket, isLoading } = useQuery({
    queryKey: ["ticket", id],
    queryFn: async () => (await api.get<TicketDetalle>(`/tickets/${id}`)).data,
    refetchInterval: 20_000,
  });

  function refrescar() {
    queryClient.invalidateQueries({ queryKey: ["ticket", id] });
    queryClient.invalidateQueries({ queryKey: ["tickets"] });
    queryClient.invalidateQueries({ queryKey: ["tickets-resumen"] });
  }

  const actualizar = useMutation({
    mutationFn: async (cambios: Record<string, unknown>) => api.patch(`/tickets/${id}`, cambios),
    onSuccess: () => {
      refrescar();
      setSolucion("");
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "No se pudo actualizar el ticket"),
  });

  const enviarMensaje = useMutation({
    mutationFn: async (enviarWhatsapp: boolean) => api.post(`/tickets/${id}/mensajes`, { texto: mensaje, enviarWhatsapp }),
    onSuccess: (_r, enviarWhatsapp) => {
      setMensaje("");
      refrescar();
      if (enviarWhatsapp) mostrarToast("Respuesta enviada por WhatsApp", "success");
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "No se pudo guardar el mensaje"),
  });

  const agendar = useMutation({
    mutationFn: async () => api.post(`/tickets/${id}/visita`, { empleadoId: Number(visita.empleadoId), fecha: visita.fecha }),
    onSuccess: () => {
      setAgendando(false);
      refrescar();
      mostrarToast("Visita agendada en la ruta del técnico", "success");
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "No se pudo agendar la visita"),
  });

  if (isLoading || !ticket) {
    return <div className="bg-white dark:bg-gray-800 rounded-sm border border-stone-300 dark:border-gray-700 p-6 text-center text-sm text-gray-400">Cargando...</div>;
  }

  const cerrado = ticket.estado === "RESUELTO" || ticket.estado === "CANCELADO";
  const telefono = ticket.telefono ?? ticket.cliente?.telefono ?? null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-sm border border-stone-300 dark:border-gray-700">
      <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-stone-200 dark:border-gray-700">
        <div className="min-w-0">
          <p className="font-mono text-[11px] text-gray-400">
            Ticket #{ticket.id} · {fechaHora(ticket.createdAt)}
            {ticket.creadoPorUsuario && ` · registró ${ticket.creadoPorUsuario.nombre}`}
          </p>
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-50">{ticket.asunto}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {ticket.cliente?.razonSocial ?? ticket.nombreContacto}
            {telefono && <span className="font-mono text-xs text-gray-400"> · {telefono}</span>}
            {telefono && <span className="ml-2"><BotonWhatsapp telefono={telefono} conTexto /></span>}
          </p>
          {ticket.cliente?.direccion && <p className="text-xs text-gray-400">{ticket.cliente.direccion}</p>}
        </div>
        <button onClick={onCerrar} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-lg leading-none" aria-label="Cerrar detalle">
          ×
        </button>
      </div>

      {ticket.alertaRed && (
        <div className={`px-4 py-2 text-xs border-b ${ticket.alertaRed.fechaFin ? "bg-stone-50 dark:bg-gray-900/40 text-gray-500 border-stone-200 dark:border-gray-700" : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900"}`}>
          {ticket.alertaRed.fechaFin ? "El corte de red de su sector ya se resolvió. " : "Corte de red activo en su sector: "}
          {ticket.alertaRed.mensaje}
        </div>
      )}

      <div className="grid sm:grid-cols-4 gap-3 px-4 py-3 border-b border-stone-200 dark:border-gray-700">
        <label>
          <span className={CLASE_ETIQUETA}>Estado</span>
          <select
            value={ticket.estado}
            onChange={(e) => {
              if (e.target.value === "RESUELTO" && !ticket.solucion) {
                mostrarToast("Escribe la solución abajo y usa \"Resolver\"", "info");
                return;
              }
              actualizar.mutate({ estado: e.target.value });
            }}
            className={CLASE_CAMPO}
          >
            {(Object.keys(ETIQUETA_ESTADO) as EstadoTicket[]).map((e) => (
              <option key={e} value={e}>
                {ETIQUETA_ESTADO[e]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={CLASE_ETIQUETA}>Prioridad</span>
          <select value={ticket.prioridad} onChange={(e) => actualizar.mutate({ prioridad: e.target.value })} className={CLASE_CAMPO}>
            <option value="ALTA">Alta (4 h)</option>
            <option value="MEDIA">Media (24 h)</option>
            <option value="BAJA">Baja (72 h)</option>
          </select>
        </label>
        <label>
          <span className={CLASE_ETIQUETA}>Categoría</span>
          <select value={ticket.categoria} onChange={(e) => actualizar.mutate({ categoria: e.target.value })} className={CLASE_CAMPO}>
            {CATEGORIAS.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={CLASE_ETIQUETA}>Asignado a</span>
          <select value={ticket.asignadoEmpleadoId ?? ""} onChange={(e) => actualizar.mutate({ asignadoEmpleadoId: e.target.value || null })} className={CLASE_CAMPO}>
            <option value="">— Sin asignar —</option>
            {tecnicos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombres} {t.apellidos}
              </option>
            ))}
          </select>
        </label>
        {!ticket.cliente && (
          <div className="sm:col-span-4">
            <span className={CLASE_ETIQUETA}>Vincular a un cliente</span>
            <BuscadorCliente clienteId="" onSeleccionar={(clienteId) => clienteId && actualizar.mutate({ clienteId })} />
          </div>
        )}
        <div className="sm:col-span-4 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span>
            Tiempo: <TiempoSla ticket={ticket} />
            {ticket.fechaPrimeraAtencion && ` · primera atención ${fechaHora(ticket.fechaPrimeraAtencion)}`}
          </span>
          {ticket.visitaTecnica ? (
            <span>
              Visita #{ticket.visitaTecnica.id} el {new Date(ticket.visitaTecnica.rutaVisita.fecha).toLocaleDateString("es-EC")} ·{" "}
              {ticket.visitaTecnica.estado === "COMPLETADA" ? `técnico llegó ${fechaHora(ticket.visitaTecnica.fechaLlegadaReal)}` : ticket.visitaTecnica.estado.toLowerCase()}
            </span>
          ) : (
            !cerrado && (
              <button onClick={() => setAgendando(!agendando)} className={CLASE_ACCION}>
                {agendando ? "Cancelar visita" : "Agendar visita técnica"}
              </button>
            )
          )}
        </div>
        {agendando && (
          <div className="sm:col-span-4 flex flex-wrap items-end gap-2 bg-stone-50 dark:bg-gray-900/40 p-2 rounded-sm">
            <SugerenciaTecnicos ticketId={ticket.id} elegido={visita.empleadoId} onElegir={(empleadoId) => setVisita({ empleadoId: String(empleadoId), fecha: hoyInput() })} />
            <label className="flex-1 min-w-40">
              <span className={CLASE_ETIQUETA}>Técnico</span>
              <select value={visita.empleadoId} onChange={(e) => setVisita({ ...visita, empleadoId: e.target.value })} className={CLASE_CAMPO}>
                <option value="">— Elegir —</option>
                {tecnicos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombres} {t.apellidos}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className={CLASE_ETIQUETA}>Fecha</span>
              <input type="date" value={visita.fecha} onChange={(e) => setVisita({ ...visita, fecha: e.target.value })} className={CLASE_CAMPO} />
            </label>
            <button
              onClick={() => agendar.mutate()}
              disabled={!visita.empleadoId || !visita.fecha || agendar.isPending}
              className="bg-brand-700 hover:bg-brand-800 disabled:opacity-50 text-white text-sm font-semibold px-3 py-1.5 rounded-sm"
            >
              Agendar
            </button>
          </div>
        )}
      </div>

      <div className="px-4 py-3 space-y-2 max-h-96 overflow-y-auto">
        {ticket.mensajes.length === 0 && <p className="text-xs text-gray-400 text-center">Sin mensajes todavía.</p>}
        {ticket.mensajes.map((m) => (
          <div key={m.id} className={`flex ${m.autor === "USUARIO" ? "justify-end" : m.autor === "SISTEMA" ? "justify-center" : "justify-start"}`}>
            {m.autor === "SISTEMA" ? (
              <p className="text-[11px] text-gray-400 italic text-center">
                {m.texto} · {fechaHora(m.createdAt)}
              </p>
            ) : (
              <div className={`max-w-[85%] rounded-sm px-3 py-2 text-sm ${m.autor === "USUARIO" ? "bg-brand-50 dark:bg-brand-900/40 text-gray-800 dark:text-gray-100" : "bg-stone-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100"}`}>
                <p className="whitespace-pre-wrap break-words">{m.texto}</p>
                <p className="text-[10px] text-gray-400 mt-1">
                  {m.autor === "CLIENTE" ? "Cliente" : m.usuario?.nombre ?? "Usuario"} · {fechaHora(m.createdAt)}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {!cerrado && (
        <div className="px-4 py-3 border-t border-stone-200 dark:border-gray-700 space-y-2">
          <textarea
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            rows={2}
            placeholder={ticket.puedeResponderWhatsapp ? "Nota interna o respuesta al cliente por WhatsApp..." : "Nota interna (qué se hizo, qué se habló con el cliente)..."}
            className={CLASE_CAMPO}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <button
              onClick={() => enviarMensaje.mutate(false)}
              disabled={!mensaje.trim() || enviarMensaje.isPending}
              className="border border-stone-300 dark:border-gray-600 text-sm px-3 py-1 rounded-sm hover:bg-stone-50 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              Guardar nota
            </button>
            {ticket.puedeResponderWhatsapp && (
              <button
                onClick={() => enviarMensaje.mutate(true)}
                disabled={!mensaje.trim() || enviarMensaje.isPending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-3 py-1 rounded-sm disabled:opacity-50"
              >
                Responder por WhatsApp
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-dashed border-stone-200 dark:border-gray-700">
            <label className="flex-1 min-w-48">
              <span className={CLASE_ETIQUETA}>Solución</span>
              <input value={solucion} onChange={(e) => setSolucion(e.target.value)} placeholder="Ej. Se cambió el conector de la NAP" className={CLASE_CAMPO} />
            </label>
            <button
              onClick={() => actualizar.mutate({ estado: "RESUELTO", solucion })}
              disabled={!solucion.trim() || actualizar.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-3 py-1.5 rounded-sm disabled:opacity-50"
            >
              Resolver
            </button>
          </div>
        </div>
      )}
      {cerrado && ticket.solucion && (
        <div className="px-4 py-3 border-t border-stone-200 dark:border-gray-700 text-sm">
          <span className={CLASE_ETIQUETA}>Solución</span>
          <p className="text-gray-700 dark:text-gray-200">{ticket.solucion}</p>
          <p className="text-xs text-gray-400 mt-1">Cerrado {fechaHora(ticket.fechaResolucion)}</p>
        </div>
      )}
    </div>
  );
}
