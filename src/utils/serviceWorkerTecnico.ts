// Todo lo que la app necesita coordinar con el Service Worker (public/sw.js)
// para el rastreo de técnicos — ver el comentario grande en
// hooks/useUbicacionTecnico.ts sobre el problema que esto resuelve (perder
// el rastreo al pasar la app a segundo plano / que la mate el sistema).
import { Capacitor } from "@capacitor/core";
import { abrirDbTecnico, ALMACEN_SESION } from "./dbTecnico";
import { URL_BASE_API } from "../api/client";

const CLAVE_SESION = "actual";
const ETIQUETA_SYNC_PERIODICO = "flush-ubicaciones-tecnico";

// Se llama una sola vez al arrancar la app (ver main.tsx) — "NUNCA rechaza"
// (mismo criterio que el resto del rastreo de técnicos): si el navegador no
// soporta Service Workers, esto simplemente no hace nada más.
export function registrarServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  // Dentro del APK no hace falta: el rastreo en segundo plano lo hace el
  // plugin nativo (ver hooks/useUbicacionTecnico.ts), no este Service Worker.
  if (Capacitor.isNativePlatform()) return;
  navigator.serviceWorker.register("/sw.js").catch(() => {
    // Falló el registro (ej. navegador viejo, o servido sin HTTPS) — la app
    // sigue funcionando exactamente igual que sin Service Worker, solo sin
    // la mejora de segundo plano.
  });
}

// El Service Worker no puede leer localStorage (es exclusivo de la
// ventana), así que necesita su propia copia del token de sesión y de la
// URL base de la API para poder mandar el lote pendiente por su cuenta (ver
// sw.js, evento "periodicsync"). Se llama al arrancar la app (con lo que
// haya en localStorage en ese momento, incluido null) y cada vez que el
// token cambia: login, logout, y el interceptor de 401.
export async function guardarTokenParaServiceWorker(token: string | null): Promise<void> {
  try {
    const db = await abrirDbTecnico();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(ALMACEN_SESION, "readwrite");
      tx.objectStore(ALMACEN_SESION).put({ token, apiBaseUrl: URL_BASE_API }, CLAVE_SESION);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Si esto falla, el Service Worker simplemente no va a poder mandar el
    // lote pendiente por su cuenta en segundo plano — la app en primer
    // plano lo sigue mandando normalmente por su lado (ver
    // useUbicacionTecnico.ts), así que no es un fallo crítico.
  }
}

// Pide que el navegador, de tanto en tanto y a SU criterio (Chrome/Android
// decide el intervalo real — normalmente varias horas, nunca los ~2 min del
// rastreo en primer plano), despierte el Service Worker aunque la app esté
// cerrada, para reintentar mandar la cola pendiente (ver sw.js). No hay
// ninguna garantía de que esto corra ni de cada cuánto — es un "mejor que
// nada" para el caso de un técnico que se quedó sin señal y cerró la app
// con puntos todavía en la cola. Solo existe en Chrome/Android; en
// cualquier otro navegador esto no hace nada (feature-detection, mismo
// criterio "NUNCA rechaza" del resto del módulo).
export async function registrarSincronizacionPeriodica(): Promise<void> {
  try {
    if (!("serviceWorker" in navigator)) return;
    const registro = await navigator.serviceWorker.ready;
    if (!("periodicSync" in registro)) return;

    const permiso = await navigator.permissions.query({
      name: "periodic-background-sync" as PermissionName,
    });
    if (permiso.state !== "granted") return;

    // @ts-expect-error — periodicSync todavía no está en los tipos estándar de lib.dom.
    await registro.periodicSync.register(ETIQUETA_SYNC_PERIODICO, {
      minInterval: 30 * 60 * 1000, // 30 min PEDIDOS — el navegador decide el real, casi siempre más largo
    });
  } catch {
    // No soportado, permiso no concedido, o cualquier otro error — el
    // rastreo en primer plano (el de siempre) sigue funcionando igual.
  }
}
