import { Fragment, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Olt, type OltOnu, type OltEvento, type NodoRed, type ResultadoSincronizacionOlt, type ResultadoExplorarOid } from "../api/client";
import { useConfirm } from "../components/ConfirmProvider";
import { useToast } from "../components/ToastProvider";
import { BuscadorCliente } from "../components/BuscadorCliente";
import { useFiltrosListado, BarraBuscadorDocumentos, filtrarLocal, sinPaginacion } from "../components/BuscadorDocumentos";
import { Resaltar } from "../components/FormatoDocumento";

const MODELOS = ["MA5608T", "MA5800-X7"];

// snmpComunidad/snmpAuthPassword/snmpPrivPassword nunca vuelven del backend
// (ver Olt en api/client.ts) — al editar, dejarlos vacíos significa "no
// cambiarlos", mismo criterio que mikrotikPassword en NodosPage.tsx.
const FORM_VACIO = {
  nombre: "",
  modelo: "MA5608T",
  direccionIp: "",
  snmpPuerto: "161",
  snmpVersion: "2c",
  snmpComunidad: "public",
  snmpUsuario: "",
  snmpAuthProtocolo: "SHA",
  snmpAuthPassword: "",
  snmpPrivProtocolo: "AES",
  snmpPrivPassword: "",
  sshPuerto: "22",
  sshUsuario: "",
  sshPassword: "",
  ubicacion: "",
  nodoId: "",
};

// Duración legible a partir de milisegundos, mismo criterio que
// formatearDuracion en NodosPage.tsx (no se comparte por no haber un módulo
// de utilidades de UI compartido entre las dos pantallas).
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

const campoClase =
  "border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm";

// Campos SSH (VRP CLI) — opcionales: solo hacen falta para usar la Vista por
// puerto GPON del Mapa de Red (temperatura/distancia por ONT, ver
// utils/oltHuaweiSsh.ts). Una OLT sin esto configurado sigue funcionando
// normalmente por SNMP.
//
// Definido a nivel de MÓDULO a propósito, no dentro de OltsPage: un
// componente declarado dentro de otro componente cambia de identidad en
// cada render (nueva función = nuevo tipo para React), lo que hace que React
// destruya y vuelva a crear estos <input> en cada tecla — el síntoma es
// justo perder el foco/cursor al escribir. probando/onProbar se reciben como
// props en vez de por closure, precisamente para poder vivir afuera de
// OltsPage.
function CamposSsh({
  form,
  set,
  marcador,
  probandoSsh,
  onProbar,
}: {
  form: typeof FORM_VACIO;
  set: (f: typeof FORM_VACIO) => void;
  marcador: "nuevo" | number;
  probandoSsh: "nuevo" | number | null;
  onProbar: (form: typeof FORM_VACIO, marcador: "nuevo" | number) => void;
}) {
  return (
    <div className="col-span-2 border-t border-stone-300 dark:border-gray-700 pt-3 mt-1">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
        SSH (opcional) — solo para la Vista por puerto GPON del Mapa de Red (temperatura y distancia por ONT). Dejar en blanco si no se va a usar.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <input
          placeholder="Puerto SSH (ej. 22)"
          value={form.sshPuerto}
          onChange={(e) => set({ ...form, sshPuerto: e.target.value })}
          className={campoClase}
        />
        <input
          placeholder="Usuario SSH"
          value={form.sshUsuario}
          onChange={(e) => set({ ...form, sshUsuario: e.target.value })}
          className={campoClase}
        />
        <input
          type="password"
          placeholder="Contraseña SSH"
          value={form.sshPassword}
          onChange={(e) => set({ ...form, sshPassword: e.target.value })}
          className={`${campoClase} col-span-2`}
        />
        <button
          type="button"
          onClick={() => onProbar(form, marcador)}
          disabled={probandoSsh === marcador || !form.direccionIp.trim() || !form.sshUsuario.trim() || !form.sshPassword.trim()}
          className="col-span-2 border border-stone-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium px-4 py-2 rounded-md hover:bg-stone-50 dark:hover:bg-gray-700 disabled:opacity-50"
        >
          {probandoSsh === marcador ? "Probando..." : "Probar conexión SSH"}
        </button>
      </div>
    </div>
  );
}

// Mismo motivo que CamposSsh arriba: a nivel de módulo para no perder el
// foco de los inputs en cada tecla.
function CamposSnmp({ form, set }: { form: typeof FORM_VACIO; set: (f: typeof FORM_VACIO) => void }) {
  return (
    <>
      <select value={form.snmpVersion} onChange={(e) => set({ ...form, snmpVersion: e.target.value })} className={campoClase}>
        <option value="2c">SNMP v2c</option>
        <option value="1">SNMP v1</option>
        <option value="3">SNMP v3</option>
      </select>
      <input
        placeholder="Puerto SNMP"
        value={form.snmpPuerto}
        onChange={(e) => set({ ...form, snmpPuerto: e.target.value })}
        className={campoClase}
      />
      {form.snmpVersion !== "3" ? (
        <input
          placeholder="Comunidad (ej. public)"
          value={form.snmpComunidad}
          onChange={(e) => set({ ...form, snmpComunidad: e.target.value })}
          className={`${campoClase} col-span-2`}
        />
      ) : (
        <>
          <input
            placeholder="Usuario SNMPv3"
            value={form.snmpUsuario}
            onChange={(e) => set({ ...form, snmpUsuario: e.target.value })}
            className={campoClase}
          />
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

export function OltsPage() {
  const queryClient = useQueryClient();
  const confirmar = useConfirm();
  const { mostrarToast } = useToast();

  const [formNuevo, setFormNuevo] = useState(FORM_VACIO);
  const [oltEditandoId, setOltEditandoId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState(FORM_VACIO);
  const [probando, setProbando] = useState<"nuevo" | number | null>(null);
  const [probandoSsh, setProbandoSsh] = useState<"nuevo" | number | null>(null);
  const [oltDetalleId, setOltDetalleId] = useState<number | null>(null);
  const [mostrarFormularioOlt, setMostrarFormularioOlt] = useState(false);

  const { data: olts, isLoading } = useQuery({
    queryKey: ["olts"],
    queryFn: async () => (await api.get<Olt[]>("/olts")).data,
  });

  const { data: nodos } = useQuery({
    queryKey: ["nodos-red"],
    queryFn: async () => (await api.get<NodoRed[]>("/nodos-red")).data,
  });

  const crear = useMutation({
    mutationFn: async () =>
      api.post("/olts", { ...formNuevo, snmpPuerto: Number(formNuevo.snmpPuerto), nodoId: formNuevo.nodoId || null }),
    onSuccess: (respuesta) => {
      queryClient.invalidateQueries({ queryKey: ["olts"] });
      setFormNuevo(FORM_VACIO);
      setMostrarFormularioOlt(false);
      const advertenciaSnmp: string | undefined = respuesta.data?.advertenciaSnmp;
      if (advertenciaSnmp) mostrarToast(advertenciaSnmp);
      else mostrarToast("OLT creada y sincronizada por SNMP", "success");
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al crear la OLT"),
  });

  const editar = useMutation({
    mutationFn: async (id: number) => api.put(`/olts/${id}`, { ...editForm, snmpPuerto: Number(editForm.snmpPuerto), nodoId: editForm.nodoId || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["olts"] });
      setOltEditandoId(null);
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al editar la OLT"),
  });

  const desactivar = useMutation({
    mutationFn: async (id: number) => api.delete(`/olts/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["olts"] }),
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al desactivar la OLT"),
  });

  const sincronizar = useMutation({
    mutationFn: async (id: number) => (await api.post<ResultadoSincronizacionOlt>(`/olts/${id}/sincronizar`)).data,
    onSuccess: (resultado, id) => {
      queryClient.invalidateQueries({ queryKey: ["olts"] });
      queryClient.invalidateQueries({ queryKey: ["olt-onus", id] });
      queryClient.invalidateQueries({ queryKey: ["olt-eventos", id] });
      mostrarToast(
        `${resultado.totalDetectadas} ONU(s) detectadas — ${resultado.nuevas} nueva(s), ${resultado.actualizadas} actualizada(s), ${resultado.desaparecidas} desaparecida(s)`,
        "success"
      );
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "No se pudo sincronizar la OLT por SNMP"),
  });

  function abrirEdicion(o: Olt) {
    setEditForm({
      nombre: o.nombre,
      modelo: o.modelo,
      direccionIp: o.direccionIp,
      snmpPuerto: String(o.snmpPuerto),
      snmpVersion: o.snmpVersion,
      snmpComunidad: "",
      snmpUsuario: o.snmpUsuario ?? "",
      snmpAuthProtocolo: o.snmpAuthProtocolo ?? "SHA",
      snmpAuthPassword: "",
      snmpPrivProtocolo: o.snmpPrivProtocolo ?? "AES",
      snmpPrivPassword: "",
      sshPuerto: String(o.sshPuerto ?? 22),
      sshUsuario: o.sshUsuario ?? "",
      sshPassword: "",
      ubicacion: o.ubicacion ?? "",
      nodoId: o.nodoId ? String(o.nodoId) : "",
    });
    setOltEditandoId(oltEditandoId === o.id ? null : o.id);
  }

  async function confirmarDesactivar(o: Olt) {
    const ok = await confirmar(`¿Desactivar la OLT "${o.nombre}"? Las ONUs y el historial ya guardados se conservan.`);
    if (ok) desactivar.mutate(o.id);
  }

  async function probar(form: typeof FORM_VACIO, marcador: "nuevo" | number) {
    setProbando(marcador);
    try {
      const { data } = await api.post("/olts/probar", { ...form, snmpPuerto: Number(form.snmpPuerto) });
      mostrarToast(`Conectado: ${data.sysName || data.sysDescr || "OK"}`, "success");
    } catch (error: any) {
      mostrarToast(error.response?.data?.error ?? "No se pudo conectar por SNMP con esas credenciales");
    } finally {
      setProbando(null);
    }
  }

  async function probarSsh(form: typeof FORM_VACIO, marcador: "nuevo" | number) {
    setProbandoSsh(marcador);
    try {
      const { data } = await api.post("/olts/probar-ssh", {
        direccionIp: form.direccionIp,
        sshPuerto: Number(form.sshPuerto),
        sshUsuario: form.sshUsuario,
        sshPassword: form.sshPassword,
      });
      mostrarToast(`Conectado por SSH: ${data.resumen}`, "success");
    } catch (error: any) {
      mostrarToast(error.response?.data?.error ?? "No se pudo conectar por SSH con esas credenciales");
    } finally {
      setProbandoSsh(null);
    }
  }


  // Buscador del listado (en el navegador: la lista ya viene completa).
  const filtros = useFiltrosListado(sinPaginacion);
  const oltsFiltradas = filtrarLocal(olts, filtros, {
    textos: (o) => [o.nombre, o.modelo, o.direccionIp, o.nodo?.nombre, o.ubicacion],
    estado: (o) => o.modelo,
  });

  return (
    <div className="bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-stone-300 dark:border-gray-700">
        <h2 className="text-base font-bold text-gray-900 dark:text-gray-50">OLT (Optical Line Terminal)</h2>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] text-gray-400 dark:text-gray-500">
            {olts ? `${olts.length} OLT${olts.length === 1 ? "" : "s"}` : ""}
          </span>
          {(olts?.length ?? 0) > 0 && (
          <button
            onClick={() => setMostrarFormularioOlt((v) => !v)}
            className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 px-3 py-1.5 rounded-sm text-sm font-semibold hover:bg-stone-50 dark:hover:bg-gray-700"
          >
            {mostrarFormularioOlt ? "Cancelar" : "+ Nueva OLT"}
          </button>
          )}
        </div>
      </div>
      <p className="px-4 py-2 bg-stone-50 dark:bg-gray-900/40 border-b border-stone-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
        Inventario de las OLT Huawei del ISP. El sistema solo LEE por SNMP el estado y la señal óptica de cada ONU — nunca configura ni
        aprovisiona la OLT (eso se sigue haciendo desde la herramienta propia de Huawei). Acá se vincula qué ONU corresponde a qué cliente,
        para diagnóstico y ubicación rápida.
      </p>

      {(mostrarFormularioOlt || olts?.length === 0) && (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (formNuevo.nombre.trim() && formNuevo.direccionIp.trim()) crear.mutate();
        }}
        className="p-4 bg-stone-50 dark:bg-gray-900/40 border-b border-stone-300 dark:border-gray-700"
      >
        <p className="font-mono text-[10.5px] uppercase tracking-[0.15em] text-gray-600 dark:text-gray-300 mb-3">Nueva OLT</p>
        <div className="grid grid-cols-2 gap-3 max-w-3xl">
        <input
          placeholder="Nombre de la OLT (ej. OLT Central)"
          required
          value={formNuevo.nombre}
          onChange={(e) => setFormNuevo({ ...formNuevo, nombre: e.target.value })}
          className={`${campoClase} col-span-2`}
        />
        <select value={formNuevo.modelo} onChange={(e) => setFormNuevo({ ...formNuevo, modelo: e.target.value })} className={campoClase}>
          {MODELOS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <input
          placeholder="IP de gestión (ej. 192.168.1.10)"
          required
          value={formNuevo.direccionIp}
          onChange={(e) => setFormNuevo({ ...formNuevo, direccionIp: e.target.value })}
          className={campoClase}
        />
        <CamposSnmp form={formNuevo} set={setFormNuevo} />
        <CamposSsh form={formNuevo} set={setFormNuevo} marcador="nuevo" probandoSsh={probandoSsh} onProbar={probarSsh} />
        <input
          placeholder="Ubicación / sector (opcional)"
          value={formNuevo.ubicacion}
          onChange={(e) => setFormNuevo({ ...formNuevo, ubicacion: e.target.value })}
          className={campoClase}
        />
        <select value={formNuevo.nodoId} onChange={(e) => setFormNuevo({ ...formNuevo, nodoId: e.target.value })} className={campoClase}>
          <option value="">Sin nodo de red asociado</option>
          {nodos?.map((n) => (
            <option key={n.id} value={n.id}>
              {n.nombre}
            </option>
          ))}
        </select>
        <div className="col-span-2 flex gap-2">
          <button
            type="button"
            onClick={() => probar(formNuevo, "nuevo")}
            disabled={probando === "nuevo" || !formNuevo.direccionIp.trim()}
            className="border border-stone-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium px-4 py-2 rounded-md hover:bg-stone-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            {probando === "nuevo" ? "Probando..." : "Probar conexión SNMP"}
          </button>
          <button type="submit" disabled={crear.isPending} className="bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-sm hover:bg-brand-800 disabled:opacity-50">
            {crear.isPending ? "Creando..." : "Agregar OLT"}
          </button>
        </div>
        </div>
      </form>
      )}

      <BarraBuscadorDocumentos
          filtros={filtros}
          etiquetaBusqueda="Buscar · nombre, IP, nodo o ubicación"
          placeholder="Ej: OLT Centro, 10.0.0.2..."
          etiquetaEstado="Modelo"
          opcionesEstado={[
            { valor: "MA5608T", etiqueta: "MA5608T" },
            { valor: "MA5800-X7", etiqueta: "MA5800-X7" },
          ]}
          mostrarPago={false}
          mostrarFechas={false}
        />
      {isLoading && <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">Cargando...</p>}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700 text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 [&_th]:font-medium">
            <tr>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2">Modelo</th>
              <th className="px-4 py-2">IP</th>
              <th className="px-4 py-2">Nodo</th>
              <th className="px-4 py-2">Última sincronización</th>
              <th className="px-4 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {oltsFiltradas?.map((o) => {
              const desde = o.ultimaConexionExitosa
                ? `hace ${formatearDuracion(Date.now() - new Date(o.ultimaConexionExitosa).getTime())}`
                : "nunca";
              return (
                <Fragment key={o.id}>
                  <tr className="border-b border-stone-100 dark:border-gray-700">
                    <td className="px-4 py-2 font-semibold text-gray-800 dark:text-gray-100"><Resaltar texto={o.nombre} termino={filtros.busquedaAplicada} /></td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{o.modelo}</td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-600 dark:text-gray-300"><Resaltar texto={o.direccionIp} termino={filtros.busquedaAplicada} /></td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-300"><Resaltar texto={o.nodo?.nombre ?? "—"} termino={filtros.busquedaAplicada} /></td>
                    <td className="px-4 py-2 text-gray-500 dark:text-gray-400 text-xs">{desde}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => sincronizar.mutate(o.id)}
                          disabled={sincronizar.isPending}
                          className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline disabled:opacity-50"
                        >
                          Sincronizar ahora
                        </button>
                        <button
                          onClick={() => setOltDetalleId(oltDetalleId === o.id ? null : o.id)}
                          className="text-xs font-medium text-gray-600 dark:text-gray-300 hover:underline"
                        >
                          {oltDetalleId === o.id ? "Ocultar ONUs" : "Ver ONUs"}
                        </button>
                        <button onClick={() => abrirEdicion(o)} className="text-xs font-medium text-gray-600 dark:text-gray-300 hover:underline">
                          Editar
                        </button>
                        <button onClick={() => confirmarDesactivar(o)} className="text-xs font-medium text-red-500 hover:underline">
                          Desactivar
                        </button>
                      </div>
                    </td>
                  </tr>
                  {oltEditandoId === o.id && (
                    <tr className="border-b border-stone-100 dark:border-gray-700 bg-stone-50 dark:bg-gray-900/40">
                      <td colSpan={6} className="px-4 py-3">
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            editar.mutate(o.id);
                          }}
                          className="grid grid-cols-2 gap-3 max-w-3xl"
                        >
                          <input
                            placeholder="Nombre"
                            required
                            value={editForm.nombre}
                            onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })}
                            className={`${campoClase} col-span-2`}
                          />
                          <select value={editForm.modelo} onChange={(e) => setEditForm({ ...editForm, modelo: e.target.value })} className={campoClase}>
                            {MODELOS.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                          <input
                            placeholder="IP de gestión"
                            required
                            value={editForm.direccionIp}
                            onChange={(e) => setEditForm({ ...editForm, direccionIp: e.target.value })}
                            className={campoClase}
                          />
                          <CamposSnmp form={editForm} set={setEditForm} />
                          <CamposSsh form={editForm} set={setEditForm} marcador={o.id} probandoSsh={probandoSsh} onProbar={probarSsh} />
                          <input
                            placeholder="Ubicación / sector"
                            value={editForm.ubicacion}
                            onChange={(e) => setEditForm({ ...editForm, ubicacion: e.target.value })}
                            className={campoClase}
                          />
                          <select value={editForm.nodoId} onChange={(e) => setEditForm({ ...editForm, nodoId: e.target.value })} className={campoClase}>
                            <option value="">Sin nodo de red asociado</option>
                            {nodos?.map((n) => (
                              <option key={n.id} value={n.id}>
                                {n.nombre}
                              </option>
                            ))}
                          </select>
                          <div className="col-span-2 flex gap-2">
                            <button
                              type="button"
                              onClick={() => probar(editForm, o.id)}
                              disabled={probando === o.id}
                              className="border border-stone-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium px-4 py-2 rounded-md hover:bg-stone-50 dark:hover:bg-gray-700 disabled:opacity-50"
                            >
                              {probando === o.id ? "Probando..." : "Probar conexión SNMP"}
                            </button>
                            <button type="submit" className="bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-md hover:bg-brand-800">
                              Guardar
                            </button>
                            <button type="button" onClick={() => setOltEditandoId(null)} className="text-sm text-gray-500 dark:text-gray-400 px-2">
                              Cancelar
                            </button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  )}
                  {oltDetalleId === o.id && (
                    <tr className="border-b border-stone-100 dark:border-gray-700 bg-stone-50 dark:bg-gray-900/40">
                      <td colSpan={6} className="px-4 py-3">
                        <DetalleOlt oltId={o.id} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {oltsFiltradas?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500">
                  {filtros.hayFiltros ? "Ninguna OLT coincide con la búsqueda." : "Todavía no hay ninguna OLT registrada"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Badge de estado de una ONU — ver OltOnu.estado (caché del último dato
// leído por SNMP, se pisa en cada "Sincronizar ahora").
function BadgeEstadoOnu({ estado }: { estado?: string | null }) {
  if (estado === "ONLINE") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Online
      </span>
    );
  }
  if (estado === "OFFLINE") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-500 dark:text-red-400">
        <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Offline
      </span>
    );
  }
  return <span className="text-xs text-gray-400 dark:text-gray-500">Sin sincronizar</span>;
}

// Panel expandido de una OLT: tabla de ONUs detectadas (con su cliente
// vinculado, si tiene) y el historial de eventos reciente. Incluye además
// una herramienta de calibración ("Explorar OID") para cuando
// listarOnusDeOlt no encuentra nada en un equipo que sí tiene ONUs — ver la
// advertencia al inicio de backend/src/utils/oltHuawei.ts.
function DetalleOlt({ oltId }: { oltId: number }) {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const [pestana, setPestana] = useState<"onus" | "eventos" | "avanzado" | "avanzado-ssh">("onus");
  const [onuAsignandoId, setOnuAsignandoId] = useState<number | null>(null);
  const [oidBase, setOidBase] = useState("1.3.6.1.4.1.2011.6.128.1.1.2");
  const [explorando, setExplorando] = useState(false);
  const [resultadoExploracion, setResultadoExploracion] = useState<ResultadoExplorarOid | null>(null);
  const [comandosSsh, setComandosSsh] = useState("display ont info 0/1/1\ndisplay ont optical-info 0/1/1 all");
  const [ejecutandoSsh, setEjecutandoSsh] = useState(false);
  const [salidaSsh, setSalidaSsh] = useState<string | null>(null);

  const { data: onus, isLoading: cargandoOnus } = useQuery({
    queryKey: ["olt-onus", oltId],
    queryFn: async () => (await api.get<OltOnu[]>(`/olts/${oltId}/onus`)).data,
  });

  const { data: eventos, isLoading: cargandoEventos } = useQuery({
    queryKey: ["olt-eventos", oltId],
    queryFn: async () => (await api.get<OltEvento[]>(`/olts/${oltId}/eventos`)).data,
    enabled: pestana === "eventos",
  });

  const asignarCliente = useMutation({
    mutationFn: async ({ onuId, clienteId }: { onuId: number; clienteId: number | null }) =>
      (await api.patch(`/olts/${oltId}/onus/${onuId}/asignar-cliente`, { clienteId })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["olt-onus", oltId] });
      setOnuAsignandoId(null);
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "No se pudo asignar el cliente a esta ONU"),
  });

  async function explorar() {
    if (!oidBase.trim()) return;
    setExplorando(true);
    setResultadoExploracion(null);
    try {
      const { data } = await api.post<ResultadoExplorarOid>(`/olts/${oltId}/explorar-oid`, { oidBase: oidBase.trim() });
      setResultadoExploracion(data);
    } catch (error: any) {
      mostrarToast(error.response?.data?.error ?? "No se pudo explorar ese OID en la OLT");
    } finally {
      setExplorando(false);
    }
  }

  async function ejecutarSsh() {
    const comandos = comandosSsh.split("\n").map((c) => c.trim()).filter(Boolean);
    if (comandos.length === 0) return;
    setEjecutandoSsh(true);
    setSalidaSsh(null);
    try {
      const { data } = await api.post<{ salida: string }>(`/olts/${oltId}/ssh/ejecutar`, { comandos });
      setSalidaSsh(data.salida);
    } catch (error: any) {
      mostrarToast(error.response?.data?.error ?? "No se pudo ejecutar el comando por SSH en la OLT");
    } finally {
      setEjecutandoSsh(false);
    }
  }

  const tabClase = (activa: boolean) =>
    `text-xs font-semibold px-3 py-1.5 rounded-md ${activa ? "bg-brand-700 text-white" : "text-gray-600 dark:text-gray-300 hover:bg-stone-100 dark:hover:bg-gray-700"}`;

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <button className={tabClase(pestana === "onus")} onClick={() => setPestana("onus")}>
          ONUs ({onus?.length ?? 0})
        </button>
        <button className={tabClase(pestana === "eventos")} onClick={() => setPestana("eventos")}>
          Eventos
        </button>
        <button className={tabClase(pestana === "avanzado")} onClick={() => setPestana("avanzado")}>
          Avanzado: Explorar OID
        </button>
        <button className={tabClase(pestana === "avanzado-ssh")} onClick={() => setPestana("avanzado-ssh")}>
          Avanzado: Ejecutar SSH
        </button>
      </div>

      {pestana === "onus" && (
        <div className="overflow-x-auto">
          {cargandoOnus && <p className="text-sm text-gray-500 dark:text-gray-400">Cargando...</p>}
          {!cargandoOnus && onus?.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500">
              Sin ONUs detectadas todavía — probá "Sincronizar ahora" en la fila de la OLT.
            </p>
          )}
          {onus && onus.length > 0 && (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-stone-300 dark:border-gray-700">
                  <th className="px-3 py-1.5">Slot/Puerto/ONU</th>
                  <th className="px-3 py-1.5">Serial</th>
                  <th className="px-3 py-1.5">Estado</th>
                  <th className="px-3 py-1.5">RX / TX (dBm)</th>
                  <th className="px-3 py-1.5">Cliente</th>
                  <th className="px-3 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {onus.map((onu) => (
                  <tr key={onu.id} className="border-b border-stone-100 dark:border-gray-700">
                    <td className="px-3 py-1.5 text-gray-600 dark:text-gray-300">
                      {onu.slot}/{onu.puerto}/{onu.onuIndex}
                    </td>
                    <td className="px-3 py-1.5 text-gray-600 dark:text-gray-300 font-mono text-xs">{onu.serial}</td>
                    <td className="px-3 py-1.5">
                      <BadgeEstadoOnu estado={onu.estado} />
                    </td>
                    <td className="px-3 py-1.5 text-gray-600 dark:text-gray-300 text-xs">
                      {onu.rxPowerDbm ?? "—"} / {onu.txPowerDbm ?? "—"}
                    </td>
                    <td className="px-3 py-1.5">
                      {onuAsignandoId === onu.id ? (
                        <div className="w-56">
                          <BuscadorCliente
                            clienteId={onu.clienteId ?? ""}
                            onSeleccionar={(id) => asignarCliente.mutate({ onuId: onu.id, clienteId: id === "" ? null : id })}
                          />
                        </div>
                      ) : onu.cliente ? (
                        <span className="text-gray-700 dark:text-gray-200">{onu.cliente.razonSocial}</span>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500">Sin asignar</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      {onuAsignandoId === onu.id ? (
                        <button onClick={() => setOnuAsignandoId(null)} className="text-xs text-gray-500 dark:text-gray-400 hover:underline">
                          Cancelar
                        </button>
                      ) : (
                        <div className="flex gap-2">
                          <button onClick={() => setOnuAsignandoId(onu.id)} className="text-xs text-brand-600 dark:text-brand-400 hover:underline">
                            {onu.cliente ? "Cambiar" : "Asignar"}
                          </button>
                          {onu.cliente && (
                            <button
                              onClick={() => asignarCliente.mutate({ onuId: onu.id, clienteId: null })}
                              className="text-xs text-red-500 hover:underline"
                            >
                              Quitar
                            </button>
                          )}
                        </div>
                      )}
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
            Recorre en crudo lo que la OLT responde bajo un OID — para calibrar contra el equipo real cuando "Sincronizar ahora" no encuentra
            ninguna ONU (ver la advertencia en backend/src/utils/oltHuawei.ts). No interpreta nada, solo muestra el dato tal cual llega.
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
                <p className="text-xs text-amber-600 dark:text-amber-400 px-2 py-1">
                  Se muestran las primeras 500 de {resultadoExploracion.total} filas.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {pestana === "avanzado-ssh" && (
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 max-w-2xl">
            Manda uno o varios comandos por SSH (uno por línea) tal como los usarías a mano en la consola de la OLT — para calibrar la Vista por
            puerto GPON del Mapa de Red contra el firmware real (ver la advertencia en backend/src/utils/oltHuaweiSsh.ts). No interpreta nada,
            muestra la salida cruda de la consola.
          </p>
          <div className="flex flex-col gap-2 mb-3 max-w-2xl">
            <textarea
              value={comandosSsh}
              onChange={(e) => setComandosSsh(e.target.value)}
              rows={3}
              className={`${campoClase} font-mono text-xs`}
              placeholder={"display ont info 0/1/1\ndisplay ont optical-info 0/1/1 all"}
            />
            <button
              onClick={ejecutarSsh}
              disabled={ejecutandoSsh}
              className="self-start border border-stone-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium px-4 py-2 rounded-md hover:bg-stone-50 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              {ejecutandoSsh ? "Ejecutando..." : "Ejecutar"}
            </button>
          </div>
          {salidaSsh !== null && (
            <pre className="max-h-96 overflow-auto border border-stone-300 dark:border-gray-700 rounded-md p-2 text-xs font-mono text-gray-800 dark:text-gray-100 whitespace-pre-wrap">
              {salidaSsh || "(sin salida)"}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
