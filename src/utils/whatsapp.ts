// Enlace "click to chat" de WhatsApp (wa.me) — abre WhatsApp Web/app del
// USUARIO que hace clic, con el número del cliente y un mensaje precargado.
// A diferencia del recordatorio automático (backend/src/jobs/
// recordatorioVencimientoInternet.ts, que manda solo vía Meta Cloud API),
// esto no manda nada por sí mismo: solo arma el enlace, un humano sigue
// apretando "enviar" en su propio WhatsApp. Cero costo, cero integración —
// mismo mecanismo mental que un "mailto:", pero para WhatsApp.

// Cliente.telefono se carga a mano, sin formato fijo (con/sin "+593", con
// "0" inicial de Ecuador, con espacios/guiones) — wa.me exige el número en
// formato internacional sin símbolos. Asume Ecuador si no viene ya con otro
// código de país explícito (un "+" de otro país se respeta tal cual). Mismo
// criterio que backend/src/utils/whatsapp.ts (duplicado a propósito: son
// proyectos separados sin tipos compartidos, ver comentario en
// frontend/src/constants/permisos.ts para el mismo patrón).
export function normalizarTelefonoEcuador(telefono: string): string | null {
  const limpio = telefono.replace(/[^\d+]/g, "");
  if (limpio.startsWith("+")) return limpio.slice(1);
  if (limpio.startsWith("593")) return limpio;
  if (limpio.startsWith("0")) return `593${limpio.slice(1)}`;
  if (limpio.length === 9) return `593${limpio}`;
  return limpio.length >= 10 ? limpio : null;
}

// null si el teléfono no se pudo normalizar (vacío, muy corto) — quien
// llame a esto decide si oculta el botón en ese caso.
export function enlaceWhatsapp(telefono: string, mensaje?: string): string | null {
  const numero = normalizarTelefonoEcuador(telefono);
  if (!numero) return null;
  const texto = mensaje ? `?text=${encodeURIComponent(mensaje)}` : "";
  return `https://wa.me/${numero}${texto}`;
}
