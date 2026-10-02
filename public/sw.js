// Service Worker de AmbrossISP PYMES.
//
// Dos trabajos, los dos acotados a propósito:
//   1. Estar registrado es lo que hace posible que la app sea instalable
//      como PWA (ver manifest.json e index.html) — Android trata mucho
//      mejor (mata menos en segundo plano) un ícono instalado en modo
//      standalone que una pestaña de Chrome suelta.
//   2. Reintentar mandar, en segundo plano y sin ninguna pestaña abierta,
//      la cola de ubicaciones GPS de técnicos que quedó pendiente (evento
//      "periodicsync" acá abajo) — ver el comentario grande en
//      frontend/src/hooks/useUbicacionTecnico.ts sobre el problema real que
//      esto resuelve, y sus límites (NO puede capturar una posición nueva:
//      la Geolocation API no existe en un Service Worker, solo en una
//      ventana/pestaña real).
//
// A propósito NO cachea nada (sin "install" con precache, sin interceptar
// fetch para servir desde caché) — este es un sistema de facturación e
// inventario en vivo, servir una respuesta vieja de la API por error sería
// peor que no tener Service Worker. El único fetch handler de abajo es un
// passthrough sin cambios, solo para maximizar compatibilidad con
// versiones de Chrome/Android que todavía exigen un listener de "fetch"
// como parte de los criterios de instalabilidad de un PWA.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

// --- Lo de abajo es una copia a mano, en JS plano, del esquema de
// frontend/src/utils/dbTecnico.ts — un Service Worker se sirve tal cual
// desde /public (no pasa por el bundler/TypeScript) y no puede importar ese
// módulo. Si cambias el esquema allá, cambialo acá también. ---
const NOMBRE_DB = "ambred-tecnico";
const VERSION_DB = 1;
const ALMACEN_PUNTOS = "puntos";
const ALMACEN_SESION = "sesion";
const CLAVE_SESION = "actual";
const ETIQUETA_SYNC_PERIODICO = "flush-ubicaciones-tecnico";

function abrirDbTecnico() {
  return new Promise((resolve, reject) => {
    const solicitud = indexedDB.open(NOMBRE_DB, VERSION_DB);
    solicitud.onupgradeneeded = () => {
      const db = solicitud.result;
      if (!db.objectStoreNames.contains(ALMACEN_PUNTOS)) {
        db.createObjectStore(ALMACEN_PUNTOS, { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(ALMACEN_SESION)) {
        db.createObjectStore(ALMACEN_SESION);
      }
    };
    solicitud.onsuccess = () => resolve(solicitud.result);
    solicitud.onerror = () => reject(solicitud.error);
  });
}

function leerSesion(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN_SESION, "readonly");
    const solicitud = tx.objectStore(ALMACEN_SESION).get(CLAVE_SESION);
    solicitud.onsuccess = () => resolve(solicitud.result || null);
    solicitud.onerror = () => reject(solicitud.error);
  });
}

function listarPuntosPendientes(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN_PUNTOS, "readonly");
    const solicitud = tx.objectStore(ALMACEN_PUNTOS).getAll();
    solicitud.onsuccess = () => resolve(solicitud.result || []);
    solicitud.onerror = () => reject(solicitud.error);
  });
}

function borrarPuntosConfirmados(db, ids) {
  return new Promise((resolve, reject) => {
    if (ids.length === 0) return resolve();
    const tx = db.transaction(ALMACEN_PUNTOS, "readwrite");
    const almacen = tx.objectStore(ALMACEN_PUNTOS);
    for (const id of ids) almacen.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Reintenta mandar la cola pendiente — mismo endpoint y mismo criterio
// "todo el lote de una vez" que useUbicacionTecnico.ts en primer plano (ver
// POST /ubicaciones-tecnicos, backend/src/routes/ubicacionesTecnicos.ts).
// Si no hay sesión guardada (nunca inició sesión, o cerró sesión — ver
// utils/serviceWorkerTecnico.ts) o no hay nada pendiente, no hace nada.
async function reintentarEnviarUbicacionesPendientes() {
  const db = await abrirDbTecnico();
  const sesion = await leerSesion(db);
  if (!sesion || !sesion.token) return;

  const puntos = await listarPuntosPendientes(db);
  if (puntos.length === 0) return;

  const respuesta = await fetch(`${sesion.apiBaseUrl}/ubicaciones-tecnicos`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sesion.token}`,
    },
    body: JSON.stringify({
      ubicaciones: puntos.map((p) => ({
        latitud: p.latitud,
        longitud: p.longitud,
        precisionMetros: p.precisionMetros,
        fecha: p.fecha,
      })),
    }),
  });

  // Solo se descarta la cola si el servidor efectivamente la aceptó (2xx) o
  // la rechazó de forma permanente (4xx, ej. sesión ya no válida — no tiene
  // sentido seguir intentando por siempre). Ante una falla de red o un 5xx,
  // se deja la cola intacta para el próximo intento (el próximo
  // "periodicsync", o el rastreo en primer plano apenas se reabra la app).
  if (respuesta.ok || (respuesta.status >= 400 && respuesta.status < 500)) {
    await borrarPuntosConfirmados(
      db,
      puntos.map((p) => p.id)
    );
  }
}

self.addEventListener("periodicsync", (event) => {
  if (event.tag === ETIQUETA_SYNC_PERIODICO) {
    event.waitUntil(reintentarEnviarUbicacionesPendientes());
  }
});
