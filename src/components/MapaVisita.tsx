import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { agregarCapasBase } from "../utils/capasMapaBase";

interface Props {
  // Ubicación PLANEADA (la que el despachador ubicó a mano en el mapa al
  // crear la ruta) — siempre presente.
  latitudPlaneada: number;
  longitudPlaneada: number;
  radioPermitidoMetros: number;
  // Ubicación REAL de llegada (ver PATCH /visitas/:id/llegada) — null si el
  // técnico todavía no marcó "Llegué" en esta visita (PENDIENTE) o la omitió
  // (OMITIDA) sin llegar a registrar ubicación.
  latitudLlegada: number | null;
  longitudLlegada: number | null;
  dentroDeRango: boolean | null;
}

// Mapa de SOLO LECTURA que compara el punto planeado de una visita técnica
// contra dónde el técnico realmente marcó "Llegué" — mismo patrón imperativo
// de Leaflet que MapaMarcacion.tsx (que hace lo mismo para geocercas de
// sucursal/Marcaciones), adaptado a los dos puntos propios de VisitaTecnica
// (latitud/longitud planeada vs. latitudLlegada/longitudLlegada real).
export function MapaVisita({ latitudPlaneada, longitudPlaneada, radioPermitidoMetros, latitudLlegada, longitudLlegada, dentroDeRango }: Props) {
  const contenedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contenedorRef.current) return;

    const mapa = L.map(contenedorRef.current, {
      dragging: true,
      scrollWheelZoom: false,
      doubleClickZoom: false,
    }).setView([latitudPlaneada, longitudPlaneada], 16);

    agregarCapasBase(mapa);

    // Punto planeado: azul, con un círculo del radio permitido alrededor
    // para visualizar el rango que cuenta como "llegó".
    L.circleMarker([latitudPlaneada, longitudPlaneada], {
      radius: 9,
      color: "#0284c7",
      fillColor: "#0284c7",
      fillOpacity: 0.8,
      weight: 2,
    })
      .addTo(mapa)
      .bindTooltip("Punto planeado", { permanent: false });

    L.circle([latitudPlaneada, longitudPlaneada], {
      radius: radioPermitidoMetros,
      color: "#0284c7",
      fillColor: "#0284c7",
      fillOpacity: 0.1,
      weight: 1.5,
    }).addTo(mapa);

    const puntos: [number, number][] = [[latitudPlaneada, longitudPlaneada]];

    // Punto real de llegada: verde si quedó dentro del rango permitido, rojo
    // si quedó fuera, gris si no se pudo evaluar (dato viejo sin distancia
    // calculada). Si es null, la visita todavía no tiene una llegada
    // registrada — el mapa solo muestra el punto planeado.
    if (latitudLlegada != null && longitudLlegada != null) {
      const color = dentroDeRango === true ? "#059669" : dentroDeRango === false ? "#dc2626" : "#6b7280";
      L.circleMarker([latitudLlegada, longitudLlegada], {
        radius: 9,
        color,
        fillColor: color,
        fillOpacity: 0.8,
        weight: 2,
      })
        .addTo(mapa)
        .bindTooltip("Llegada real", { permanent: false });
      puntos.push([latitudLlegada, longitudLlegada]);
    }

    if (puntos.length > 1) {
      mapa.fitBounds(L.latLngBounds(puntos), { padding: [40, 40], maxZoom: 17 });
    }

    return () => {
      mapa.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={contenedorRef} className="rounded-md overflow-hidden" style={{ height: 260 }} />;
}
