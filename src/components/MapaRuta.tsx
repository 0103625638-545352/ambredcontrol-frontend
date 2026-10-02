import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { agregarCapasBase } from "../utils/capasMapaBase";

export interface ParadaMapa {
  id: number;
  lat: number;
  lng: number;
  orden: number;
  estado: "PENDIENTE" | "COMPLETADA" | "OMITIDA";
  etiqueta: string; // nombreContacto, mostrado en el tooltip
}

interface Props {
  paradas: ParadaMapa[];
  alturaPx?: number;
}

const COLOR_POR_ESTADO: Record<ParadaMapa["estado"], string> = {
  PENDIENTE: "#0284c7",
  COMPLETADA: "#059669",
  OMITIDA: "#dc2626",
};

// Mapa de SOLO LECTURA con VARIAS paradas numeradas (la ruta completa del
// día de un técnico) — a diferencia de MapaMarcacion.tsx (un solo punto +
// su geocerca de comparación, usado en el historial de Marcaciones), acá
// el caso de uso es distinto: mostrar el recorrido completo con el orden
// calculado por utils/rutaVisitas.ts. Mismo patrón imperativo de Leaflet
// que el resto de mapas de este proyecto.
export function MapaRuta({ paradas, alturaPx = 320 }: Props) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const capaMarcadoresRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!contenedorRef.current) return;
    const centro: [number, number] = paradas.length > 0 ? [paradas[0].lat, paradas[0].lng] : [-2.9, -79.0];
    const mapa = L.map(contenedorRef.current).setView(centro, 13);
    mapaRef.current = mapa;

    agregarCapasBase(mapa);

    capaMarcadoresRef.current = L.layerGroup().addTo(mapa);

    return () => {
      mapa.remove();
      mapaRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const mapa = mapaRef.current;
    const capa = capaMarcadoresRef.current;
    if (!mapa || !capa) return;

    capa.clearLayers();

    for (const p of paradas) {
      const color = COLOR_POR_ESTADO[p.estado];
      const icono = L.divIcon({
        className: "",
        html: `<div style="background:${color};color:white;border-radius:9999px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4)">${p.orden}</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
      L.marker([p.lat, p.lng], { icon: icono }).addTo(capa).bindTooltip(`${p.orden}. ${p.etiqueta}`);
    }

    if (paradas.length > 0) {
      mapa.fitBounds(
        L.latLngBounds(paradas.map((p) => [p.lat, p.lng] as [number, number])),
        { padding: [40, 40], maxZoom: 15 }
      );
    }
  }, [paradas]);

  return <div ref={contenedorRef} className="rounded-md overflow-hidden" style={{ height: alturaPx }} />;
}
