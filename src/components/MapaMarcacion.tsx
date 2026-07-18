import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface Props {
  // Dónde se realizó la marcación.
  latitud: number;
  longitud: number;
  dentroDeGeocerca: boolean | null;
  // Geocerca de la sucursal del empleado, si está configurada — se dibuja
  // para comparar visualmente contra el punto de la marcación.
  geocerca: { latitud: number; longitud: number; radioMetros: number } | null;
}

// Mapa de SOLO LECTURA (sin arrastrar ni hacer clic para mover nada) que
// muestra dónde se hizo una marcación puntual — complementa el badge
// "Fuera de zona" del historial (ver NominaPage.tsx: PestanaMarcaciones)
// con la ubicación real en un mapa, para que un admin la revise. Mismo
// patrón imperativo de Leaflet que components/MapaGeocerca.tsx (el mapa
// editable de Ajustes), pero sin marcador arrastrable ni listener de click.
export function MapaMarcacion({ latitud, longitud, dentroDeGeocerca, geocerca }: Props) {
  const contenedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contenedorRef.current) return;

    const mapa = L.map(contenedorRef.current, {
      dragging: true,
      scrollWheelZoom: false,
      doubleClickZoom: false,
    }).setView([latitud, longitud], 16);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(mapa);

    // Color del marcador de la marcación: verde si quedó dentro de la
    // geocerca, rojo si quedó fuera, gris si no se pudo evaluar (sin
    // geocerca configurada en ese momento, o sin coordenadas).
    const color = dentroDeGeocerca === true ? "#059669" : dentroDeGeocerca === false ? "#dc2626" : "#6b7280";
    L.circleMarker([latitud, longitud], {
      radius: 9,
      color,
      fillColor: color,
      fillOpacity: 0.8,
      weight: 2,
    })
      .addTo(mapa)
      .bindTooltip("Marcación", { permanent: false });

    const puntos: [number, number][] = [[latitud, longitud]];

    if (geocerca) {
      L.circle([geocerca.latitud, geocerca.longitud], {
        radius: geocerca.radioMetros,
        color: "#0284c7",
        fillColor: "#0284c7",
        fillOpacity: 0.1,
        weight: 1.5,
      }).addTo(mapa);
      puntos.push([geocerca.latitud, geocerca.longitud]);
    }

    // Encuadra ambos puntos (marcación + centro de la geocerca) si están
    // lejos entre sí, en vez de dejar uno fuera de la vista.
    if (puntos.length > 1) {
      mapa.fitBounds(L.latLngBounds(puntos), { padding: [40, 40], maxZoom: 17 });
    }

    return () => {
      mapa.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={contenedorRef} className="rounded-md overflow-hidden" style={{ height: 280 }} />;
}
