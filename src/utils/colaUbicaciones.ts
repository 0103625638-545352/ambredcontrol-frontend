// Cola de lecturas GPS del técnico que todavía no se pudieron mandar al
// servidor. Vive en IndexedDB (ver dbTecnico.ts), NO en localStorage como
// antes: el Service Worker también necesita poder leerla y vaciarla por su
// cuenta cuando despierta en segundo plano sin ninguna pestaña abierta (ver
// sw.js, evento "periodicsync"), y localStorage es exclusivo de la ventana
// — el Service Worker no puede tocarlo.
//
// A diferencia de utils/colaOffline.ts (que guarda acciones IDEMPOTENTES,
// un PATCH que sobrescribe el mismo estado), acá cada lectura es un punto
// nuevo que se agrega (POST, append-only), así que el vaciado es distinto:
// se manda todo el lote pendiente de una vez (ver POST /ubicaciones-tecnicos,
// que acepta un arreglo) y recién ahí se lo saca de la cola por id
// confirmado — nunca se "sobreescribe" un punto viejo con uno nuevo, todos
// importan para reconstruir el recorrido del día.
import { abrirDbTecnico, ALMACEN_PUNTOS } from "./dbTecnico";

export interface PuntoUbicacionPendiente {
  latitud: number;
  longitud: number;
  precisionMetros?: number;
  fecha: string; // ISO — momento real de la captura en el celular
}

// Tal como queda guardado en IndexedDB, con el id autoincremental que le
// asigna el propio almacén — ese id es lo que se usa para confirmar qué
// puntos ya llegaron al servidor (ver quitarEnviados).
export interface PuntoUbicacionGuardado extends PuntoUbicacionPendiente {
  id: number;
}

// Techo de la cola — si un técnico pasa varios días seguidos sin señal
// (caso raro, pero posible en zonas rurales), no tiene sentido seguir
// acumulando para siempre; se descartan las lecturas más VIEJAS primero
// (los ids más chicos) y se conservan las más recientes, que son las que
// más importan.
const MAXIMO_PUNTOS_EN_COLA = 2000;

export async function listarPendientes(): Promise<PuntoUbicacionGuardado[]> {
  try {
    const db = await abrirDbTecnico();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(ALMACEN_PUNTOS, "readonly");
      const solicitud = tx.objectStore(ALMACEN_PUNTOS).getAll();
      solicitud.onsuccess = () => resolve(solicitud.result as PuntoUbicacionGuardado[]);
      solicitud.onerror = () => reject(solicitud.error);
    });
  } catch {
    return []; // IndexedDB no disponible (ej. modo privado) — no hay cola, no hay mucho más que hacer
  }
}

export async function agregarPendiente(punto: PuntoUbicacionPendiente): Promise<void> {
  try {
    const db = await abrirDbTecnico();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(ALMACEN_PUNTOS, "readwrite");
      tx.objectStore(ALMACEN_PUNTOS).add(punto);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    await recortarSiExcede(db);
  } catch {
    // IndexedDB no disponible o falló — se pierde esta lectura puntual, no
    // hay mucho más que hacer sin backend propio para esto.
  }
}

// Saca de la cola los puntos ya confirmados por el servidor, por id — no
// "los primeros N", porque si se agregaron puntos nuevos MIENTRAS ese lote
// viajaba, esos quedan con un id que no está en la lista de confirmados y
// no se tocan.
export async function quitarEnviados(idsConfirmados: number[]): Promise<void> {
  if (idsConfirmados.length === 0) return;
  try {
    const db = await abrirDbTecnico();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(ALMACEN_PUNTOS, "readwrite");
      const almacen = tx.objectStore(ALMACEN_PUNTOS);
      for (const id of idsConfirmados) almacen.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Si falla, el próximo intento simplemente reenvía el lote entero —
    // el backend no duplica nada raro con esto (cada punto es un registro
    // nuevo, ver el comentario de arriba), como mucho queda un punto
    // repetido en el recorrido del día.
  }
}

async function recortarSiExcede(db: IDBDatabase): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ALMACEN_PUNTOS, "readwrite");
    const almacen = tx.objectStore(ALMACEN_PUNTOS);
    const solicitudConteo = almacen.count();
    solicitudConteo.onsuccess = () => {
      const sobran = solicitudConteo.result - MAXIMO_PUNTOS_EN_COLA;
      if (sobran <= 0) return;
      // El cursor por defecto recorre en orden ascendente de clave — como la
      // clave es el id autoincremental, eso es exactamente "los más viejos
      // primero".
      let borrados = 0;
      const cursorSolicitud = almacen.openCursor();
      cursorSolicitud.onsuccess = () => {
        const cursor = cursorSolicitud.result;
        if (!cursor || borrados >= sobran) return;
        cursor.delete();
        borrados++;
        cursor.continue();
      };
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
