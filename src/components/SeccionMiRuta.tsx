import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type RutaVisita } from "../api/client";
import { useToast } from "./ToastProvider";
import { useSincronizarAccionesPendientes } from "../hooks/useSincronizarAccionesPendientes";
import { agregarAccionPendiente } from "../utils/colaOffline";
import { MapaRuta, type ParadaMapa } from "./MapaRuta";
import { DetalleTrabajoVisita } from "./DetalleTrabajoVisita";
import { ContratoServicioVisita } from "./ContratoServicioVisita";

export const ETIQUETA_ESTADO: Record<string, string> = {
  PENDIENTE: "Pendiente",
  COMPLETADA: "Completada",
  OMITIDA: "Omitida",
};

const CLASE_ESTADO: Record<string, string> = {
  PENDIENTE: "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300",
  COMPLETADA: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
  OMITIDA: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300",
};

// A diferencia de obtenerUbicacion() en FormularioMarcacion.tsx (donde no
// tener GPS no bloquea marcar asistencia), acá la ubicación real de llegada
// SÍ es obligatoria — es el dato que justifica todo el módulo (confirmar que
// la visita ocurrió en el punto correcto). Si no se puede obtener, se avisa
// y no se manda el PATCH.
function obtenerUbicacionObligatoria(): Promise<{ latitud: number; longitud: number } | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) {
      resolve(null);
      return;
    }
    let resuelto = false;
    const terminar = (valor: { latitud: number; longitud: number } | null) => {
      if (resuelto) return;
      resuelto = true;
      resolve(valor);
    };
    const timeoutId = setTimeout(() => terminar(null), 10000);
    navigator.geolocation.getCurrentPosition(
      (posicion) => {
        clearTimeout(timeoutId);
        terminar({ latitud: posicion.coords.latitude, longitud: posicion.coords.longitude });
      },
      () => {
        clearTimeout(timeoutId);
        terminar(null);
      },
      { enableHighAccuracy: true, timeout: 9000 }
    );
  });
}

// "Mi ruta de hoy" — cualquier Usuario con empleadoId vinculado (ver select
// en UsuariosPage.tsx) ve acá SOLO sus propias paradas del día, sin
// necesitar el permiso "visitas" (ver backend/src/routes/visitas.ts).
// Se usa tanto en la pestaña Visitas Técnicas del shell de escritorio como
// en el shell móvil del técnico (ver AppMovil.tsx). `compacto` solo ajusta
// el "chrome" y la altura del mapa para pantallas de celular — la lógica de
// GPS / cola offline es idéntica en ambos casos.
export function SeccionMiRuta({ compacto = false }: { compacto?: boolean } = {}) {
  const { mostrarToast } = useToast();
  const queryClient = useQueryClient();
  const [observaciones, setObservaciones] = useState<Record<number, string>>({});
  const { pendientes, sincronizarAhora, refrescarPendientes } = useSincronizarAccionesPendientes();

  const { data: ruta, isLoading } = useQuery({
    queryKey: ["mi-ruta-hoy"],
    queryFn: async () => (await api.get<RutaVisita | null>("/visitas/mi-ruta-hoy")).data,
    // Se refresca sola: una visita urgente agendada desde la oficina (por
    // ejemplo desde un ticket de soporte) aparece sin que el técnico tenga
    // que recargar la pantalla.
    refetchInterval: 60_000,
  });

  // Aviso cuando aparece una parada nueva en la ruta ya cargada (no en la
  // primera carga): toast + vibración del celular si la admite.
  const idsConocidos = useRef<Set<number> | null>(null);
  useEffect(() => {
    if (!ruta) return;
    const actuales = new Set(ruta.visitas.map((v) => v.id));
    if (idsConocidos.current) {
      const nuevas = ruta.visitas.filter((v) => !idsConocidos.current!.has(v.id));
      if (nuevas.length > 0) {
        const urgente = nuevas.find((v) => v.esUrgente);
        mostrarToast(
          urgente
            ? `Nueva visita URGENTE: ${urgente.cliente?.razonSocial ?? urgente.nombreContacto}`
            : `Se agregó ${nuevas.length} visita(s) a tu ruta de hoy`,
          "info"
        );
        try {
          navigator.vibrate?.(urgente ? [300, 150, 300] : 200);
        } catch {
          // algunos navegadores no permiten vibrar — el aviso en pantalla alcanza
        }
      }
    }
    idsConocidos.current = actuales;
  }, [ruta, mostrarToast]);

  const marcarLlegada = useMutation({
    mutationFn: async (visitaId: number) => {
      const ubicacion = await obtenerUbicacionObligatoria();
      if (!ubicacion) {
        throw new Error("No se pudo obtener tu ubicación. Activa el GPS y el permiso de ubicación del navegador e intenta de nuevo.");
      }
      try {
        return { ...(await api.patch<{ ubicacionClienteActualizada: boolean }>(`/visitas/${visitaId}/llegada`, ubicacion)).data, encolada: false as const };
      } catch (error: any) {
        // Sin error.response = no llegó al servidor (sin señal) — se guarda
        // para reintentar solo, en vez de perder el "Llegué" del técnico.
        if (!error.response) {
          agregarAccionPendiente("llegada", visitaId, ubicacion);
          refrescarPendientes();
          return { ubicacionClienteActualizada: false, encolada: true as const };
        }
        throw error;
      }
    },
    onSuccess: (resultado) => {
      if (resultado.encolada) {
        mostrarToast("Sin señal — la llegada se guardó en este dispositivo y se enviará sola cuando vuelva la conexión", "success");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["mi-ruta-hoy"] });
      if (resultado.ubicacionClienteActualizada) {
        queryClient.invalidateQueries({ queryKey: ["clientes"] }); // la ficha del cliente ya tiene la ubicación nueva
      }
      mostrarToast(
        resultado.ubicacionClienteActualizada
          ? "Llegada registrada — se actualizó la ubicación guardada del cliente"
          : "Llegada registrada",
        "success"
      );
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? error.message ?? "Error al registrar la llegada"),
  });

  const omitirVisita = useMutation({
    mutationFn: async (visitaId: number) => {
      const payload = { observaciones: observaciones[visitaId]?.trim() || undefined };
      try {
        await api.patch(`/visitas/${visitaId}/omitir`, payload);
        return { encolada: false };
      } catch (error: any) {
        if (!error.response) {
          agregarAccionPendiente("omitir", visitaId, payload);
          refrescarPendientes();
          return { encolada: true };
        }
        throw error;
      }
    },
    onSuccess: (resultado) => {
      if (resultado.encolada) {
        mostrarToast("Sin señal — se guardó en este dispositivo y se enviará sola cuando vuelva la conexión", "success");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["mi-ruta-hoy"] });
      mostrarToast("Visita omitida", "success");
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al omitir la visita"),
  });

  return (
    <div
      className={
        compacto
          ? "bg-white dark:bg-gray-800 rounded-sm border border-stone-300 dark:border-gray-700 p-3"
          : "bg-white dark:bg-gray-800 rounded-sm border border-stone-300 dark:border-gray-700 p-4 mb-4"
      }
    >
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-mono text-[11px] uppercase tracking-[0.15em] text-gray-600 dark:text-gray-300">Mi ruta de hoy</h3>
        {pendientes.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
              🕓 {pendientes.length} acción(es) pendiente(s) de sincronizar
            </span>
            <button
              onClick={() => sincronizarAhora()}
              className="text-xs font-medium text-brand-700 dark:text-brand-300 hover:underline"
            >
              Reintentar ahora
            </button>
          </div>
        )}
      </div>

      {isLoading && <p className="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>}
      {!isLoading && !ruta && (
        <p className="text-sm text-gray-400 dark:text-gray-500">No tienes una ruta planificada para hoy.</p>
      )}

      {ruta && (
        <>
          <MapaRuta
            alturaPx={compacto ? 340 : 520}
            paradas={ruta.visitas.map(
              (v): ParadaMapa => ({
                id: v.id,
                lat: Number(v.latitud),
                lng: Number(v.longitud),
                orden: v.orden,
                estado: v.estado,
                etiqueta: v.nombreContacto,
              })
            )}
          />
          <ul className="divide-y divide-gray-100 dark:divide-gray-700 mt-3">
            {ruta.visitas.map((v) => {
              const pendienteLocal = pendientes.some((p) => p.visitaId === v.id);
              return (
              <li key={v.id} className={`py-3 ${v.esUrgente ? "bg-red-50 dark:bg-red-900/10 -mx-4 px-4" : ""}`}>
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                      {v.esUrgente && <span className="text-red-600 dark:text-red-400 mr-1">🚨 Urgente —</span>}
                      {v.orden}. {v.nombreContacto}
                    </p>
                    {v.direccion && <p className="text-xs text-gray-500 dark:text-gray-400">{v.direccion}</p>}
                    {v.motivoVisita && (
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mt-0.5">📋 {v.motivoVisita}</p>
                    )}
                    {v.estado === "COMPLETADA" && v.distanciaAlPunto && (
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        Llegada a {Number(v.distanciaAlPunto).toFixed(0)} m del punto planeado
                      </p>
                    )}
                    {v.estado === "OMITIDA" && v.observaciones && (
                      <p className="text-xs text-gray-400 dark:text-gray-500">Motivo: {v.observaciones}</p>
                    )}
                    {pendienteLocal && (
                      <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mt-0.5">🕓 Pendiente de sincronizar</p>
                    )}
                  </div>
                  <span className={`px-2 py-0.5 rounded-sm font-mono text-[10px] uppercase tracking-wider font-semibold shrink-0 ${CLASE_ESTADO[v.estado]}`}>
                    {ETIQUETA_ESTADO[v.estado]}
                  </span>
                </div>
                {v.estado === "PENDIENTE" && !pendienteLocal && (
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <button
                      onClick={() => marcarLlegada.mutate(v.id)}
                      disabled={marcarLlegada.isPending}
                      className="bg-brand-700 text-white px-3 py-1.5 rounded-md text-xs font-semibold hover:bg-brand-800 disabled:opacity-50"
                    >
                      {marcarLlegada.isPending ? "Ubicando..." : "Llegué"}
                    </button>
                    <input
                      type="text"
                      placeholder="Motivo si la omites (opcional)"
                      value={observaciones[v.id] ?? ""}
                      onChange={(e) => setObservaciones({ ...observaciones, [v.id]: e.target.value })}
                      className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-xs flex-1 min-w-[160px]"
                    />
                    <button
                      onClick={() => omitirVisita.mutate(v.id)}
                      disabled={omitirVisita.isPending}
                      className="bg-stone-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-1.5 rounded-md text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
                    >
                      Omitir
                    </button>
                  </div>
                )}
                {v.estado === "COMPLETADA" && <DetalleTrabajoVisita visita={v} />}
                {v.estado === "COMPLETADA" && <ContratoServicioVisita visita={v} />}
              </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
