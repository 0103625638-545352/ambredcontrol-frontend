import { useState, Fragment } from "react";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type NodoRed,
  type EstadoMikrotik,
  type EstadoReglasSuspension,
  type ResumenRespaldoMikrotik,
  type RespaldoMikrotikCompleto,
  type ResultadoRestauracionMikrotik,
  type VlanNodo,
  type VlanDetectada,
} from "../api/client";
import { useConfirm } from "../components/ConfirmProvider";
import { useToast } from "../components/ToastProvider";
import { useFiltrosListado, BarraBuscadorDocumentos, filtrarLocal, sinPaginacion } from "../components/BuscadorDocumentos";
import { Resaltar } from "../components/FormatoDocumento";

// Cada cuántos segundos se revisa solo el pulso de vida de cada nodo — así
// con muchos nodos el usuario no depende de entrar a "Probar conexión" uno
// por uno, ve el estado de todos de un vistazo y se actualiza solo.
const INTERVALO_PULSO_MS = 20_000;

// Catálogo de nodos de red: cada uno es un punto de conexión físico (ej. un
// armario de un sector) con su propio Mikrotik a cargo de los clientes de
// esa zona — ver Cliente.nodoId. mikrotikPassword nunca vuelve del backend;
// al editar, dejarlo vacío significa "no cambiarla".
const FORM_VACIO = {
  nombre: "",
  descripcion: "",
  mikrotikHost: "",
  mascaraRed: "",
  mikrotikPuerto: "8728",
  mikrotikUsuario: "admin",
  mikrotikPassword: "",
  rangoIpInicio: "",
  rangoIpFin: "",
};

// Máscaras más comunes en una red de este tamaño — /24 (254 direcciones
// útiles) para un nodo chico, /22 (1022) para uno con muchos clientes; el
// resto queda por si algún sector cae justo entre esos dos.
const MASCARAS_COMUNES = [21, 22, 23, 24, 25, 26, 27, 28];

function ipAEntero(ip: string): number | null {
  const partes = ip.trim().split(".").map(Number);
  if (partes.length !== 4 || partes.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return null;
  return partes.reduce((acumulado, octeto) => (acumulado << 8) + octeto, 0) >>> 0;
}
function enteroAIp(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

// A partir de la IP del Mikrotik y una máscara CIDR, calcula el primer y
// último host útil de esa red — para sugerir rangoIpInicio/Fin sin tener que
// calcularlo a mano (un /22 tiene 1022 direcciones útiles, no es obvio de
// memoria). El resultado sigue siendo editable: esto solo rellena un punto
// de partida razonable, rangoIpInicio/Fin son los que de verdad se guardan.
function calcularRangoDesdeMascara(host: string, prefijo: number): { inicio: string; fin: string } | null {
  const ipInt = ipAEntero(host);
  if (ipInt === null || prefijo < 0 || prefijo > 30) return null;
  const mascara = prefijo === 0 ? 0 : (0xffffffff << (32 - prefijo)) >>> 0;
  const red = (ipInt & mascara) >>> 0;
  const broadcast = (red | (~mascara >>> 0)) >>> 0;
  return { inicio: enteroAIp(red + 1), fin: enteroAIp(broadcast - 1) };
}

export function NodosPage() {
  const [mostrarFormularioNodo, setMostrarFormularioNodo] = useState(false);
  const queryClient = useQueryClient();
  const confirmar = useConfirm();
  const { mostrarToast } = useToast();
  const [formNuevo, setFormNuevo] = useState(FORM_VACIO);
  const [nodoEditandoId, setNodoEditandoId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState(FORM_VACIO);
  const [probando, setProbando] = useState<"nuevo" | number | null>(null);
  const [nodoRespaldosId, setNodoRespaldosId] = useState<number | null>(null);
  const [nodoVlansId, setNodoVlansId] = useState<number | null>(null);

  // También se refresca sola cada INTERVALO_PULSO_MS — así "sin conexión
  // desde hace X" se pone al día solo, no solo el puntito de color.
  const { data: nodos, isLoading } = useQuery({
    queryKey: ["nodos-red"],
    queryFn: async () => (await api.get<NodoRed[]>("/nodos-red")).data,
    refetchInterval: INTERVALO_PULSO_MS,
  });

  // Pulso de vida: una consulta liviana por nodo (identidad + versión),
  // repetida sola cada INTERVALO_PULSO_MS — nunca bloquea la pantalla ni
  // reintenta agresivo (retry:false) para que un nodo caído no demore a los
  // demás ni sature de reintentos un router que ya sabemos que no responde.
  const pulsos = useQueries({
    queries: (nodos ?? []).map((n) => ({
      queryKey: ["mikrotik-estado", n.id],
      queryFn: async () => (await api.get<EstadoMikrotik>(`/mikrotik/${n.id}/estado`)).data,
      retry: false,
      refetchInterval: INTERVALO_PULSO_MS,
    })),
  });
  const pulsoPorNodo = new Map<number, (typeof pulsos)[number]>();
  (nodos ?? []).forEach((n, i) => pulsoPorNodo.set(n.id, pulsos[i]));

  // Estado EN VIVO de las reglas de suspensión (no se guarda en la base —
  // mismo criterio que el pulso de arriba: si alguien las borró a mano en
  // el router, "Reglas configuradas" no debe seguir mostrando eso como si
  // nada). MISMO refetchInterval que el pulso — a propósito: sin esto, si
  // la primera consulta fallaba por cualquier motivo pasajero (ej. justo
  // después de reiniciar el backend, con la conexión al router todavía sin
  // establecer), se quedaba mostrando "Configurar reglas" para siempre, sin
  // ninguna forma de corregirse sola (retry:false no reintenta, y sin
  // refetchInterval tampoco se volvía a pedir) — había que forzarlo a mano
  // con un clic. Repetirlo solo cada INTERVALO_PULSO_MS hace que se
  // autocorrija apenas el router vuelve a responder, igual que el pulso.
  const estadosReglas = useQueries({
    queries: (nodos ?? []).map((n) => ({
      queryKey: ["mikrotik-reglas-suspension", n.id],
      queryFn: async () => (await api.get<EstadoReglasSuspension>(`/nodos-red/${n.id}/estado-suspension`)).data,
      retry: false,
      refetchInterval: INTERVALO_PULSO_MS,
    })),
  });
  const reglasPorNodo = new Map<number, (typeof estadosReglas)[number]>();
  (nodos ?? []).forEach((n, i) => reglasPorNodo.set(n.id, estadosReglas[i]));

  const crear = useMutation({
    mutationFn: async () => api.post("/nodos-red", formNuevo),
    onSuccess: (respuesta) => {
      queryClient.invalidateQueries({ queryKey: ["nodos-red"] });
      queryClient.invalidateQueries({ queryKey: ["mikrotik-reglas-suspension"] });
      setFormNuevo(FORM_VACIO);
      setMostrarFormularioNodo(false);
      // Al crear el nodo, el backend ya intentó configurar solo las reglas
      // de Filter Rules que hacen que "Suspendido" corte de verdad el
      // tráfico (ver utils/mikrotik.ts) — si el router no respondió en ese
      // momento, avisa acá para que se reintente con "Configurar reglas".
      const advertenciaMikrotik: string | undefined = respuesta.data?.advertenciaMikrotik;
      if (advertenciaMikrotik) {
        mostrarToast(advertenciaMikrotik);
      } else {
        mostrarToast("Nodo creado y reglas de suspensión configuradas en el Mikrotik", "success");
      }
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al crear el nodo de red"),
  });

  const configurarSuspension = useMutation({
    mutationFn: async (id: number) => (await api.post(`/nodos-red/${id}/configurar-suspension`)).data,
    onSuccess: (resultado: { creadas: string[]; yaExistian: string[] }, id) => {
      queryClient.invalidateQueries({ queryKey: ["mikrotik-reglas-suspension", id] });
      const partes: string[] = [];
      if (resultado.creadas.length > 0) partes.push(`creadas: ${resultado.creadas.join(", ")}`);
      if (resultado.yaExistian.length > 0) partes.push(`ya existían: ${resultado.yaExistian.join(", ")}`);
      mostrarToast(`Reglas de suspensión al día (${partes.join(" · ")})`, "success");
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "No se pudieron configurar las reglas en el Mikrotik"),
  });

  const editar = useMutation({
    mutationFn: async (id: number) => api.put(`/nodos-red/${id}`, editForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nodos-red"] });
      queryClient.invalidateQueries({ queryKey: ["clientes"] }); // el nombre del nodo puede aparecer en la tabla de clientes
      setNodoEditandoId(null);
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al editar el nodo de red"),
  });

  const desactivar = useMutation({
    mutationFn: async (id: number) => api.delete(`/nodos-red/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["nodos-red"] }),
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al desactivar el nodo de red"),
  });

  function abrirEdicion(n: NodoRed) {
    setEditForm({
      nombre: n.nombre,
      descripcion: n.descripcion ?? "",
      mikrotikHost: n.mikrotikHost,
      mascaraRed: n.mascaraRed ? String(n.mascaraRed) : "",
      mikrotikPuerto: String(n.mikrotikPuerto),
      mikrotikUsuario: n.mikrotikUsuario,
      mikrotikPassword: "",
      rangoIpInicio: n.rangoIpInicio ?? "",
      rangoIpFin: n.rangoIpFin ?? "",
    });
    setNodoEditandoId(nodoEditandoId === n.id ? null : n.id);
  }

  async function confirmarDesactivar(n: NodoRed) {
    const ok = await confirmar(`¿Desactivar el nodo "${n.nombre}"? Los clientes que ya pertenecen a él lo conservan.`);
    if (ok) desactivar.mutate(n.id);
  }

  async function probarNuevo() {
    setProbando("nuevo");
    try {
      const { data } = await api.post("/nodos-red/probar", formNuevo);
      mostrarToast(`Conectado: ${data.identidad} (RouterOS ${data.version})`);
    } catch (error: any) {
      mostrarToast(error.response?.data?.error ?? "No se pudo conectar con esas credenciales");
    } finally {
      setProbando(null);
    }
  }

  async function probarEdicion(id: number) {
    setProbando(id);
    try {
      // Si dejó la contraseña vacía (no la está cambiando), no se puede
      // probar con una contraseña "en blanco" — se prueba contra el nodo ya
      // guardado en el backend en su lugar.
      if (!editForm.mikrotikPassword) {
        const { data } = await api.get(`/mikrotik/${id}/estado`);
        mostrarToast(`Conectado: ${data.identidad} (RouterOS ${data.version})`);
      } else {
        const { data } = await api.post("/nodos-red/probar", editForm);
        mostrarToast(`Conectado: ${data.identidad} (RouterOS ${data.version})`);
      }
    } catch (error: any) {
      mostrarToast(error.response?.data?.error ?? "No se pudo conectar con esas credenciales");
    } finally {
      setProbando(null);
    }
  }

  // Buscador del listado (en el navegador: la lista ya viene completa).
  const filtros = useFiltrosListado(sinPaginacion);
  const nodosFiltrados = filtrarLocal(nodos, filtros, {
    textos: (n) => [n.nombre, n.descripcion, n.mikrotikHost, n.rangoIpInicio, n.rangoIpFin],
  });

  const formularioAbierto = mostrarFormularioNodo || nodos?.length === 0;

  return (
    <div className="bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-stone-300 dark:border-gray-700">
        <h2 className="text-base font-bold text-gray-900 dark:text-gray-50">Nodos de red</h2>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] text-gray-400 dark:text-gray-500">
            {nodos ? `${nodos.length} nodo${nodos.length === 1 ? "" : "s"}` : ""}
          </span>
          {(nodos?.length ?? 0) > 0 && (
            <button
              onClick={() => setMostrarFormularioNodo((v) => !v)}
              className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 px-3 py-1.5 rounded-sm text-sm font-semibold hover:bg-stone-50 dark:hover:bg-gray-700"
            >
              {mostrarFormularioNodo ? "Cancelar" : "+ Nuevo nodo"}
            </button>
          )}
        </div>
      </div>
      <p className="px-4 py-2 bg-stone-50 dark:bg-gray-900/40 border-b border-stone-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
        Cada nodo es un punto de conexión físico (ej. un armario de un sector) con su propio Mikrotik a cargo de los clientes de esa zona. Al crear un cliente, se elige a cuál nodo pertenece.
      </p>

      {formularioAbierto && (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (formNuevo.nombre.trim() && formNuevo.mikrotikHost.trim() && formNuevo.mikrotikUsuario.trim() && formNuevo.mikrotikPassword.trim()) {
            crear.mutate();
          }
        }}
        className="p-4 bg-stone-50 dark:bg-gray-900/40 border-b border-stone-300 dark:border-gray-700"
      >
        <p className="font-mono text-[10.5px] uppercase tracking-[0.15em] text-gray-600 dark:text-gray-300 mb-3">Nuevo nodo</p>
        <div className="grid grid-cols-2 gap-3 max-w-3xl">
        <input
          placeholder="Nombre del nodo (ej. Nodo Misicata)"
          required
          value={formNuevo.nombre}
          onChange={(e) => setFormNuevo({ ...formNuevo, nombre: e.target.value })}
          className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm col-span-2"
        />
        <input
          placeholder="Descripción / sector que cubre (opcional)"
          value={formNuevo.descripcion}
          onChange={(e) => setFormNuevo({ ...formNuevo, descripcion: e.target.value })}
          className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm col-span-2"
        />
        <input
          placeholder="IP del Mikrotik (ej. 192.168.12.1)"
          required
          value={formNuevo.mikrotikHost}
          onChange={(e) => setFormNuevo({ ...formNuevo, mikrotikHost: e.target.value })}
          className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
        />
        <select
          value={formNuevo.mascaraRed}
          onChange={(e) => {
            const mascaraRed = e.target.value;
            const rango = mascaraRed ? calcularRangoDesdeMascara(formNuevo.mikrotikHost, Number(mascaraRed)) : null;
            setFormNuevo({
              ...formNuevo,
              mascaraRed,
              ...(rango ? { rangoIpInicio: rango.inicio, rangoIpFin: rango.fin } : {}),
            });
          }}
          className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
        >
          <option value="">Máscara... Ej. /24 o /22</option>
          {MASCARAS_COMUNES.map((m) => (
            <option key={m} value={m}>
              /{m} ({2 ** (32 - m) - 2} direcciones útiles)
            </option>
          ))}
        </select>
        <input
          placeholder="Puerto API (8728 por defecto)"
          value={formNuevo.mikrotikPuerto}
          onChange={(e) => setFormNuevo({ ...formNuevo, mikrotikPuerto: e.target.value })}
          className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
        />
        <input
          placeholder="Usuario API del Mikrotik"
          required
          data-no-mayus="true"
          value={formNuevo.mikrotikUsuario}
          onChange={(e) => setFormNuevo({ ...formNuevo, mikrotikUsuario: e.target.value })}
          className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
        />
        <input
          type="password"
          placeholder="Contraseña API del Mikrotik"
          required
          value={formNuevo.mikrotikPassword}
          onChange={(e) => setFormNuevo({ ...formNuevo, mikrotikPassword: e.target.value })}
          className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
        />
        <input
          placeholder="Rango IP inicio (ej. 192.168.12.1)"
          value={formNuevo.rangoIpInicio}
          onChange={(e) => setFormNuevo({ ...formNuevo, rangoIpInicio: e.target.value })}
          className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
        />
        <input
          placeholder="Rango IP fin (ej. 192.168.12.254)"
          value={formNuevo.rangoIpFin}
          onChange={(e) => setFormNuevo({ ...formNuevo, rangoIpFin: e.target.value })}
          className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={probarNuevo}
          disabled={probando === "nuevo"}
          className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-sm text-sm font-semibold hover:bg-stone-100 dark:hover:bg-gray-700 disabled:opacity-50"
        >
          {probando === "nuevo" ? "Probando..." : "Probar conexión"}
        </button>
        <button
          type="submit"
          disabled={crear.isPending}
          className="bg-brand-700 text-white px-4 py-2 rounded-sm text-sm font-semibold hover:bg-brand-800 disabled:opacity-50"
        >
          {crear.isPending ? "Guardando..." : "+ Crear nodo"}
        </button>
        </div>
      </form>
      )}

      <div className="overflow-x-auto">
        <BarraBuscadorDocumentos
          filtros={filtros}
          etiquetaBusqueda="Buscar · nombre, descripción, IP del Mikrotik o rango"
          placeholder="Ej: Nodo Norte, 192.168.88.1..."
          mostrarPago={false}
          mostrarFechas={false}
        />
        <table className="w-full text-sm">
          <thead className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700 text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 [&_th]:font-medium">
            <tr>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2">Mikrotik</th>
              <th className="px-4 py-2">Rango IP</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">Cargando...</td>
              </tr>
            )}
            {!isLoading && nodosFiltrados?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">{filtros.hayFiltros ? "Ningún nodo coincide con la búsqueda." : "Todavía no hay nodos de red"}</td>
              </tr>
            )}
            {nodosFiltrados?.map((n) => (
              <tr key={n.id} className="border-t border-stone-100 dark:border-gray-700">
                {nodoEditandoId === n.id ? (
                  <td colSpan={5} className="px-4 py-3">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        editar.mutate(n.id);
                      }}
                      className="grid grid-cols-2 gap-2"
                    >
                      <input
                        autoFocus
                        required
                        value={editForm.nombre}
                        onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })}
                        className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm col-span-2"
                      />
                      <input
                        placeholder="Descripción / sector"
                        value={editForm.descripcion}
                        onChange={(e) => setEditForm({ ...editForm, descripcion: e.target.value })}
                        className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm col-span-2"
                      />
                      <input
                        placeholder="IP del Mikrotik"
                        required
                        value={editForm.mikrotikHost}
                        onChange={(e) => setEditForm({ ...editForm, mikrotikHost: e.target.value })}
                        className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
                      />
                      <select
                        value={editForm.mascaraRed}
                        onChange={(e) => {
                          const mascaraRed = e.target.value;
                          const rango = mascaraRed ? calcularRangoDesdeMascara(editForm.mikrotikHost, Number(mascaraRed)) : null;
                          setEditForm({
                            ...editForm,
                            mascaraRed,
                            ...(rango ? { rangoIpInicio: rango.inicio, rangoIpFin: rango.fin } : {}),
                          });
                        }}
                        className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
                      >
                        <option value="">Máscara... Ej. /24 o /22</option>
                        {MASCARAS_COMUNES.map((m) => (
                          <option key={m} value={m}>
                            /{m} ({2 ** (32 - m) - 2} direcciones útiles)
                          </option>
                        ))}
                      </select>
                      <input
                        placeholder="Puerto API"
                        value={editForm.mikrotikPuerto}
                        onChange={(e) => setEditForm({ ...editForm, mikrotikPuerto: e.target.value })}
                        className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
                      />
                      <input
                        placeholder="Usuario API"
                        required
                        data-no-mayus="true"
                        value={editForm.mikrotikUsuario}
                        onChange={(e) => setEditForm({ ...editForm, mikrotikUsuario: e.target.value })}
                        className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
                      />
                      <input
                        type="password"
                        placeholder="Contraseña API (vacío = no cambiarla)"
                        value={editForm.mikrotikPassword}
                        onChange={(e) => setEditForm({ ...editForm, mikrotikPassword: e.target.value })}
                        className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
                      />
                      <input
                        placeholder="Rango IP inicio"
                        value={editForm.rangoIpInicio}
                        onChange={(e) => setEditForm({ ...editForm, rangoIpInicio: e.target.value })}
                        className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
                      />
                      <input
                        placeholder="Rango IP fin"
                        value={editForm.rangoIpFin}
                        onChange={(e) => setEditForm({ ...editForm, rangoIpFin: e.target.value })}
                        className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => probarEdicion(n.id)}
                        disabled={probando === n.id}
                        className="bg-slate-700 text-white py-1.5 rounded-md text-sm font-medium hover:bg-slate-600 disabled:opacity-50"
                      >
                        {probando === n.id ? "Probando..." : "Probar conexión"}
                      </button>
                      <button
                        type="submit"
                        disabled={editar.isPending}
                        className="bg-brand-700 text-white py-1.5 rounded-md text-sm font-semibold hover:bg-brand-800 disabled:opacity-50"
                      >
                        {editar.isPending ? "Guardando..." : "Guardar cambios"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setNodoEditandoId(null)}
                        className="col-span-2 bg-stone-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 py-1.5 rounded-md text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-500"
                      >
                        Cancelar
                      </button>
                    </form>
                  </td>
                ) : (
                  <>
                    <td className="px-4 py-2">
                      <PulsoNodo pulso={pulsoPorNodo.get(n.id)} nodo={n} />
                    </td>
                    <td className="px-4 py-2">
                      <div className="font-semibold text-gray-800 dark:text-gray-100"><Resaltar texto={n.nombre} termino={filtros.busquedaAplicada} /></div>
                      {n.descripcion && <div className="text-xs text-gray-500 dark:text-gray-400">{n.descripcion}</div>}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-600 dark:text-gray-300"><Resaltar texto={n.mikrotikHost} termino={filtros.busquedaAplicada} />:{n.mikrotikPuerto}</td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-300">
                      {n.rangoIpInicio && n.rangoIpFin ? `${n.rangoIpInicio} – ${n.rangoIpFin}` : <span className="text-gray-300 dark:text-gray-600 italic">sin definir</span>}
                    </td>
                    <td className="px-4 py-2 text-right space-x-3">
                      <BotonReglasSuspension
                        estado={reglasPorNodo.get(n.id)}
                        cargando={configurarSuspension.isPending && configurarSuspension.variables === n.id}
                        onClick={() => configurarSuspension.mutate(n.id)}
                      />
                      <button
                        onClick={() => setNodoVlansId(nodoVlansId === n.id ? null : n.id)}
                        className="text-brand-700 dark:text-brand-300 hover:underline text-xs font-medium"
                      >
                        VLANs
                      </button>
                      <button
                        onClick={() => setNodoRespaldosId(nodoRespaldosId === n.id ? null : n.id)}
                        className="text-brand-700 dark:text-brand-300 hover:underline text-xs font-medium"
                      >
                        Respaldos
                      </button>
                      <button
                        onClick={() => abrirEdicion(n)}
                        className="text-brand-700 dark:text-brand-300 hover:underline text-xs font-medium"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => confirmarDesactivar(n)}
                        className="text-red-600 dark:text-red-400 hover:underline text-xs font-medium"
                      >
                        Desactivar
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {nodoVlansId !== null && nodos?.some((n) => n.id === nodoVlansId) && (
              <tr>
                <td colSpan={5} className="px-4 py-3 bg-stone-50 dark:bg-gray-900/30">
                  <PanelVlansNodo nodo={nodos!.find((n) => n.id === nodoVlansId)!} />
                </td>
              </tr>
            )}
            {nodoRespaldosId !== null && nodos?.some((n) => n.id === nodoRespaldosId) && (
              <tr>
                <td colSpan={5} className="px-4 py-3 bg-stone-50 dark:bg-gray-900/30">
                  <PanelRespaldosNodo nodo={nodos!.find((n) => n.id === nodoRespaldosId)!} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const FORM_VLAN_VACIO = { nombre: "", vlanId: "", interfaz: "", mascaraRed: "", rangoIpInicio: "", rangoIpFin: "" };

// Catálogo de VLANs de un nodo — organizativo (ver comentario en el modelo
// VlanNodo, schema.prisma): un mismo Mikrotik puede atender varios
// sub-sectores/servicios en VLANs distintas, cada una con su propia subred.
// "Detectar VLANs" lee del router lo que ya tiene configurado (para no
// tipear el VLAN ID a mano); "+ Agregar VLAN" también permite cargarla
// suelta. No cambia la lógica de suspensión (sigue siendo por IP).
function PanelVlansNodo({ nodo }: { nodo: NodoRed }) {
  const queryClient = useQueryClient();
  const confirmar = useConfirm();
  const { mostrarToast } = useToast();
  const [mostrarForm, setMostrarForm] = useState(false);
  const [vlanEditandoId, setVlanEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState(FORM_VLAN_VACIO);
  const [detectadas, setDetectadas] = useState<VlanDetectada[] | null>(null);
  const [detectando, setDetectando] = useState(false);

  const { data: vlans, isLoading } = useQuery({
    queryKey: ["vlans-nodo", nodo.id],
    queryFn: async () => (await api.get<VlanNodo[]>(`/nodos-red/${nodo.id}/vlans`)).data,
  });

  function aplicarMascara(mascaraRed: string, host: string, setter: (f: typeof FORM_VLAN_VACIO) => void, base: typeof FORM_VLAN_VACIO) {
    const rango = mascaraRed ? calcularRangoDesdeMascara(host, Number(mascaraRed)) : null;
    setter({ ...base, mascaraRed, ...(rango ? { rangoIpInicio: rango.inicio, rangoIpFin: rango.fin } : {}) });
  }

  async function detectar() {
    setDetectando(true);
    try {
      const { data } = await api.get<VlanDetectada[]>(`/nodos-red/${nodo.id}/vlans/detectar`);
      setDetectadas(data);
      if (data.length === 0) mostrarToast("No se encontró ninguna VLAN configurada en este Mikrotik");
    } catch (error: any) {
      mostrarToast(error.response?.data?.error ?? "No se pudo consultar las VLANs en el Mikrotik");
    } finally {
      setDetectando(false);
    }
  }

  const crear = useMutation({
    mutationFn: async (datos: typeof FORM_VLAN_VACIO & { yaExisteEnRouter?: boolean }) => api.post(`/nodos-red/${nodo.id}/vlans`, datos),
    onSuccess: (_r, variables) => {
      queryClient.invalidateQueries({ queryKey: ["vlans-nodo", nodo.id] });
      setForm(FORM_VLAN_VACIO);
      setMostrarForm(false);
      mostrarToast(variables.yaExisteEnRouter ? "VLAN importada" : "VLAN creada en el Mikrotik y guardada", "success");
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "No se pudo agregar la VLAN"),
  });

  const editar = useMutation({
    mutationFn: async ({ id, datos }: { id: number; datos: typeof FORM_VLAN_VACIO }) => api.put(`/nodos-red/${nodo.id}/vlans/${id}`, datos),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vlans-nodo", nodo.id] });
      setVlanEditandoId(null);
      mostrarToast("VLAN actualizada", "success");
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "No se pudo editar la VLAN"),
  });

  const desactivar = useMutation({
    mutationFn: async (id: number) => api.delete(`/nodos-red/${nodo.id}/vlans/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vlans-nodo", nodo.id] });
      queryClient.invalidateQueries({ queryKey: ["clientes"] }); // clientes con esa VLAN pueden mostrar su nombre en la tabla
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "No se pudo desactivar la VLAN"),
  });

  async function confirmarDesactivarVlan(v: VlanNodo) {
    const ok = await confirmar(
      `¿Desactivar "${v.nombre}" (VLAN ${v.vlanId})? Esto ELIMINA la interfaz VLAN de verdad en el Mikrotik de ${nodo.nombre} (los clientes que ya están vinculados a ella en el sistema la conservan, pero deja de existir en el router).`
    );
    if (ok) desactivar.mutate(v.id);
  }

  function abrirEdicionVlan(v: VlanNodo) {
    setForm({
      nombre: v.nombre,
      vlanId: String(v.vlanId),
      interfaz: v.interfaz ?? "",
      mascaraRed: v.mascaraRed ? String(v.mascaraRed) : "",
      rangoIpInicio: v.rangoIpInicio ?? "",
      rangoIpFin: v.rangoIpFin ?? "",
    });
    setVlanEditandoId(vlanEditandoId === v.id ? null : v.id);
    setMostrarForm(false);
  }

  function yaGuardada(vlanId: number): boolean {
    return (vlans ?? []).some((v) => v.vlanId === vlanId);
  }

  return (
    <div className="max-w-3xl">
      <div className="flex justify-between items-center mb-3">
        <h4 className="font-mono text-[11px] uppercase tracking-[0.15em] text-gray-600 dark:text-gray-300">VLANs — {nodo.nombre}</h4>
        <div className="space-x-2">
          <button
            onClick={detectar}
            disabled={detectando}
            className="bg-slate-700 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-slate-600 disabled:opacity-50"
          >
            {detectando ? "Detectando..." : "Detectar VLANs"}
          </button>
          <button
            onClick={() => {
              setMostrarForm(!mostrarForm);
              setVlanEditandoId(null);
              setForm(FORM_VLAN_VACIO);
            }}
            className="bg-brand-700 text-white px-3 py-1.5 rounded-md text-xs font-semibold hover:bg-brand-800"
          >
            + Agregar VLAN
          </button>
        </div>
      </div>

      {detectadas && (
        <div className="mb-3 border border-sky-200 dark:border-sky-800 rounded-md p-3 bg-sky-50 dark:bg-sky-900/20">
          <div className="flex justify-between items-center mb-1.5">
            <p className="text-xs font-medium text-sky-800 dark:text-sky-300">Encontradas en el Mikrotik ahora mismo:</p>
            <button onClick={() => setDetectadas(null)} className="text-xs text-sky-700 dark:text-sky-400 hover:underline">
              Cerrar
            </button>
          </div>
          {detectadas.length === 0 && <p className="text-xs text-gray-500 dark:text-gray-400">Ninguna.</p>}
          <ul className="space-y-1">
            {detectadas.map((d) => (
              <li key={d.vlanId} className="flex justify-between items-center text-xs">
                <span className="text-gray-700 dark:text-gray-300">
                  {d.nombre} — VLAN {d.vlanId} (interfaz padre: {d.interfaz || "?"})
                </span>
                {yaGuardada(d.vlanId) ? (
                  <span className="text-gray-400 dark:text-gray-500">Ya guardada</span>
                ) : (
                  <button
                    onClick={() =>
                      crear.mutate({
                        nombre: d.nombre,
                        vlanId: String(d.vlanId),
                        interfaz: d.interfaz,
                        mascaraRed: "",
                        rangoIpInicio: "",
                        rangoIpFin: "",
                        yaExisteEnRouter: true,
                      })
                    }
                    disabled={crear.isPending}
                    className="text-emerald-700 dark:text-emerald-400 hover:underline font-medium disabled:opacity-50"
                  >
                    Importar
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {mostrarForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            crear.mutate(form);
          }}
          className="mb-3 border border-stone-300 dark:border-gray-700 rounded-md p-3 grid grid-cols-2 gap-2"
        >
          <p className="col-span-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-md px-2 py-1.5">
            Esto crea la interfaz VLAN de verdad en el Mikrotik de {nodo.nombre} (no solo la guarda acá).
          </p>
          <input
            placeholder="Nombre (ej. VLAN 10 - Clientes Norte)"
            required
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm col-span-2"
          />
          <input
            placeholder="VLAN ID (ej. 10)"
            required
            type="number"
            value={form.vlanId}
            onChange={(e) => setForm({ ...form, vlanId: e.target.value })}
            className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
          />
          <input
            placeholder="Interfaz padre (ej. ether2 o bridge1)"
            required
            value={form.interfaz}
            onChange={(e) => setForm({ ...form, interfaz: e.target.value })}
            className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
          />
          <select
            value={form.mascaraRed}
            onChange={(e) => aplicarMascara(e.target.value, nodo.mikrotikHost, setForm, form)}
            className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
          >
            <option value="">Máscara... Ej. /24 o /22</option>
            {MASCARAS_COMUNES.map((m) => (
              <option key={m} value={m}>
                /{m} ({2 ** (32 - m) - 2} direcciones útiles)
              </option>
            ))}
          </select>
          <input
            placeholder="Rango IP inicio"
            value={form.rangoIpInicio}
            onChange={(e) => setForm({ ...form, rangoIpInicio: e.target.value })}
            className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
          />
          <input
            placeholder="Rango IP fin"
            value={form.rangoIpFin}
            onChange={(e) => setForm({ ...form, rangoIpFin: e.target.value })}
            className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={crear.isPending}
            className="col-span-2 bg-brand-700 text-white py-1.5 rounded-md text-xs font-semibold hover:bg-brand-800 disabled:opacity-50"
          >
            {crear.isPending ? "Guardando..." : "Guardar VLAN"}
          </button>
        </form>
      )}

      {isLoading && <p className="text-xs text-gray-400 dark:text-gray-500">Cargando...</p>}
      {!isLoading && vlans?.length === 0 && <p className="text-xs text-gray-400 dark:text-gray-500">Todavía no hay ninguna VLAN guardada de este nodo.</p>}
      {vlans && vlans.length > 0 && (
        <table className="w-full text-xs bg-white dark:bg-gray-800 rounded-md overflow-hidden">
          <thead className="bg-stone-100 dark:bg-gray-700 text-left text-gray-600 dark:text-gray-300">
            <tr>
              <th className="px-3 py-2">Nombre</th>
              <th className="px-3 py-2">VLAN ID</th>
              <th className="px-3 py-2">Interfaz</th>
              <th className="px-3 py-2">Rango IP</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {vlans.map((v) => (
              <Fragment key={v.id}>
                <tr className="border-t border-stone-100 dark:border-gray-700">
                  <td className="px-3 py-2">{v.nombre}</td>
                  <td className="px-3 py-2">{v.vlanId}</td>
                  <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{v.interfaz || "—"}</td>
                  <td className="px-3 py-2 text-gray-500 dark:text-gray-400">
                    {v.rangoIpInicio && v.rangoIpFin ? `${v.rangoIpInicio} – ${v.rangoIpFin}` : "sin definir"}
                  </td>
                  <td className="px-3 py-2 text-right space-x-2 whitespace-nowrap">
                    <button onClick={() => abrirEdicionVlan(v)} className="text-brand-700 dark:text-brand-300 hover:underline font-medium">
                      Editar
                    </button>
                    <button onClick={() => confirmarDesactivarVlan(v)} className="text-red-600 dark:text-red-400 hover:underline font-medium">
                      Desactivar
                    </button>
                  </td>
                </tr>
                {vlanEditandoId === v.id && (
                  <tr key={`${v.id}-edit`} className="border-t border-stone-100 dark:border-gray-700">
                    <td colSpan={5} className="px-3 py-3">
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          editar.mutate({ id: v.id, datos: form });
                        }}
                        className="grid grid-cols-2 gap-2"
                      >
                        <p className="col-span-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-md px-2 py-1.5">
                          Esto edita la interfaz VLAN de verdad en el Mikrotik de {nodo.nombre}.
                        </p>
                        <input
                          required
                          value={form.nombre}
                          onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                          className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm col-span-2"
                        />
                        <input
                          required
                          type="number"
                          placeholder="VLAN ID"
                          value={form.vlanId}
                          onChange={(e) => setForm({ ...form, vlanId: e.target.value })}
                          className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
                        />
                        <input
                          required
                          placeholder="Interfaz padre"
                          value={form.interfaz}
                          onChange={(e) => setForm({ ...form, interfaz: e.target.value })}
                          className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
                        />
                        <select
                          value={form.mascaraRed}
                          onChange={(e) => aplicarMascara(e.target.value, nodo.mikrotikHost, setForm, form)}
                          className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
                        >
                          <option value="">Máscara... Ej. /24 o /22</option>
                          {MASCARAS_COMUNES.map((m) => (
                            <option key={m} value={m}>
                              /{m} ({2 ** (32 - m) - 2} direcciones útiles)
                            </option>
                          ))}
                        </select>
                        <input
                          placeholder="Rango IP inicio"
                          value={form.rangoIpInicio}
                          onChange={(e) => setForm({ ...form, rangoIpInicio: e.target.value })}
                          className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
                        />
                        <input
                          placeholder="Rango IP fin"
                          value={form.rangoIpFin}
                          onChange={(e) => setForm({ ...form, rangoIpFin: e.target.value })}
                          className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
                        />
                        <button
                          type="submit"
                          disabled={editar.isPending}
                          className="bg-brand-700 text-white py-1.5 rounded-md text-xs font-semibold hover:bg-brand-800 disabled:opacity-50"
                        >
                          {editar.isPending ? "Guardando..." : "Guardar cambios"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setVlanEditandoId(null)}
                          className="bg-stone-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 py-1.5 rounded-md text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-500"
                        >
                          Cancelar
                        </button>
                      </form>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// Historial de respaldos de configuración de este nodo (listas de
// interfaces, reglas de firewall/NAT, address-lists) — "Respaldar ahora"
// guarda una copia nueva; cada respaldo se puede descargar (para guardarlo
// aparte, fuera de este sistema) o restaurar sobre el Mikrotik configurado
// AHORA en este nodo (pensado para cuando el equipo dañado ya se reemplazó
// por uno nuevo, de fábrica, con el mismo host/credenciales de siempre).
function PanelRespaldosNodo({ nodo }: { nodo: NodoRed }) {
  const queryClient = useQueryClient();
  const confirmar = useConfirm();
  const { mostrarToast } = useToast();
  const [restaurando, setRestaurando] = useState<number | null>(null);
  const [ultimoResultado, setUltimoResultado] = useState<ResultadoRestauracionMikrotik | null>(null);

  const { data: respaldos, isLoading } = useQuery({
    queryKey: ["mikrotik-respaldos", nodo.id],
    queryFn: async () => (await api.get<ResumenRespaldoMikrotik[]>(`/nodos-red/${nodo.id}/respaldos`)).data,
  });

  const respaldar = useMutation({
    mutationFn: async () => (await api.post(`/nodos-red/${nodo.id}/respaldos`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mikrotik-respaldos", nodo.id] });
      mostrarToast("Respaldo de configuración guardado", "success");
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "No se pudo respaldar la configuración del Mikrotik"),
  });

  async function descargar(respaldoId: number) {
    const { data } = await api.get<RespaldoMikrotikCompleto>(`/nodos-red/${nodo.id}/respaldos/${respaldoId}`);
    const blob = new Blob([JSON.stringify(data.contenido, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `respaldo-mikrotik-${nodo.nombre.replace(/\s+/g, "-")}-${respaldoId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function restaurar(respaldoId: number, fecha: string) {
    const ok = await confirmar(
      `¿Restaurar el respaldo del ${new Date(fecha).toLocaleString("es-EC")} sobre el Mikrotik configurado ahora en "${nodo.nombre}" (${nodo.mikrotikHost})? Esto va a crear en ese router las listas de interfaces, reglas de firewall/NAT y address-lists guardadas — pensado para un equipo de reemplazo recién puesto, de fábrica. No borra nada que ya exista, solo agrega.`
    );
    if (!ok) return;
    setRestaurando(respaldoId);
    setUltimoResultado(null);
    try {
      const { data } = await api.post<ResultadoRestauracionMikrotik>(`/nodos-red/${nodo.id}/respaldos/${respaldoId}/restaurar`);
      setUltimoResultado(data);
      mostrarToast(`Restauración terminada: ${data.exitosos}/${data.total} aplicados`, data.fallidos > 0 ? "error" : "success");
    } catch (error: any) {
      mostrarToast(error.response?.data?.error ?? "No se pudo restaurar la configuración en el Mikrotik");
    } finally {
      setRestaurando(null);
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="flex justify-between items-center mb-3">
        <h4 className="font-mono text-[11px] uppercase tracking-[0.15em] text-gray-600 dark:text-gray-300">
          Respaldos de configuración — {nodo.nombre}
        </h4>
        <button
          onClick={() => respaldar.mutate()}
          disabled={respaldar.isPending}
          className="bg-brand-700 text-white px-3 py-1.5 rounded-md text-xs font-semibold hover:bg-brand-800 disabled:opacity-50"
        >
          {respaldar.isPending ? "Respaldando..." : "Respaldar ahora"}
        </button>
      </div>

      {isLoading && <p className="text-xs text-gray-400 dark:text-gray-500">Cargando...</p>}
      {!isLoading && respaldos?.length === 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500">Todavía no hay ningún respaldo guardado de este nodo.</p>
      )}
      {respaldos && respaldos.length > 0 && (
        <table className="w-full text-xs bg-white dark:bg-gray-800 rounded-md overflow-hidden">
          <thead className="bg-stone-100 dark:bg-gray-700 text-left text-gray-600 dark:text-gray-300">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Por</th>
              <th className="px-3 py-2">Contenido</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {respaldos.map((r) => (
              <tr key={r.id} className="border-t border-stone-100 dark:border-gray-700">
                <td className="px-3 py-2">{new Date(r.createdAt).toLocaleString("es-EC")}</td>
                <td className="px-3 py-2">{r.usuario?.nombre ?? "—"}</td>
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400">
                  {r.totalInterfaceLists} lista(s) interfaz · {r.totalReglasFiltro} filtro · {r.totalReglasNat} NAT · {r.totalEntradasAddressList} address-list
                </td>
                <td className="px-3 py-2 text-right space-x-2 whitespace-nowrap">
                  <button onClick={() => descargar(r.id)} className="text-brand-700 dark:text-brand-300 hover:underline font-medium">
                    Descargar
                  </button>
                  <button
                    onClick={() => restaurar(r.id, r.createdAt)}
                    disabled={restaurando === r.id}
                    className="text-amber-700 dark:text-amber-400 hover:underline font-medium disabled:opacity-50"
                  >
                    {restaurando === r.id ? "Restaurando..." : "Restaurar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {ultimoResultado && (
        <div className="mt-3 border border-stone-300 dark:border-gray-700 rounded-md p-3 bg-white dark:bg-gray-800">
          <p className="text-xs font-medium text-gray-700 dark:text-gray-200 mb-1.5">
            Resultado de la restauración: {ultimoResultado.exitosos}/{ultimoResultado.total} aplicados
          </p>
          <ul className="space-y-0.5 max-h-40 overflow-y-auto">
            {ultimoResultado.detalle.map((d, i) => (
              <li key={i} className={`text-[11px] ${d.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                {d.ok ? "✓" : "✕"} {d.tabla}: {d.item}
                {d.error && ` — ${d.error}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// "Reglas configuradas" (verde, con ✓) si el router de este nodo YA tiene
// las dos reglas de suspensión puestas AHORA MISMO (ver
// GET /nodos-red/:id/estado-suspension — estado en vivo, no un flag guardado
// que podría quedar desactualizado si alguien las borra a mano en el
// router); "Configurar reglas" (azul, accionable) en cualquier otro caso —
// falta alguna, no se pudo consultar, o todavía se está verificando. Sigue
// siendo clickeable en ambos estados: repetirlo cuando ya están puestas no
// hace nada (es idempotente), y sirve para volver a verificar.
function BotonReglasSuspension({
  estado,
  cargando,
  onClick,
}: {
  estado: { data?: EstadoReglasSuspension; isLoading: boolean; isError: boolean } | undefined;
  cargando: boolean;
  onClick: () => void;
}) {
  const configuradas = estado?.data?.tcp && estado?.data?.udp;
  return (
    <button
      onClick={onClick}
      disabled={cargando}
      className={`hover:underline text-xs font-medium disabled:opacity-50 ${
        configuradas ? "text-emerald-600 dark:text-emerald-400" : "text-sky-700 dark:text-sky-400"
      }`}
      title='Crea (si hace falta) las reglas de Filter Rules que hacen que la lista "Suspendido" corte el tráfico'
    >
      {cargando ? "Configurando..." : estado?.isLoading ? "Verificando reglas..." : configuradas ? "✓ Reglas configuradas" : "Configurar reglas"}
    </button>
  );
}

// RouterOS junta las unidades sin espacio (ej. "1w6d23h59m59s") — esto lo
// separa para que se lea más fácil: "1w 6d 23h 59m 59s".
function formatearUptimeRouterOS(crudo: string): string {
  return crudo.replace(/([a-zA-Z])(\d)/g, "$1 $2").trim();
}

// Duración legible a partir de milisegundos — para "sin conexión desde
// hace X", calculado en el navegador contra NodoRed.ultimaConexionExitosa.
function formatearDuracion(ms: number): string {
  const segundos = Math.floor(ms / 1000);
  if (segundos < 60) return `${segundos} s`;
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas} h ${minutos % 60} min`;
  const dias = Math.floor(horas / 24);
  return `${dias} d ${horas % 24} h`;
}

// Pulso de vida de un nodo: verde = respondió (con el uptime real del
// equipo, reportado por el propio router), rojo = no se pudo conectar (con
// desde cuándo, calculado contra la última vez que SÍ respondió — guardado
// en la base, no se pierde aunque cierres la pantalla), gris parpadeando =
// todavía no llega la primera respuesta. Nunca bloquea ni pide acción —
// solo refleja lo que ya está revisando solo cada INTERVALO_PULSO_MS (ver
// useQueries arriba).
function PulsoNodo({
  pulso,
  nodo,
}: {
  pulso: { data?: EstadoMikrotik; isLoading: boolean; isError: boolean; isFetching: boolean } | undefined;
  nodo: NodoRed;
}) {
  if (!pulso || pulso.isLoading) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
        <span className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600 animate-pulse inline-block" />
        Verificando...
      </span>
    );
  }
  if (pulso.isError) {
    const desde = nodo.ultimaConexionExitosa
      ? `desde hace ${formatearDuracion(Date.now() - new Date(nodo.ultimaConexionExitosa).getTime())}`
      : "nunca se ha podido conectar";
    return (
      <div>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400" title="No se pudo conectar con este Mikrotik">
          <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
          Sin conexión
        </span>
        <p className="text-[11px] text-red-500/80 dark:text-red-400/70 mt-0.5">{desde}</p>
      </div>
    );
  }
  return (
    <div>
      <span
        className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"
        title={pulso.data ? `${pulso.data.identidad} — RouterOS ${pulso.data.version}` : undefined}
      >
        <span className={`w-2 h-2 rounded-full bg-emerald-500 inline-block ${pulso.isFetching ? "animate-pulse" : ""}`} />
        En línea
      </span>
      {pulso.data?.uptime && (
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">activo hace {formatearUptimeRouterOS(pulso.data.uptime)}</p>
      )}
    </div>
  );
}
