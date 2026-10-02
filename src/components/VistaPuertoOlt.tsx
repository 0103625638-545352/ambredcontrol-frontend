import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type Olt, type ConsultaPuertoOlt, type OntPuertoConsulta } from "../api/client";
import { useToast } from "./ToastProvider";

const campoClase =
  "border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm";

// Umbrales SOLO para el color de la celda — la decisión real de qué cuenta
// como "alerta" (para el contador y para el filtro) ya la hizo el backend
// (ver UMBRAL_SENAL_DEBIL_DBM/UMBRAL_TEMPERATURA_ALTA_C en routes/olts.ts);
// acá solo se agrega un escalón extra "crítico" (rojo) para diferenciarlo
// visualmente de "débil" (ámbar), igual que en la herramienta que ya usa el
// técnico.
const RX_CRITICO_DBM = -28;
const RX_DEBIL_DBM = -25;
const TEMP_ALTA_C = 60;

function claseRx(rx: string | null): string {
  if (rx === null) return "text-gray-400 dark:text-gray-500";
  const n = Number(rx);
  if (n < RX_CRITICO_DBM) return "text-red-600 dark:text-red-400 font-semibold";
  if (n < RX_DEBIL_DBM) return "text-amber-600 dark:text-amber-400 font-semibold";
  return "text-emerald-600 dark:text-emerald-400";
}

function claseTemp(temp: string | null): string {
  if (temp === null) return "text-gray-400 dark:text-gray-500";
  return Number(temp) >= TEMP_ALTA_C ? "text-amber-600 dark:text-amber-400 font-semibold" : "text-emerald-600 dark:text-emerald-400";
}

function tituloFila(ont: OntPuertoConsulta): string {
  const lineas = [
    `ONT ${ont.onuIndex} — ${ont.cliente ? ont.cliente.razonSocial : "Sin cliente asignado"}`,
    `Serial: ${ont.serial}`,
    `Estado: ${ont.estado === "ONLINE" ? "En línea" : "Desconectada"}`,
    `RX OLT: ${ont.rxPowerDbm ?? "—"} dBm · TX ONT: ${ont.txPowerDbm ?? "—"} dBm`,
    `Temperatura: ${ont.temperaturaCelsius ?? "—"} °C`,
    `Distancia: ${ont.distanciaMetros ?? "—"} m`,
    `IP de gestión: ${ont.ipGestion ?? "—"}`,
  ];
  if (ont.alerta) lineas.push("⚠ Señal débil o temperatura alta");
  return lineas.join("\n");
}

function descargarCsv(consulta: ConsultaPuertoOlt) {
  const encabezado = ["Estado", "ONT", "Serial", "Cliente", "RX OLT (dBm)", "TX ONT (dBm)", "Temp (°C)", "Distancia (m)", "IP"];
  const filas = consulta.onts.map((o) => [
    o.estado === "ONLINE" ? "ONLINE" : "OFFLINE",
    String(o.onuIndex),
    o.serial,
    o.cliente?.razonSocial ?? "Sin asignar",
    o.rxPowerDbm ?? "",
    o.txPowerDbm ?? "",
    o.temperaturaCelsius ?? "",
    o.distanciaMetros !== null ? String(o.distanciaMetros) : "",
    o.ipGestion ?? "",
  ]);
  const csv = [encabezado, ...filas].map((fila) => fila.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `puerto-${consulta.frame}-${consulta.slot}-${consulta.puerto}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Vista de diagnóstico por puerto GPON: dado Frame/Slot/Puerto, trae por SSH
// (ver utils/oltHuaweiSsh.ts) TODAS las ONT conectadas ahí con su señal,
// temperatura y distancia — pensada para responder de un vistazo la pregunta
// del técnico en terreno: "¿se cayó el puerto entero o son clientes
// puntuales?". Vive como una pestaña más del Mapa de Red (ver
// MapaRedPage.tsx) porque comparte la misma audiencia (soporte técnico
// diagnosticando una caída), aunque la fuente de datos es distinta (SSH a
// demanda vs. el estado ya calculado de ping+SNMP+Mikrotik).
export function VistaPuertoOlt() {
  const { mostrarToast } = useToast();
  const [oltId, setOltId] = useState<number | "">("");
  const [frame, setFrame] = useState("0");
  const [slot, setSlot] = useState("");
  const [puerto, setPuerto] = useState("");
  const [consulta, setConsulta] = useState<ConsultaPuertoOlt | null>(null);
  const [consultando, setConsultando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"TODOS" | "ONLINE" | "OFFLINE" | "ALERTA">("TODOS");

  const { data: olts } = useQuery({
    queryKey: ["olts"],
    queryFn: async () => (await api.get<Olt[]>("/olts")).data,
  });

  const oltSeleccionada = olts?.find((o) => o.id === oltId);
  const oltSinSsh = !!oltSeleccionada && !oltSeleccionada.sshUsuario;

  async function consultarPuerto() {
    if (oltId === "" || !slot.trim() || !puerto.trim()) return;
    setConsultando(true);
    setError(null);
    setConsulta(null);
    try {
      const { data } = await api.post<ConsultaPuertoOlt>(`/olts/${oltId}/puertos/consultar`, {
        frame: Number(frame) || 0,
        slot: Number(slot),
        puerto: Number(puerto),
      });
      setConsulta(data);
      if (data.totales.total === 0) mostrarToast("No se detectó ninguna ONT en ese puerto");
    } catch (err: any) {
      const mensaje = err.response?.data?.error ?? "No se pudo consultar este puerto por SSH";
      setError(mensaje);
      mostrarToast(mensaje);
    } finally {
      setConsultando(false);
    }
  }

  const filas = (consulta?.onts ?? []).filter((o) => {
    if (filtro === "TODOS") return true;
    if (filtro === "ALERTA") return o.alerta;
    return o.estado === filtro;
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white dark:bg-gray-800 rounded-sm  border border-stone-300 dark:border-gray-700 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 dark:text-gray-400">OLT</label>
            <select value={oltId} onChange={(e) => setOltId(e.target.value ? Number(e.target.value) : "")} className={`${campoClase} min-w-[12rem]`}>
              <option value="">Seleccionar OLT...</option>
              {olts?.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nombre}
                  {!o.sshUsuario ? " (sin SSH configurado)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 dark:text-gray-400">Frame</label>
            <input value={frame} onChange={(e) => setFrame(e.target.value)} className={`${campoClase} w-20`} inputMode="numeric" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 dark:text-gray-400">Slot</label>
            <input value={slot} onChange={(e) => setSlot(e.target.value)} className={`${campoClase} w-20`} inputMode="numeric" placeholder="1" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 dark:text-gray-400">Puerto</label>
            <input value={puerto} onChange={(e) => setPuerto(e.target.value)} className={`${campoClase} w-20`} inputMode="numeric" placeholder="5" />
          </div>
          <button
            onClick={consultarPuerto}
            disabled={consultando || oltId === "" || !slot.trim() || !puerto.trim() || oltSinSsh}
            className="bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-md hover:bg-brand-800 disabled:opacity-50"
          >
            {consultando ? "Consultando..." : "Consultar puerto"}
          </button>
          {consulta && (
            <button
              onClick={() => descargarCsv(consulta)}
              className="border border-stone-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium px-4 py-2 rounded-md hover:bg-stone-50 dark:hover:bg-gray-700"
            >
              Descargar CSV
            </button>
          )}
        </div>
        {oltSinSsh && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
            Esta OLT no tiene credenciales SSH configuradas — agrégalas en la pantalla "OLT" (Editar) para poder usar esta vista.
          </p>
        )}
        {error && !oltSinSsh && <p className="text-xs text-red-500 mt-2">{error}</p>}
      </div>

      {consulta && (
        <>
          {consulta.todoElPuertoCaido && (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-sm p-3 text-sm text-red-700 dark:text-red-300">
              <strong>Todo el puerto está caído</strong> — ninguna de las {consulta.totales.total} ONT respondió. Es probable que sea un corte de
              fibra troncal, un problema en el splitter o una falla de la tarjeta PON, no de un cliente puntual.
            </div>
          )}
          {!consulta.todoElPuertoCaido && consulta.totales.desconectadas > 0 && (
            <div className="bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800 rounded-sm p-3 text-sm text-orange-700 dark:text-orange-300">
              <strong>
                {consulta.totales.desconectadas} de {consulta.totales.total} clientes
              </strong>{" "}
              sin conexión en este puerto — el resto sigue en línea, así que el problema es puntual (ONT/roseta/cable de bajada), no del troncal.
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <TarjetaEstadistica etiqueta="Total" valor={consulta.totales.total} color="border-stone-300 dark:border-gray-600" />
            <TarjetaEstadistica etiqueta="En línea" valor={consulta.totales.enLinea} color="border-emerald-500" />
            <TarjetaEstadistica etiqueta="Desconectadas" valor={consulta.totales.desconectadas} color="border-red-500" />
            <TarjetaEstadistica etiqueta="Con alertas" valor={consulta.totales.conAlertas} color="border-amber-500" />
          </div>

          <div className="flex gap-2">
            {(["TODOS", "ONLINE", "OFFLINE", "ALERTA"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-md ${
                  filtro === f ? "bg-brand-700 text-white" : "bg-stone-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-stone-200 dark:hover:bg-gray-600"
                }`}
              >
                {f === "TODOS" ? "Todos" : f === "ONLINE" ? "En línea" : f === "OFFLINE" ? "Desconectadas" : "Con alertas"}
              </button>
            ))}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-sm  border border-stone-300 dark:border-gray-700 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-stone-300 dark:border-gray-700">
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Cliente / ONT</th>
                  <th className="px-3 py-2">RX OLT</th>
                  <th className="px-3 py-2">TX ONT</th>
                  <th className="px-3 py-2">Temp.</th>
                  <th className="px-3 py-2">Distancia</th>
                  <th className="px-3 py-2">IP</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((ont) => (
                  <tr
                    key={ont.id}
                    title={tituloFila(ont)}
                    className={`border-b border-stone-100 dark:border-gray-700 cursor-help ${ont.alerta ? "bg-amber-50 dark:bg-amber-900/10" : ""}`}
                  >
                    <td className="px-3 py-2">
                      {ont.estado === "ONLINE" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Online
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-500 dark:text-red-400">
                          <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Offline
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <p className="text-gray-800 dark:text-gray-100">{ont.cliente ? ont.cliente.razonSocial : "Sin asignar"}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 font-mono">
                        ONT-ID {ont.onuIndex} · {ont.serial}
                      </p>
                    </td>
                    <td className={`px-3 py-2 ${claseRx(ont.rxPowerDbm)}`}>{ont.rxPowerDbm ?? "—"} dBm</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{ont.txPowerDbm ?? "—"} dBm</td>
                    <td className={`px-3 py-2 ${claseTemp(ont.temperaturaCelsius)}`}>{ont.temperaturaCelsius ?? "—"} °C</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{ont.distanciaMetros !== null ? `${ont.distanciaMetros} m` : "—"}</td>
                    <td className="px-3 py-2 text-gray-500 dark:text-gray-400 font-mono text-xs">{ont.ipGestion ?? "—"}</td>
                  </tr>
                ))}
                {filas.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500">
                      Ninguna ONT coincide con este filtro
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function TarjetaEstadistica({ etiqueta, valor, color }: { etiqueta: string; valor: number; color: string }) {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-sm  border-l-4 ${color} border-t border-r border-b border-stone-300 dark:border-gray-700 p-3`}>
      <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{etiqueta}</p>
      <p className="text-2xl font-semibold text-gray-800 dark:text-gray-100">{valor}</p>
    </div>
  );
}
