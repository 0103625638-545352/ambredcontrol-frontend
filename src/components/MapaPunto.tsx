import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface Props {
  latitud: number;
  longitud: number;
  etiqueta?: string;
  alturaPx?: number;
}

// Mapa de un solo punto, de solo lectura — mismo patrón imperativo de
// Leaflet que MapaMarcacion.tsx/MapaGeocerca.tsx (evita el ícono roto de
// L.marker con bundlers como Vite usando L.circleMarker en su lugar), pero
// sin nada atado a geocercas/marcaciones: sirve para cualquier punto suelto
// (ej. la ubicación de la vivienda de un Cliente, ver ClientesPage.tsx). A
// diferencia de esos dos, acá SÍ se permite zoom con scroll/doble clic — se
// muestra dentro de un modal enfocado, no embebido en una página que
// scrollea, así que no hay conflicto de gestos.
export function MapaPunto({ latitud, longitud, etiqueta, alturaPx = 320 }: Props) {
  const contenedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contenedorRef.current) return;

    const mapa = L.map(contenedorRef.current).setView([latitud, longitud], 16);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(mapa);

    const marcador = L.circleMarker([latitud, longitud], {
      radius: 9,
      color: "#0284c7",
      fillColor: "#0284c7",
      fillOpacity: 0.8,
      weight: 2,
    }).addTo(mapa);
    if (etiqueta) marcador.bindTooltip(etiqueta, { permanent: false });

    return () => {
      mapa.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={contenedorRef} className="rounded-md overflow-hidden" style={{ height: alturaPx }} />;
}
