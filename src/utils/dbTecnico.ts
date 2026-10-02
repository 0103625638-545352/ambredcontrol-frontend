// IndexedDB compartida entre la pestaña/PWA y el Service Worker — es la
// ÚNICA forma de compartir datos entre esos dos contextos (el Service
// Worker no puede leer localStorage, ver sw.js y el comentario grande de
// hooks/useUbicacionTecnico.ts sobre por qué esto existe). Dos almacenes:
//   - "puntos": la cola de lecturas GPS del técnico pendientes de mandar
//     (ver utils/colaUbicaciones.ts).
//   - "sesion": una sola fila con el token de sesión actual y la URL base
//     de la API — lo que el Service Worker necesita para poder mandar por
//     su cuenta el lote pendiente al despertar en background (ver sw.js y
//     utils/serviceWorkerTecnico.ts), sin ninguna pestaña abierta.
//
// OJO: este mismo esquema (nombre de DB, versión, nombres de almacén) está
// duplicado a mano en JS plano dentro de public/sw.js, porque un Service
// Worker se sirve tal cual desde /public (no pasa por el bundler) y no
// puede importar este módulo TypeScript. Si cambias algo acá, cambialo
// también allá.
const NOMBRE_DB = "ambred-tecnico";
const VERSION_DB = 1;

export const ALMACEN_PUNTOS = "puntos";
export const ALMACEN_SESION = "sesion";

export function abrirDbTecnico(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const solicitud = indexedDB.open(NOMBRE_DB, VERSION_DB);
    solicitud.onupgradeneeded = () => {
      const db = solicitud.result;
      if (!db.objectStoreNames.contains(ALMACEN_PUNTOS)) {
        db.createObjectStore(ALMACEN_PUNTOS, { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(ALMACEN_SESION)) {
        db.createObjectStore(ALMACEN_SESION); // clave-valor simple, sin keyPath propio
      }
    };
    solicitud.onsuccess = () => resolve(solicitud.result);
    solicitud.onerror = () => reject(solicitud.error);
  });
}
