import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useToast } from "../components/ToastProvider";
import { listarAccionesPendientes, quitarAccionPendiente, type AccionPendiente } from "../utils/colaOffline";

const RUTA_POR_TIPO: Record<AccionPendiente["tipo"], (visitaId: number) => string> = {
  llegada: (visitaId) => `/visitas/${visitaId}/llegada`,
  omitir: (visitaId) => `/visitas/${visitaId}/omitir`,
};

const INTERVALO_REINTENTO_MS = 20_000;

// Reintenta en segundo plano las acciones guardadas por falta de señal (ver
// utils/colaOffline.ts) — al montar, cada vez que vuelve la conexión
// (evento "online") y cada 20s mientras queden pendientes. Un componente
// (SeccionMiRuta) usa esto para mostrarle al técnico cuántas acciones
// todavía no se han mandado y darle un botón de "reintentar ahora".
export function useSincronizarAccionesPendientes() {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const [pendientes, setPendientes] = useState<AccionPendiente[]>(() => listarAccionesPendientes());

  const refrescarPendientes = useCallback(() => setPendientes(listarAccionesPendientes()), []);

  const sincronizar = useCallback(async () => {
    refrescarPendientes();
    if (!navigator.onLine) return;

    const acciones = listarAccionesPendientes();
    if (acciones.length === 0) return;

    let huboCambios = false;
    for (const accion of acciones) {
      try {
        await api.patch(RUTA_POR_TIPO[accion.tipo](accion.visitaId), accion.payload);
        quitarAccionPendiente(accion.id);
        huboCambios = true;
      } catch (error: any) {
        if (error.response) {
          // El servidor respondió (ej. 403/404: la visita ya no es tuya, o
          // se eliminó) — reintentar no lo va a arreglar solo, así que se
          // descarta y se avisa en vez de quedarse reintentando para siempre.
          quitarAccionPendiente(accion.id);
          huboCambios = true;
          mostrarToast(`No se pudo sincronizar una acción pendiente: ${error.response.data?.error ?? "error del servidor"}`);
        }
        // Sin error.response es falla de red — se queda en la cola para el próximo intento.
      }
    }
    refrescarPendientes();
    if (huboCambios) queryClient.invalidateQueries({ queryKey: ["mi-ruta-hoy"] });
  }, [queryClient, mostrarToast, refrescarPendientes]);

  useEffect(() => {
    sincronizar();
    const id = setInterval(sincronizar, INTERVALO_REINTENTO_MS);
    window.addEventListener("online", sincronizar);
    return () => {
      clearInterval(id);
      window.removeEventListener("online", sincronizar);
    };
  }, [sincronizar]);

  return { pendientes, sincronizarAhora: sincronizar, refrescarPendientes };
}
