import { Fragment, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type SwitchCliente,
  type SwitchEvento,
  type ResultadoSincronizacionSwitch,
  type ResultadoExplorarOid,
} from "../api/client";
import { useConfirm } from "../components/ConfirmProvider";
import { useToast } from "../components/ToastProvider";
import { BuscadorCliente } from "../components/BuscadorCliente";

// snmpComunidad/snmpAuthPassword/snmpPrivPassword nunca vuelven del backend
// (ver SwitchCliente en api/client.ts) — al editar, dejarlos vacíos
// significa "no cambiarlos", mismo criterio que OltsPage.tsx.
const FORM_VACIO = {
  clienteId: "" as number | "",
  direccionIp: "",
  modelo: "",
  cantidadPuertos: "8",
  snmpPuerto: "161",
  snmpVersion: "2c",
  snmpComunidad: "public",
  snmpUsuario: "",
  snmpAuthProtocolo: "SHA",
  snmpAuthPassword: "",
  snmpPrivProtocolo: "AES",
  snmpPrivPassword: "",
};

const campoClase =
  "border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm";

// Bits/seg -> texto legible (Kbps/Mbps) — igual criterio que
// formatearVelocidadMikrotik en MikrotikPage.tsx, no se comparte porque esa
// espera bits/seg ya en notación de router, no un número crudo calculado acá.
function formatearBps(bps?: number | null): string {
  if (bps === null || bps === undefined) return "—";
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(1)} Kbps`;
  return `${bps} bps`;
}

function BadgeEstadoPuerto({ estado }: { estado?: string | null }) {
  if (estado === "UP") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Up
      </span>
    );
  }
  if (estado === "DOWN") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-500 dark:text-red-400">
        <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Down
      </span>
    );
  }
  return <span className="text-xs text-gray-400 dark:text-gray-500">Sin sincronizar</span>;
}

const ETIQUETA_POE: Record<string, string> = {
  DELIVERING_POWER: "Entregando PoE",
  SEARCHING: "PoE en espera",
  FAULT: "Falla PoE",
  DISABLED: "PoE deshabilitado",
};

function BadgePoe({ estado }: { estado?: string | null }) {
  if (!estado) return <span className="text-xs text-gray-400 dark:text-gray-500">—</span>;
  const clase =
    estado === "DELIVERING_POWER"
      ? "text-emerald-600 dark:text-emerald-400"
      : estado === "FAULT"
        ? "text-red-500 dark:text-red-400"
        : "text-gray-500 dark:text-gray-400";
  return <span className={`text-xs font-medium ${clase}`}>{ETIQUETA_POE[estado] ?? estado}</span>;
}

// Definido a nivel de módulo (no dentro de SwitchesPage) para no perder el
// foco de los inputs en cada tecla — ver el bug que esto mismo causó en
// PromocionesPage.tsx/OltsPage.tsx cuando el componente vivía adentro.
function CamposSnmpSwitch({ form, set }: { form: typeof FORM_VACIO; set: (f: typeof FORM_VACIO) => void }) {
  return (
    <>
      <select value={form.snmpVersion} onChange={(e) => set({ ...form, snmpVersion: e.target.value })} className={campoClase}>
        <option value="2c">SNMP v2c</option>
        <option value="1">SNMP v1</option>
        <option value="3">SNMP v3</option>
      </select>
      <input placeholder="Puerto SNMP" value={form.snmpPuerto} onChange={(e) => set({ ...form, snmpPuerto: e.target.value })} className={campoClase} />
      {form.snmpVersion !== "3" ? (
        <input
          placeholder="Comunidad (ej. public)"
          value={form.snmpComunidad}
          onChange={(e) => set({ ...form, snmpComunidad: e.target.value })}
          className={`${campoClase} col-span-2`}
        />
      ) : (
        <>
          <input placeholder="Usuario SNMPv3" value={form.snmpUsuario} onChange={(e) => set({ ...form, snmpUsuario: e.target.value })} className={campoClase} />
          <select value={form.snmpAuthProtocolo} onChange={(e) => set({ ...form, snmpAuthProtocolo: e.target.value })} className={campoClase}>
            <option value="SHA">Auth: SHA</option>
            <option value="MD5">Auth: MD5</option>
          </select>
          <input
            type="password"
            placeholder="Auth password"
            value={form.snmpAuthPassword}
            onChange={(e) => set({ ...form, snmpAuthPassword: e.target.value })}
            className={campoClase}
          />
          <select value={form.snmpPrivProtocolo} onChange={(e) => set({ ...form, snmpPrivProtocolo: e.target.value })} className={campoClase}>
            <option value="AES">Priv: AES</option>
            <option value="DES">Priv: DES</option>
          </select>
          <input
            type="password"
            placeholder="Priv password"
            value={form.snmpPrivPassword}
            onChange={(e) => set({ ...form, snmpPrivPassword: e.target.value })}
            className={`${campoClase} col-span-2`}
          />
        </>
      )}
    </>
  );
}

// Panel expandido de un switch: tabla de puertos (estado/velocidad/tráfico/
// PoE), historial de eventos, y la herramienta de calibración "Explorar
// OID" — mismo patrón que DetalleOlt en OltsPage.tsx. También a nivel de
// módulo por el mismo motivo de arriba.
function DetalleSwitch({ switchId }: { switchId: number }) {
  const [pestana, setPestana] = useState<"puertos" | "eventos" | "avanzado">("puertos");
  const [oidBase, setOidBase] = useState("1.3.6.1.2.1.2.2.1");
  const [explorando, setExplorando] = useState(false);
  const [resultadoExploracion, setResultadoExploracion] = useState<ResultadoExplorarOid | null>(null);
  const { mostrarToast } = useToast();

  const { data: switches } = useQuery({
    queryKey: ["switches"],
    queryFn: async () => (await api.get<SwitchCliente[]>("/switches")).data,
  });
  const sw = switches?.find((s) => s.id === switchId);

  const { data: eventos, isLoading: cargandoEventos } = useQuery({
    queryKey: ["switch-eventos", switchId],
    queryFn: async () => (await api.get<SwitchEvento[]>(`/switches/${switchId}/eventos`)).data,
    enabled: pestana === "eventos",
  });

  async function explorar() {
    if (!oidBase.trim()) return;
    setExplorando(true);
    setResultadoExploracion(null);
    try {
      const { data } = await api.post<ResultadoExplorarOid>(`/switches/${switchId}/explorar-oid`, { oidBase: oidBase.trim() });
      setResultadoExploracion(data);
    } catch (error: any) {
      mostrarToast(error.response?.data?.error ?? "No se pudo explorar ese OID en el switch");
    } finally {
      setExplorando(false);
    }
  }

  const tabClase = (activa: boolean) =>
    `text-xs font-semibold px-3 py-1.5 rounded-md ${activa ? "bg-brand-700 text-white" : "text-gray-600 dark:text-gray-300 hover:bg-stone-100 dark:hover:bg-gray-700"}`;

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <button className={tabClase(pestana === "puertos")} onClick={() => setPestana("puertos")}>
          Puertos ({sw?.puertos?.length ?? 0})
        </button>
        <button className={tabClase(pestana === "eventos")} onClick={() => setPestana("eventos")}>
          Eventos
        </button>
        <button className={tabClase(pestana === "avanzado")} onClick={() => setPestana("avanzado")}>
          Avanzado: Explorar OID
        </button>
      </div>

      {pestana === "puertos" && (
        <div className="overflow-x-auto">
          {!sw?.puertos || sw.puertos.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">Sin puertos detectados todavía — probá "Sincronizar ahora" en la fila del switch.</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-stone-300 dark:border-gray-700">
                  <th className="px-3 py-1.5">Puerto</th>
                  <th className="px-3 py-1.5">Estado</th>
                  <th className="px-3 py-1.5">Velocidad</th>
                  <th className="px-3 py-1.5">Entrada</th>
                  <th className="px-3 py-1.5">Salida</th>
                  <th className="px-3 py-1.5">PoE</th>
                </tr>
              </thead>
              <tbody>
                {sw.puertos.map((p) => (
                  <tr key={p.id} className="border-b border-stone-100 dark:border-gray-700">
                    <td className="px-3 py-1.5 text-gray-600 dark:text-gray-300">{p.numeroPuerto}</td>
                    <td className="px-3 py-1.5">
                      <BadgeEstadoPuerto estado={p.estado} />
                    </td>
                    <td className="px-3 py-1.5 text-gray-600 dark:text-gray-300 text-xs">{p.velocidadMbps ? `${p.velocidadMbps} Mbps` : "—"}</td>
                    <td className="px-3 py-1.5 text-gray-600 dark:text-gray-300 text-xs">{formatearBps(p.trafficEntradaBps)}</td>
                    <td className="px-3 py-1.5 text-gray-600 dark:text-gray-300 text-xs">{formatearBps(p.trafficSalidaBps)}</td>
                    <td className="px-3 py-1.5">
                      <BadgePoe estado={p.poeEstado} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {pestana === "eventos" && (
        <div className="max-h-72 overflow-y-auto">
          {cargandoEventos && <p className="text-sm text-gray-500 dark:text-gray-400">Cargando...</p>}
          {!cargandoEventos && eventos?.length === 0 && <p className="text-sm text-gray-400 dark:text-gray-500">Sin eventos registrados</p>}
          <ul className="space-y-1.5">
            {eventos?.map((ev) => (
              <li key={ev.id} className="text-xs text-gray-600 dark:text-gray-300 border-b border-stone-100 dark:border-gray-700 pb-1.5">
                <span className="font-medium">{ev.tipo}</span> — {ev.mensaje}
                <span className="text-gray-400 dark:text-gray-500"> · {new Date(ev.fecha).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {pestana === "avanzado" && (
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 max-w-2xl">
            Recorre en crudo lo que el switch responde bajo un OID — para calibrar contra el equipo real (ver la advertencia sobre PoE en
            backend/src/utils/switchTpLink.ts). No interpreta nada, solo muestra el dato tal cual llega.
          </p>
          <div className="flex gap-2 mb-3 max-w-2xl">
            <input value={oidBase} onChange={(e) => setOidBase(e.target.value)} className={`${campoClase} flex-1 font-mono text-xs`} />
            <button
              onClick={explorar}
              disabled={explorando}
              className="border border-stone-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium px-4 py-2 rounded-md hover:bg-stone-50 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              {explorando ? "Consultando..." : "Explorar"}
            </button>
          </div>
          {resultadoExploracion && (
            <div className="max-h-72 overflow-y-auto border border-stone-300 dark:border-gray-700 rounded-md">
              <table className="min-w-full text-xs font-mono">
                <tbody>
                  {resultadoExploracion.filas.map((f, i) => (
                    <tr key={i} className="border-b border-stone-100 dark:border-gray-700">
                      <td className="px-2 py-1 text-gray-500 dark:text-gray-400">{f.oid}</td>
                      <td className="px-2 py-1 text-gray-800 dark:text-gray-100">{f.valor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {resultadoExploracion.truncado && (
                <p className="text-xs text-amber-600 dark:text-amber-400 px-2 py-1">Se muestran las primeras 500 de {resultadoExploracion.total} filas.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Switches TP-Link instalados en el domicilio de cada cliente — a
// diferencia de la OLT (un equipo central con muchas ONUs), acá cada switch
// es independiente, uno por cliente. Solo lectura por SNMP (estado de
// puerto, tráfico, PoE), nunca se configura el equipo desde acá.
export function SwitchesPage() {
  const queryClient = useQueryClient();
  const confirmar = useConfirm();
  const { mostrarToast } = useToast();

  const [formNuevo, setFormNuevo] = useState(FORM_VACIO);
  const [switchEditandoId, setSwitchEditandoId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState(FORM_VACIO);
  const [probando, setProbando] = useState<"nuevo" | number | null>(null);
  const [switchDetalleId, setSwitchDetalleId] = useState<number | null>(null);

  const { data: switches, isLoading } = useQuery({
    queryKey: ["switches"],
    queryFn: async () => (await api.get<SwitchCliente[]>("/switches")).data,
  });

  const crear = useMutation({
    mutationFn: async () => api.post("/switches", { ...formNuevo, cantidadPuertos: Number(formNuevo.cantidadPuertos), snmpPuerto: Number(formNuevo.snmpPuerto) }),
    onSuccess: (respuesta) => {
      queryClient.invalidateQueries({ queryKey: ["switches"] });
      setFormNuevo(FORM_VACIO);
      const advertenciaSnmp: string | undefined = respuesta.data?.advertenciaSnmp;
      if (advertenciaSnmp) mostrarToast(advertenciaSnmp);
      else mostrarToast("Switch creado y sincronizado por SNMP", "success");
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al crear el switch"),
  });

  const editar = useMutation({
    mutationFn: async (id: number) => api.put(`/switches/${id}`, { ...editForm, cantidadPuertos: Number(editForm.cantidadPuertos), snmpPuerto: Number(editForm.snmpPuerto) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["switches"] });
      setSwitchEditandoId(null);
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al editar el switch"),
  });

  const desactivar = useMutation({
    mutationFn: async (id: number) => api.delete(`/switches/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["switches"] }),
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al desactivar el switch"),
  });

  const sincronizar = useMutation({
    mutationFn: async (id: number) => (await api.post<ResultadoSincronizacionSwitch>(`/switches/${id}/sincronizar`)).data,
    onSuccess: (resultado) => {
      queryClient.invalidateQueries({ queryKey: ["switches"] });
      mostrarToast(`${resultado.puertosUp}/${resultado.totalPuertos} puerto(s) UP — ${resultado.transiciones} transición(es)`, "success");
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "No se pudo sincronizar el switch por SNMP"),
  });

  function abrirEdicion(s: SwitchCliente) {
    setEditForm({
      clienteId: s.clienteId,
      direccionIp: s.direccionIp,
      modelo: s.modelo ?? "",
      cantidadPuertos: String(s.cantidadPuertos),
      snmpPuerto: String(s.snmpPuerto),
      snmpVersion: s.snmpVersion,
      snmpComunidad: "",
      snmpUsuario: s.snmpUsuario ?? "",
      snmpAuthProtocolo: s.snmpAuthProtocolo ?? "SHA",
      snmpAuthPassword: "",
      snmpPrivProtocolo: s.snmpPrivProtocolo ?? "AES",
      snmpPrivPassword: "",
    });
    setSwitchEditandoId(switchEditandoId === s.id ? null : s.id);
  }

  async function confirmarDesactivar(s: SwitchCliente) {
    const ok = await confirmar(`¿Desactivar el switch de "${s.cliente?.razonSocial}"? El historial ya guardado se conserva.`);
    if (ok) desactivar.mutate(s.id);
  }

  async function probar(form: typeof FORM_VACIO, marcador: "nuevo" | number) {
    setProbando(marcador);
    try {
      const { data } = await api.post("/switches/probar", { ...form, snmpPuerto: Number(form.snmpPuerto) });
      mostrarToast(`Conectado: ${data.sysName || data.sysDescr || "OK"}`, "success");
    } catch (error: any) {
      mostrarToast(error.response?.data?.error ?? "No se pudo conectar por SNMP con esas credenciales");
    } finally {
      setProbando(null);
    }
  }

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 dark:text-gray-50 mb-1">Switches TP-Link (clientes)</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 max-w-3xl">
        Switch instalado en el domicilio de cada cliente (el que reparte Wi-Fi/Ethernet en la vivienda) — uno por cliente, con su propia IP. El
        sistema solo LEE por SNMP el estado de sus puertos (up/down, velocidad, tráfico, PoE), nunca configura nada del equipo.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (formNuevo.clienteId && formNuevo.direccionIp.trim()) crear.mutate();
        }}
        className="bg-white dark:bg-gray-800 p-4 rounded-sm border border-stone-300 dark:border-gray-700 mb-4 grid grid-cols-2 gap-3 max-w-3xl"
      >
        <div className="col-span-2">
          <BuscadorCliente clienteId={formNuevo.clienteId} onSeleccionar={(id) => setFormNuevo({ ...formNuevo, clienteId: id })} />
        </div>
        <input
          placeholder="IP del switch (ej. 192.168.1.50)"
          required
          value={formNuevo.direccionIp}
          onChange={(e) => setFormNuevo({ ...formNuevo, direccionIp: e.target.value })}
          className={campoClase}
        />
        <input
          placeholder="Modelo (ej. TL-SG105PE)"
          value={formNuevo.modelo}
          onChange={(e) => setFormNuevo({ ...formNuevo, modelo: e.target.value })}
          className={campoClase}
        />
        <input
          type="number"
          min="1"
          placeholder="Cantidad de puertos"
          value={formNuevo.cantidadPuertos}
          onChange={(e) => setFormNuevo({ ...formNuevo, cantidadPuertos: e.target.value })}
          className={campoClase}
        />
        <CamposSnmpSwitch form={formNuevo} set={setFormNuevo} />
        <div className="col-span-2 flex gap-2">
          <button
            type="button"
            onClick={() => probar(formNuevo, "nuevo")}
            disabled={probando === "nuevo" || !formNuevo.direccionIp.trim()}
            className="border border-stone-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium px-4 py-2 rounded-md hover:bg-stone-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            {probando === "nuevo" ? "Probando..." : "Probar conexión SNMP"}
          </button>
          <button type="submit" disabled={crear.isPending} className="bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-md hover:bg-brand-800 disabled:opacity-50">
            {crear.isPending ? "Creando..." : "Agregar switch"}
          </button>
        </div>
      </form>

      {isLoading && <p className="text-sm text-gray-500 dark:text-gray-400">Cargando...</p>}

      <div className="bg-white dark:bg-gray-800 rounded-sm border border-stone-300 dark:border-gray-700 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-stone-300 dark:border-gray-700">
              <th className="px-4 py-2">Cliente</th>
              <th className="px-4 py-2">IP</th>
              <th className="px-4 py-2">Modelo</th>
              <th className="px-4 py-2">Puertos UP</th>
              <th className="px-4 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {switches?.map((s) => {
              const puertosUp = s.puertos?.filter((p) => p.estado === "UP").length ?? 0;
              return (
                <Fragment key={s.id}>
                  <tr className="border-b border-stone-100 dark:border-gray-700">
                    <td className="px-4 py-2 text-gray-800 dark:text-gray-100">{s.cliente?.razonSocial}</td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{s.direccionIp}</td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{s.modelo ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-300">
                      {puertosUp}/{s.cantidadPuertos}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => sincronizar.mutate(s.id)}
                          disabled={sincronizar.isPending}
                          className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline disabled:opacity-50"
                        >
                          Sincronizar ahora
                        </button>
                        <button
                          onClick={() => setSwitchDetalleId(switchDetalleId === s.id ? null : s.id)}
                          className="text-xs font-medium text-gray-600 dark:text-gray-300 hover:underline"
                        >
                          {switchDetalleId === s.id ? "Ocultar puertos" : "Ver puertos"}
                        </button>
                        <button onClick={() => abrirEdicion(s)} className="text-xs font-medium text-gray-600 dark:text-gray-300 hover:underline">
                          Editar
                        </button>
                        <button onClick={() => confirmarDesactivar(s)} className="text-xs font-medium text-red-500 hover:underline">
                          Desactivar
                        </button>
                      </div>
                    </td>
                  </tr>
                  {switchEditandoId === s.id && (
                    <tr className="border-b border-stone-100 dark:border-gray-700 bg-stone-50 dark:bg-gray-900/40">
                      <td colSpan={5} className="px-4 py-3">
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            editar.mutate(s.id);
                          }}
                          className="grid grid-cols-2 gap-3 max-w-3xl"
                        >
                          <input
                            placeholder="IP del switch"
                            required
                            value={editForm.direccionIp}
                            onChange={(e) => setEditForm({ ...editForm, direccionIp: e.target.value })}
                            className={campoClase}
                          />
                          <input
                            placeholder="Modelo"
                            value={editForm.modelo}
                            onChange={(e) => setEditForm({ ...editForm, modelo: e.target.value })}
                            className={campoClase}
                          />
                          <input
                            type="number"
                            min="1"
                            placeholder="Cantidad de puertos"
                            value={editForm.cantidadPuertos}
                            onChange={(e) => setEditForm({ ...editForm, cantidadPuertos: e.target.value })}
                            className={campoClase}
                          />
                          <CamposSnmpSwitch form={editForm} set={setEditForm} />
                          <div className="col-span-2 flex gap-2">
                            <button
                              type="button"
                              onClick={() => probar(editForm, s.id)}
                              disabled={probando === s.id}
                              className="border border-stone-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium px-4 py-2 rounded-md hover:bg-stone-50 dark:hover:bg-gray-700 disabled:opacity-50"
                            >
                              {probando === s.id ? "Probando..." : "Probar conexión SNMP"}
                            </button>
                            <button type="submit" className="bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-md hover:bg-brand-800">
                              Guardar
                            </button>
                            <button type="button" onClick={() => setSwitchEditandoId(null)} className="text-sm text-gray-500 dark:text-gray-400 px-2">
                              Cancelar
                            </button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  )}
                  {switchDetalleId === s.id && (
                    <tr className="border-b border-stone-100 dark:border-gray-700 bg-stone-50 dark:bg-gray-900/40">
                      <td colSpan={5} className="px-4 py-3">
                        <DetalleSwitch switchId={s.id} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {switches?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500">
                  Todavía no hay ningún switch registrado
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
