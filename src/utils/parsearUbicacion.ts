// Extrae latitud/longitud del texto que WhatsApp pega al reenviar o copiar
// un mensaje de "Ubicación actual" — normalmente trae un enlace de Google
// Maps con las coordenadas adentro. Cubre los formatos más comunes, EN
// ORDEN DE PRECISIÓN (el primero que matchea y da un rango válido gana):
//   - .../place/.../data=...!3d-2.8807819!4d-78.9778533... → el PIN exacto
//     que compartió el cliente (visto en un enlace real de WhatsApp: la
//     URL completa de un lugar trae ADEMÁS un "@lat,lng,zoom" que es solo
//     el centro de la CÁMARA del mapa en ese momento — puede quedar
//     corrido varios cientos de metros del pin real si Google movió la
//     vista al abrir el panel de info. "!3d...!4d..." es siempre el punto
//     exacto, por eso se revisa ANTES que "@lat,lng").
//   - https://maps.google.com/?q=-2.9001285,-79.0058965
//   - geo:-2.9001285,-79.0058965
//   - https://www.google.com/maps/@-2.9001285,-79.0058965,15z (sin pin
//     propio, ej. una vista de mapa reenviada sin compartir un lugar
//     puntual — acá "@lat,lng" sí es lo único disponible)
//   - "-2.9001285, -79.0058965" (coordenadas pegadas directo, sin enlace)
//
// Enlaces ACORTADOS (goo.gl/maps/..., maps.app.goo.gl/...) no traen las
// coordenadas en el texto — esos no se pueden resolver sin abrirlos aparte,
// así que esta función simplemente no encuentra nada en ese caso.
const PATRONES = [
  /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/,
  /[?&]q=(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/,
  /geo:(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/,
  /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/,
  /(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/,
];

export interface Coordenadas {
  lat: number;
  lng: number;
}

export function parsearUbicacion(texto: string): Coordenadas | null {
  if (!texto?.trim()) return null;

  for (const patron of PATRONES) {
    const match = texto.match(patron);
    if (!match) continue;
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }
  return null;
}

export function urlMapa({ lat, lng }: Coordenadas): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}
