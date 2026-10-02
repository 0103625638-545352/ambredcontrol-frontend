import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type EstadoMikrotik, type EntradaAddressList, type VecinoRed, type NodoRed } from "../api/client";
import { useConfirm } from "../components/ConfirmProvider";
import { useToast } from "../components/ToastProvider";
import { useFiltrosListado, BarraBuscadorDocumentos, filtrarLocal, sinPaginacion } from "../components/BuscadorDocumentos";
import { Resaltar } from "../components/FormatoDocumento";

// RouterOS normaliza cualquier valor de ancho de banda a bits/segundo al
// devolverlo (aunque se haya creado como "5M") — esto lo vuelve legible.
// Se usa en PlanesInternetPage.tsx, no acá — este archivo ya no maneja
// Queues (ver comentario más abajo), pero la función se queda acá porque
// no hay todavía un archivo de utilidades de Mikrotik compartidas.
export function formatearVelocidadMikrotik(valorCrudo: string): string {
  const bits = Number(valorCrudo);
  if (!bits || Number.isNaN(bits)) return "—";
  if (bits >= 1_000_000) return `${(bits / 1_000_000).toFixed(bits % 1_000_000 === 0 ? 0 : 1)} Mbps`;
  if (bits >= 1_000) return `${(bits / 1_000).toFixed(0)} Kbps`;
  return `${bits} bps`;
}

function mensajeError(error: any, fallback: string): string {
  return error.response?.data?.error ?? fallback;
}

// Control de Red (Mikrotik): visor genérico de address-lists por nodo, para
// diagnóstico manual — ver qué IPs están cargadas en cuál lista, y limpiar
// una entrada suelta/huérfana. NO hay herramientas de PPPoE ni de Simple
// Queue acá a propósito: la red real de la empresa es IP fija por
// address-list (no PPPoE), y la velocidad se aprovisiona en la OLT, no en
// el Mikrotik — ver utils/mikrotik.ts en el backend. El alta/baja/cambio de
// plan de un cliente normal se hace desde Clientes, no desde acá.
export function MikrotikPage() {
  const { data: nodos, isLoading: cargandoNodos } = useQuery({
    queryKey: ["nodos-red"],
    queryFn: async () => (await api.get<NodoRed[]>("/nodos-red")).data,
  });
  const [nodoId, setNodoId] = useState<number | null>(null);

  useEffect(() => {
    if (nodoId === null && nodos && nodos.length > 0) setNodoId(nodos[0].id);
  }, [nodos, nodoId]);

  const { data: estado, isError: estadoError, error: estadoErrorObj } = useQuery({
    queryKey: ["mikrotik-estado", nodoId],
    queryFn: async () => (await api.get<EstadoMikrotik>(`/mikrotik/${nodoId}/estado`)).data,
    enabled: nodoId !== null,
    retry: false,
    refetchInterval: 30_000,
  });

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 dark:text-gray-50 mb-1">Control de Red (Mikrotik)</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Equipos detectados en la red de cada nodo y visor de sus address-lists, para diagnóstico manual — el alta/baja de
        clientes se hace desde Clientes.
      </p>

      {cargandoNodos ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">Cargando nodos...</p>
      ) : !nodos || nodos.length === 0 ? (
        <p className="text-xs text-amber-600 dark:text-amber-400 mb-4">
          Todavía no hay ningún nodo de red creado — anda a "Nodos de Red" para crear el primero.
        </p>
      ) : (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <select
            value={nodoId ?? ""}
            onChange={(e) => setNodoId(Number(e.target.value))}
            className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm font-medium"
          >
            {nodos.map((n) => (
              <option key={n.id} value={n.id}>
                {n.nombre}
              </option>
            ))}
          </select>

          {estado && (
            <div className="inline-flex items-center gap-2 text-xs bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 px-3 py-1.5 rounded-md">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
              Conectado a {estado.identidad} (RouterOS {estado.version})
            </div>
          )}
          {estadoError && (
            <div className="text-xs bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 px-3 py-1.5 rounded-md">
              {mensajeError({ response: (estadoErrorObj as any)?.response }, "No se pudo conectar con el Mikrotik de este nodo.")}
            </div>
          )}
        </div>
      )}

      {nodoId !== null && (
        <div className="space-y-6">
          <SeccionVecinos nodoId={nodoId} />
          <SeccionAddressLists nodoId={nodoId} />
        </div>
      )}
    </div>
  );
}

// "Neighbors" al estilo WinBox: equipos que el router de este nodo
// descubrió en su propia red (identidad, IP, MAC, versión, placa) — de
// solo lectura, no permite entrar a configurar esos equipos. Cada nodo
// tiene su propia red física, así que la lista es siempre por nodo, nunca
// global.
function SeccionVecinos({ nodoId }: { nodoId: number }) {
  const { data: vecinos, isLoading, isError, error } = useQuery({
    queryKey: ["mikrotik-vecinos", nodoId],
    queryFn: async () => (await api.get<VecinoRed[]>(`/mikrotik/${nodoId}/vecinos`)).data,
    retry: false,
    refetchInterval: 30_000,
  });
  // Buscador del listado (en el navegador: la lista ya viene completa).
  const filtros = useFiltrosListado(sinPaginacion);
  const vecinosFiltrados = filtrarLocal(vecinos, filtros, {
    textos: (v) => [v.identidad, v.direccionIp, v.direccionMac, v.placa, v.version, v.interfaz],
  });

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-mono text-[11px] uppercase tracking-[0.15em] text-gray-600 dark:text-gray-300">Equipos en la red de este nodo</h3>
        {vecinos && (
          <span className="text-xs bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-400 px-2 py-1 rounded-md font-medium">
            {vecinos.length} equipo{vecinos.length === 1 ? "" : "s"} encontrado{vecinos.length === 1 ? "" : "s"}
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Lo que el router de este nodo descubrió en su propia red (como "Neighbors" en WinBox) — de solo lectura, acá no se
        puede entrar a configurar ninguno de estos equipos.
      </p>

      <div className="bg-white dark:bg-gray-800 rounded-sm border border-stone-300 dark:border-gray-700 overflow-hidden">
        <BarraBuscadorDocumentos
          filtros={filtros}
          etiquetaBusqueda="Buscar · identidad, IP, MAC, placa, versión o interfaz"
          placeholder="Ej: hAP, 192.168.88.2, ether2..."
          mostrarPago={false}
          mostrarFechas={false}
        />
        <table className="w-full text-sm">
          <thead className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700 text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 [&_th]:font-medium">
            <tr>
              <th className="px-4 py-2">Identidad</th>
              <th className="px-4 py-2">IP</th>
              <th className="px-4 py-2">MAC</th>
              <th className="px-4 py-2">Placa</th>
              <th className="px-4 py-2">RouterOS</th>
              <th className="px-4 py-2">Interfaz</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">Buscando equipos...</td>
              </tr>
            )}
            {isError && (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-center text-red-600 dark:text-red-400">
                  {mensajeError(error, "No se pudo consultar el Mikrotik de este nodo")}
                </td>
              </tr>
            )}
            {!isLoading && !isError && vecinosFiltrados?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">
                  {filtros.hayFiltros ? "Ningún equipo coincide con la búsqueda." : "El router de este nodo no encontró ningún equipo en su red todavía"}
                </td>
              </tr>
            )}
            {vecinosFiltrados?.map((v, i) => (
              <tr key={`${v.direccionMac}-${i}`} className="border-t border-stone-100 dark:border-gray-700">
                <td className="px-4 py-2 font-medium text-gray-800 dark:text-gray-100"><Resaltar texto={v.identidad} termino={filtros.busquedaAplicada} /></td>
                <td className="px-4 py-2 font-mono text-xs"><Resaltar texto={v.direccionIp || "—"} termino={filtros.busquedaAplicada} /></td>
                <td className="px-4 py-2 font-mono text-xs text-gray-500 dark:text-gray-400">{v.direccionMac || "—"}</td>
                <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{v.placa || "—"}</td>
                <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{v.version || "—"}</td>
                <td className="px-4 py-2 text-gray-500 dark:text-gray-400">{v.interfaz || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SeccionAddressLists({ nodoId }: { nodoId: number }) {
  const queryClient = useQueryClient();
  const confirmar = useConfirm();
  const { mostrarToast } = useToast();

  const { data: entradas, isLoading } = useQuery({
    queryKey: ["mikrotik-address-lists", nodoId],
    queryFn: async () => (await api.get<EntradaAddressList[]>(`/mikrotik/${nodoId}/address-lists`)).data,
  });

  const eliminar = useMutation({
    mutationFn: async (id: string) => api.delete(`/mikrotik/${nodoId}/address-lists/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mikrotik-address-lists", nodoId] });
      queryClient.invalidateQueries({ queryKey: ["mikrotik-ips-suspendidas", nodoId] });
    },
    onError: (error: any) => mostrarToast(mensajeError(error, "Error al eliminar la entrada")),
  });

  async function confirmarEliminar(e: EntradaAddressList) {
    const ok = await confirmar(
      `¿Eliminar la entrada "${e.direccionIp}" de la lista "${e.lista}"?\nSi es de un cliente activo, esto le corta o le cambia el servicio — úsalo solo para limpiar entradas sueltas.`
    );
    if (ok) eliminar.mutate(e.id);
  }

  // Buscador compartido de los listados (en el navegador: la lista ya viene completa).
  const filtros = useFiltrosListado(sinPaginacion);
  const entradasFiltradas = filtrarLocal(entradas, filtros, {
    textos: (e) => [e.lista, e.direccionIp, e.comentario],
  });

  return (
    <div className="max-w-3xl">

      <div className="bg-white dark:bg-gray-800 rounded-sm border border-stone-300 dark:border-gray-700 overflow-hidden">
        <BarraBuscadorDocumentos
          filtros={filtros}
          etiquetaBusqueda="Buscar · lista, IP o comentario"
          placeholder="Ej: clientes-activos, 10.10.1.25..."
          mostrarPago={false}
          mostrarFechas={false}
        />
        <table className="w-full text-sm">
          <thead className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700 text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 [&_th]:font-medium">
            <tr>
              <th className="px-4 py-2">Lista</th>
              <th className="px-4 py-2">IP</th>
              <th className="px-4 py-2">Comentario</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={4} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">Cargando...</td>
              </tr>
            )}
            {!isLoading && entradasFiltradas?.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">
                  {filtros.hayFiltros ? "Ninguna entrada coincide con la búsqueda." : "Este nodo no tiene ninguna address-list cargada todavía"}
                </td>
              </tr>
            )}
            {entradasFiltradas?.map((e) => (
              <tr key={e.id} className="border-t border-stone-100 dark:border-gray-700">
                <td className="px-4 py-2">
                  <span
                    className={`font-mono text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-sm ${
                      e.lista === "Suspendido"
                        ? "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300"
                        : "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300"
                    }`}
                  >
                    {e.lista}
                  </span>
                </td>
                <td className="px-4 py-2 font-mono text-xs font-semibold text-gray-800 dark:text-gray-100"><Resaltar texto={e.direccionIp} termino={filtros.busquedaAplicada} /></td>
                <td className="px-4 py-2 text-gray-500 dark:text-gray-400"><Resaltar texto={e.comentario || "—"} termino={filtros.busquedaAplicada} /></td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => confirmarEliminar(e)}
                    className="text-red-600 dark:text-red-400 hover:underline text-xs font-medium"
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
