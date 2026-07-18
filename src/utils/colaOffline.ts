// Cola local (localStorage) de acciones del técnico que no se pudieron
// mandar al servidor por falta de señal — "marcar llegada" y "omitir visita"
// son ambas operaciones idempotentes en el backend (un PATCH que sobrescribe
// el mismo estado, no crea filas nuevas), así que es seguro reintentarlas
// tal cual quedaron guardadas, sin riesgo de duplicar nada. A propósito NO
// incluye el acta de instalación (fotos): un archivo binario no cabe bien en
// localStorage y merece su propio diseño si hace falta más adelante.
export type TipoAccionPendiente = "llegada" | "omitir";

export interface AccionPendiente {
  id: string;
  tipo: TipoAccionPendiente;
  visitaId: number;
  payload: Record<string, unknown>;
  creadoEn: number;
}

const CLAVE_STORAGE = "visitas_acciones_pendientes";

function leerTodas(): AccionPendiente[] {
  try {
    const crudo = localStorage.getItem(CLAVE_STORAGE);
    return crudo ? JSON.parse(crudo) : [];
  } catch {
    return [];
  }
}

function guardarTodas(acciones: AccionPendiente[]) {
  localStorage.setItem(CLAVE_STORAGE, JSON.stringify(acciones));
}

export function listarAccionesPendientes(): AccionPendiente[] {
  return leerTodas();
}

export function agregarAccionPendiente(tipo: TipoAccionPendiente, visitaId: number, payload: Record<string, unknown>): AccionPendiente {
  const accion: AccionPendiente = { id: `${Date.now()}-${Math.random()}`, tipo, visitaId, payload, creadoEn: Date.now() };
  guardarTodas([...leerTodas(), accion]);
  return accion;
}

export function quitarAccionPendiente(id: string) {
  guardarTodas(leerTodas().filter((a) => a.id !== id));
}

export function hayAccionPendientePara(visitaId: number): boolean {
  return leerTodas().some((a) => a.visitaId === visitaId);
}
