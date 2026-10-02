// Convierte a mayúsculas, en vivo, todo lo que el personal escribe en campos
// de texto libre — para que Clientes/Productos/Proveedores/etc. no queden
// con una mezcla de mayúsculas y minúsculas según quién los cargó. Se
// engancha UNA sola vez, como "onChangeCapture" del contenedor raíz de la
// app (ver main.tsx), para no tener que tocar cada <input>/<textarea> del
// frontend uno por uno — son demasiados como para mantenerlo a mano de
// forma consistente.
//
// OJO — historia de este archivo: antes esto era un
// document.addEventListener("input", ..., {capture: true}) instalado sobre
// el documento entero, por FUERA de React. Mutar el ".value" del input
// directo desde ahí, ANTES de que React llegara a procesar ese mismo evento
// nativo, desincronizaba el "value tracker" interno que React usa para
// decidir si de verdad cambió algo en un input controlado: React terminaba
// viendo que node.value YA coincidía con lo que su tracker esperaba (porque
// nuestra mutación externa ya lo había dejado así) y se SALTABA su propio
// onChange para ese keystroke — el campo se veía escrito en pantalla
// (cambio puramente del DOM), pero form.xxx en el estado de React se
// quedaba atrás. Recién se notaba al tipear en OTRO campo: ese sí disparaba
// un re-render, y React reescribía TODOS los inputs controlados con su
// valor real (el desactualizado) — el campo anterior "se borraba" delante
// del usuario. Reproducido y confirmado con Empleados y Vehículos por
// igual: no era un bug de una pantalla puntual, era este archivo.
//
// La corrección: hacer la transformación DENTRO del mismo pase de eventos
// sintéticos de React (onChangeCapture, que se dispara en captura sobre el
// contenedor raíz ANTES que el onChange propio de cada <input>) en vez de
// competir con React desde un listener nativo aparte. React ve la
// transformación como parte de SU PROPIO manejo del evento, así que el
// tracker y el onChange de cada input se mantienen sincronizados.
const TIPOS_EXCLUIDOS = new Set([
  "password",
  "email",
  "url",
  "number",
  "date",
  "datetime-local",
  "month",
  "time",
  "week",
  "color",
  "file",
  "checkbox",
  "radio",
  "range",
  "hidden",
]);

function debeExcluirse(el: HTMLInputElement | HTMLTextAreaElement): boolean {
  if (el.dataset.noMayus === "true") return true;
  return el instanceof HTMLInputElement && TIPOS_EXCLUIDOS.has(el.type);
}

// Usar en <div onChangeCapture={manejarCambioMayusculas}> envolviendo toda
// la app (ver main.tsx) — no como listener nativo, ver el comentario arriba.
export function manejarCambioMayusculas(evento: { target: EventTarget | null }) {
  const el = evento.target;
  if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return;
  if (debeExcluirse(el)) return;

  const valor = el.value;
  const enMayusculas = valor.toUpperCase();
  if (valor === enMayusculas) return; // nada que cambiar — no tocar el cursor sin necesidad

  // Mayúsculas en español no cambia el largo del texto, pero el navegador
  // igual mueve el cursor al final al reasignar ".value" a mano — hay que
  // guardar la posición y restaurarla para que escribir en medio del texto
  // (ej. corrigiendo una palabra) no salte el cursor al final cada vez.
  const inicio = el.selectionStart;
  const fin = el.selectionEnd;
  el.value = enMayusculas;
  if (inicio !== null && fin !== null) {
    el.setSelectionRange(inicio, fin);
  }
}
