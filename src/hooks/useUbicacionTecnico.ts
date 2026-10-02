import { useEffect, useRef } from "react";
import { Capacitor, CapacitorHttp, registerPlugin } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import type { BackgroundGeolocationPlugin } from "@capacitor-community/background-geolocation";
import { api, URL_BASE_API } from "../api/client";
import { listarPendientes, agregarPendiente, quitarEnviados, type PuntoUbicacionPendiente } from "../utils/colaUbicaciones";
import { registrarSincronizacionPeriodica } from "../utils/serviceWorkerTecnico";

// Solo existe dentro del APK Android (Capacitor, ver capacitor.config.ts y
// ANDROID.md) — en el navegador/PWA nunca se llama.
const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");

// Cada cuánto se captura y se intenta mandar una lectura de posición —
// balance entre tener el mapa admin razonablemente al día y no gastar
// batería/datos de más en el celular del técnico. Ver comentario del
// permiso "ubicacion_tecnicos" en utils/permisos.ts.
const INTERVALO_MS = 2 * 60 * 1000;
const TIMEOUT_CAPTURA_MS = 8000;
const MAXIMO_PUNTOS_POR_ENVIO = 500;

// Mismo criterio que obtenerUbicacion() en FormularioMarcacion.tsx: NUNCA
// rechaza — si el navegador no tiene geolocalización, el técnico no dio
// permiso, o tarda demasiado, resuelve null y seguimos sin esa lectura
// puntual (no tiene sentido que un fallo de GPS rompa nada más de la app).
function capturarPosicion(): Promise<PuntoUbicacionPendiente | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) {
      resolve(null);
      return;
    }
    let resuelto = false;
    const terminar = (valor: PuntoUbicacionPendiente | null) => {
      if (resuelto) return;
      resuelto = true;
      resolve(valor);
    };
    const timeoutId = setTimeout(() => terminar(null), TIMEOUT_CAPTURA_MS);
    navigator.geolocation.getCurrentPosition(
      (posicion) => {
        clearTimeout(timeoutId);
        terminar({
          latitud: posicion.coords.latitude,
          longitud: posicion.coords.longitude,
          precisionMetros: posicion.coords.accuracy ?? undefined,
          fecha: new Date().toISOString(),
        });
      },
      () => {
        clearTimeout(timeoutId);
        terminar(null);
      },
      { enableHighAccuracy: true, timeout: TIMEOUT_CAPTURA_MS }
    );
  });
}

// Reporta la posición del celular del técnico cada ~2 min mientras tiene la
// app móvil abierta (en cualquier pestaña — se monta una sola vez a nivel
// del shell, ver AppMovil.tsx, no dentro de una pantalla puntual). Sin señal
// para mandarla, la lectura queda en una cola local (ver
// utils/colaUbicaciones.ts) y se sube en lote apenas vuelve la conexión —
// mismo espíritu que useSincronizarAccionesPendientes.ts, pero para lecturas
// append-only en vez de acciones idempotentes.
//
// LÍMITE IMPORTANTE (no es un bug, es la plataforma): esto es un sitio web
// normal, no una app nativa. El intervalo de abajo SOLO corre mientras el
// navegador mantiene esta pestaña viva — si el técnico cierra la app o el
// sistema operativo la mata en segundo plano (algo que Android hace de
// entrada para ahorrar batería, más agresivo todavía en algunos fabricantes
// como Xiaomi/Huawei), el rastreo se corta ahí, sin ningún aviso. Tres
// mitigaciones, cada una con su alcance real:
//   1. manifest.json (ver index.html) hace la app instalable como ícono de
//      pantalla de inicio — Android trata bastante mejor (mata menos) un
//      PWA instalado en modo standalone que una pestaña de Chrome suelta.
//      Recomendado además eximir la app de la optimización de batería en
//      cada celular (Ajustes → Batería → esta app → Sin restricciones).
//   2. "alPasarASegundoPlano" de acá abajo manda una lectura YA en el
//      instante en que el técnico cambia de app, en vez de esperar al
//      próximo tick del intervalo (que quizás nunca llega si lo matan antes).
//   3. registrarSincronizacionPeriodica() (ver serviceWorkerTecnico.ts) deja
//      pedido un intento de reenvío en segundo plano vía Service Worker —
//      pero OJO, un Service Worker no tiene acceso a geolocalización: eso
//      solo reintenta mandar puntos que YA se habían capturado y guardado
//      antes de que la app se cerrara, nunca capta una posición nueva.
// Ninguna de las tres cubre un cierre explícito (swipe desde recientes) con
// el celular ya sin ninguna lectura pendiente en cola — para eso hace falta
// una app nativa con un servicio de ubicación en primer plano.
//
// DENTRO DEL APK (Capacitor.isNativePlatform()) el rastreo va por otro
// camino, el que sí resuelve eso: el plugin nativo
// @capacitor-community/background-geolocation levanta un servicio de
// ubicación en primer plano (la notificación fija "Compartiendo ubicación"),
// que Android no mata aunque el técnico cambie de app o apague la pantalla.
// Dos diferencias más respecto del camino web:
//   - El plugin entrega lecturas cada ~1 s; se guarda solo una cada
//     INTERVALO_MS, igual que en la web (el resto se descarta).
//   - El envío al backend va por CapacitorHttp (HTTP nativo), no por axios:
//     tras ~5 min en segundo plano Android frena las peticiones que salen
//     del WebView, las nativas no (ver README del plugin, issue #14).
// Límite que queda: si el técnico DESLIZA la app fuera de recientes, Android
// destruye el WebView y el rastreo se corta igual — para eso está la
// notificación fija, para que se note que tiene que seguir abierta.
//
// "activo" controla si corre — solo tiene sentido para un Usuario con
// Empleado vinculado (POST /ubicaciones-tecnicos exige uno, ver
// routes/ubicacionesTecnicos.ts); pasarlo en false no limpia la cola ya
// guardada, solo deja de capturar/mandar lecturas nuevas.
export function useUbicacionTecnico(activo: boolean) {
  const enviandoRef = useRef(false);

  useEffect(() => {
    if (!activo) return;
    let cancelado = false;
    const esApk = Capacitor.isNativePlatform();

    async function sincronizar() {
      if (enviandoRef.current || !navigator.onLine) return;
      // Tope por lote por debajo de MAXIMO_PUNTOS_POR_LOTE (1000) del backend:
      // pasarse daría 400 y el lote entero se descartaría como "rechazado".
      // El resto se manda en el próximo intento (cada INTERVALO_MS).
      const pendientes = (await listarPendientes()).slice(0, MAXIMO_PUNTOS_POR_ENVIO);
      if (pendientes.length === 0) return;

      enviandoRef.current = true;
      try {
        const ubicaciones = pendientes.map(({ latitud, longitud, precisionMetros, fecha }) => ({ latitud, longitud, precisionMetros, fecha }));
        const resultado = esApk ? await enviarLoteNativo(ubicaciones) : await enviarLoteWeb(ubicaciones);
        // "rechazado": el servidor respondió con error (ej. 400: el usuario
        // ya no tiene empleado vinculado) — reintentar no lo va a arreglar
        // solo, se descarta para no acumular para siempre. "sin-red": se
        // queda en la cola para el próximo intento.
        if (resultado !== "sin-red") await quitarEnviados(pendientes.map((p) => p.id));
      } finally {
        enviandoRef.current = false;
      }
    }

    async function capturarYSincronizar() {
      const punto = await capturarPosicion();
      if (cancelado) return;
      if (punto) await agregarPendiente(punto);
      await sincronizar();
    }

    if (esApk) {
      const detenerRastreoNativo = iniciarRastreoNativo(async (punto) => {
        if (cancelado) return;
        await agregarPendiente(punto);
        await sincronizar();
      });
      // Sin lectura nueva (ej. sin señal GPS) igual se reintenta mandar la cola.
      const intervalId = setInterval(sincronizar, INTERVALO_MS);
      window.addEventListener("online", sincronizar);
      return () => {
        cancelado = true;
        detenerRastreoNativo();
        clearInterval(intervalId);
        window.removeEventListener("online", sincronizar);
      };
    }

    // Ver el punto 2 del comentario grande de arriba: cierra el hueco justo
    // en el momento en que el técnico cambia de app, en vez de esperar al
    // próximo tick del intervalo. No hace falta "esperar" a esta llamada —
    // si el proceso muere a mitad de camino, el punto ya quedó guardado en
    // IndexedDB (ver agregarPendiente) para el próximo intento.
    function alPasarASegundoPlano() {
      if (document.visibilityState === "hidden") {
        capturarYSincronizar();
      }
    }

    capturarYSincronizar();
    registrarSincronizacionPeriodica(); // ver punto 3 del comentario de arriba
    const intervalId = setInterval(capturarYSincronizar, INTERVALO_MS);
    window.addEventListener("online", sincronizar);
    document.addEventListener("visibilitychange", alPasarASegundoPlano);

    return () => {
      cancelado = true;
      clearInterval(intervalId);
      window.removeEventListener("online", sincronizar);
      document.removeEventListener("visibilitychange", alPasarASegundoPlano);
    };
  }, [activo]);
}

type ResultadoEnvio = "ok" | "rechazado" | "sin-red";

async function enviarLoteWeb(ubicaciones: PuntoUbicacionPendiente[]): Promise<ResultadoEnvio> {
  try {
    await api.post("/ubicaciones-tecnicos", { ubicaciones });
    return "ok";
  } catch (error: any) {
    return error.response ? "rechazado" : "sin-red";
  }
}

// Mismo POST que enviarLoteWeb, pero por HTTP nativo (ver comentario grande
// de arriba) — por eso arma a mano el token que en la web agrega el
// interceptor de api/client.ts. CapacitorHttp no lanza con un 4xx/5xx
// (devuelve el status), solo con una falla de red. Un 401 cuenta como
// "rechazado": la próxima llamada normal por axios ya dispara el cierre de
// sesión del interceptor.
async function enviarLoteNativo(ubicaciones: PuntoUbicacionPendiente[]): Promise<ResultadoEnvio> {
  try {
    const respuesta = await CapacitorHttp.post({
      url: `${URL_BASE_API}/ubicaciones-tecnicos`,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token") ?? ""}`,
      },
      data: { ubicaciones },
      // Sin esto HttpURLConnection espera indefinidamente — ej. con datos
      // móviles apuntando a una IP LAN inalcanzable, el envío quedaba
      // colgado minutos antes de caer en "sin-red".
      connectTimeout: 15000,
      readTimeout: 30000,
    });
    return respuesta.status >= 200 && respuesta.status < 300 ? "ok" : "rechazado";
  } catch {
    return "sin-red";
  }
}

// Arranca el servicio de ubicación en primer plano del APK y llama a
// "alCapturar" como máximo una vez cada INTERVALO_MS. Devuelve la función que
// lo detiene (y quita la notificación fija) — la llama el cleanup del hook,
// ej. al cerrar sesión. Mismo criterio "NUNCA rechaza" del resto del módulo:
// si algo falla, el técnico sigue usando la app, solo que sin rastreo.
function iniciarRastreoNativo(alCapturar: (punto: PuntoUbicacionPendiente) => void): () => void {
  let detenido = false;
  let ultimaCaptura = 0;
  let avisoPermisoMostrado = false;

  const idWatcher = (async () => {
    // Android 13+: sin este permiso la notificación fija no se ve (el
    // servicio corre igual, pero el técnico no se entera de que está activo).
    try {
      const { display } = await LocalNotifications.checkPermissions();
      if (display === "prompt" || display === "prompt-with-rationale") await LocalNotifications.requestPermissions();
    } catch {
      // Sin permiso de notificaciones: se sigue, solo sin la notificación visible.
    }
    if (detenido) return undefined;

    return BackgroundGeolocation.addWatcher(
      {
        backgroundTitle: "Compartiendo ubicación",
        backgroundMessage: "AmbrossISP registra tu recorrido mientras trabajas en campo.",
        requestPermissions: true,
        stale: false,
        // Sin filtro de distancia a propósito: con filtro, un técnico quieto
        // (ej. una instalación larga) dejaría de reportar y el mapa admin lo
        // marcaría desconectado. El GPS corre igual con o sin filtro.
        distanceFilter: 0,
      },
      (ubicacion, error) => {
        if (error) {
          if (error.code === "NOT_AUTHORIZED" && !avisoPermisoMostrado) {
            avisoPermisoMostrado = true;
            if (window.confirm("La app necesita permiso de ubicación para registrar tu recorrido. ¿Abrir los ajustes ahora?")) {
              BackgroundGeolocation.openSettings();
            }
          }
          return;
        }
        if (!ubicacion || Date.now() - ultimaCaptura < INTERVALO_MS) return;
        ultimaCaptura = Date.now();
        alCapturar({
          latitud: ubicacion.latitude,
          longitud: ubicacion.longitude,
          precisionMetros: ubicacion.accuracy ?? undefined,
          fecha: new Date(ubicacion.time ?? Date.now()).toISOString(),
        });
      }
    );
  })().catch(() => undefined);

  return () => {
    detenido = true;
    idWatcher.then((id) => {
      if (id) BackgroundGeolocation.removeWatcher({ id });
    });
  };
}
