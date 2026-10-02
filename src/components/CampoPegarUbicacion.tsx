import { useState } from "react";
import { parsearUbicacion, urlMapa } from "../utils/parsearUbicacion";

// Campo para pegar el mensaje de "ubicación actual" que manda el cliente por
// WhatsApp (ver utils/parsearUbicacion.ts) — apenas detecta coordenadas
// válidas en el texto pegado, avisa el "onDetectar" para que el formulario
// padre las guarde. Usado en la creación/edición de clientes y en agregar
// una parada de "contacto libre" en Visitas Técnicas.
export function CampoPegarUbicacion({
  latitud,
  longitud,
  onDetectar,
  className = "",
}: {
  latitud: string;
  longitud: string;
  onDetectar: (lat: string, lng: string) => void;
  className?: string; // ej. "col-span-2" cuando se usa dentro de un grid de 2 columnas
}) {
  // Si ya traía ubicación al montar (ej. editando algo que ya la tenía
  // cargada), el campo arranca mostrando esas coordenadas en vez de vacío —
  // el texto pegado nunca se guarda tal cual, solo lat/lng ya parseados, y
  // mostrarlo vacío hacía parecer que se había perdido.
  const [texto, setTexto] = useState(() => (latitud && longitud ? `${latitud}, ${longitud}` : ""));
  const [sinCoordenadas, setSinCoordenadas] = useState(false);
  // Distingue "esto ya estaba guardado de antes" (el valor inicial, sin
  // tocar) de "el usuario acaba de pegar algo nuevo" — mensajes distintos
  // más abajo para que quede claro que no se perdió nada.
  const [fueTocado, setFueTocado] = useState(false);

  function manejarCambio(valor: string) {
    setTexto(valor);
    setFueTocado(true);
    const coords = parsearUbicacion(valor);
    if (coords) {
      onDetectar(String(coords.lat), String(coords.lng));
      setSinCoordenadas(false);
    } else {
      setSinCoordenadas(valor.trim().length > 0);
    }
  }

  const hayUbicacion = !!latitud && !!longitud;

  return (
    <div className={className}>
      <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Pegar ubicación de WhatsApp (opcional)</label>
      <input
        type="text"
        placeholder="Pegá acá el mensaje o enlace de ubicación que mandó el cliente"
        value={texto}
        onChange={(e) => manejarCambio(e.target.value)}
        className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
      />
      {hayUbicacion && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
          📍 {fueTocado ? "Ubicación detectada" : "Ya tiene una ubicación guardada"} —{" "}
          <a
            href={urlMapa({ lat: Number(latitud), lng: Number(longitud) })}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            ver en el mapa
          </a>
        </p>
      )}
      {sinCoordenadas && !hayUbicacion && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
          No se encontraron coordenadas en ese texto — si el cliente mandó un enlace acortado (goo.gl/maps o maps.app.goo.gl), no sirve, hay que pegar el enlace completo.
        </p>
      )}
    </div>
  );
}
