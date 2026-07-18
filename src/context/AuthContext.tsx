// Un "contexto" de React permite compartir un valor (aquí, el usuario logueado)
// con cualquier componente anidado, sin tener que pasarlo manualmente como
// prop de componente en componente ("prop drilling"). Cualquier pantalla
// puede llamar a useAuth() y saber quién inició sesión y qué rol tiene.

import { createContext, useContext } from "react";
import type { UsuarioAutenticado } from "../api/client";

export const AuthContext = createContext<UsuarioAutenticado | null>(null);

export function useAuth() {
  return useContext(AuthContext);
}

/** Ayuda para chequear el rol sin repetir `usuario?.rol === "ADMIN"` en cada pantalla. */
export function useEsAdmin(): boolean {
  const usuario = useAuth();
  return usuario?.rol === "ADMIN";
}

/** Un ADMIN siempre tiene acceso; para el resto, depende de sus permisos configurados. */
export function usePermiso(clave: string): boolean {
  const usuario = useAuth();
  return usuario?.rol === "ADMIN" || (usuario?.permisos ?? []).includes(clave);
}

/** Solo para mostrar en pantalla — la atribución real de stock siempre se decide en el backend. */
export function useMiSucursal(): { id: number; nombre: string } | null {
  const usuario = useAuth();
  if (!usuario?.sucursalId || !usuario.sucursalNombre) return null;
  return { id: usuario.sucursalId, nombre: usuario.sucursalNombre };
}
