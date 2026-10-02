import type { PuntoRuta } from "../api/client";

// Distancia entre dos puntos lat/lng por la fórmula de Haversine — no se usa
// una librería aparte para esto solo, un par de líneas alcanza.
const RADIO_TIERRA_M = 6_371_000;

function distanciaEntrePuntos(a: PuntoRuta, b: PuntoRuta): number {
  const radLat1 = (a.lat * Math.PI) / 180;
  const radLat2 = (b.lat * Math.PI) / 180;
  const deltaLat = ((b.lat - a.lat) * Math.PI) / 180;
  const deltaLng = ((b.lng - a.lng) * Math.PI) / 180;

  const h = Math.sin(deltaLat / 2) ** 2 + Math.cos(radLat1) * Math.cos(radLat2) * Math.sin(deltaLng / 2) ** 2;
  return RADIO_TIERRA_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Largo total de un tendido sumando cada segmento del trazado — se calcula
// SIEMPRE al vuelo a partir de TendidoFibra.trazado, nunca se guarda en la
// base (ver comentario en el modelo TendidoFibra, schema.prisma), así que no
// hay forma de que quede desactualizado si se edita el trazo.
export function largoTendidoMetros(trazado: PuntoRuta[]): number {
  let total = 0;
  for (let i = 1; i < trazado.length; i++) {
    total += distanciaEntrePuntos(trazado[i - 1], trazado[i]);
  }
  return total;
}

export function formatearLargo(metros: number): string {
  if (metros >= 1000) return `${(metros / 1000).toFixed(2)} km`;
  return `${Math.round(metros)} m`;
}
