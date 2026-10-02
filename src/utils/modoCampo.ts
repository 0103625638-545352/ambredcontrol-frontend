import type { UsuarioAutenticado } from "../api/client";

// "Modo campo" = el shell móvil, mínimo, de una sola columna que ve un
// técnico cuando entra desde el celular en la visita a un cliente (ver
// AppMovil.tsx). No es un rol nuevo: un usuario de campo es un Usuario
// no-ADMIN vinculado a un Empleado — el mismo criterio que ya destraba
// "Mi ruta de hoy" en el shell de escritorio (ver App.tsx / routes/visitas.ts).

const CLAVE_OVERRIDE = "modoCampoForzado";

export type ModoApp = "movil" | "completo";

/** Un técnico de campo: no es ADMIN y está vinculado a un Empleado. */
export function esUsuarioDeCampo(usuario: UsuarioAutenticado): boolean {
  return usuario.rol !== "ADMIN" && usuario.empleadoId != null;
}

/**
 * Modo con el que se debe montar la app para este usuario. Un override
 * manual guardado por el propio usuario (botón "Ver versión completa" /
 * "Volver a versión celular") siempre gana; sin override, un usuario de
 * campo arranca en "movil" y el resto en "completo".
 */
export function leerModoEfectivo(usuario: UsuarioAutenticado): ModoApp {
  let override: string | null = null;
  try {
    override = localStorage.getItem(CLAVE_OVERRIDE);
  } catch {
    override = null;
  }
  if (override === "movil" || override === "completo") return override;
  return esUsuarioDeCampo(usuario) ? "movil" : "completo";
}

/** Fija el override y recarga para que App.tsx vuelva a decidir el shell. */
export function fijarModo(modo: ModoApp) {
  try {
    localStorage.setItem(CLAVE_OVERRIDE, modo);
  } catch {
    /* almacenamiento no disponible — no bloquea, solo no persiste */
  }
  window.location.reload();
}

/** Se llama al cerrar sesión, para no arrastrar el override a la próxima cuenta. */
export function limpiarModoForzado() {
  try {
    localStorage.removeItem(CLAVE_OVERRIDE);
  } catch {
    /* nada que hacer */
  }
}
