import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { agregarCapasBase } from "../utils/capasMapaBase";
import type { UbicacionActualTecnico, PuntoRecorridoTecnico, EstadoUbicacionTecnico } from "../api/client";

interface Props {
  tecnicos: UbicacionActualTecnico[];
  // Recorrido del día del técnico SELECCIONADO — null/undefined = no hay
  // ninguno elegido (o todavía está cargando), no se dibuja ninguna línea.
  recorrido?: PuntoRecorridoTecnico[];
  onSeleccionar?: (tecnico: UbicacionActualTecnico) => void;
  vuelaHaciaId?: number | null;
}

// Color por estado — mismo criterio que COLOR_POR_ESTADO en
// MapaClientesRed.tsx (un solo lugar por dato, la etiqueta legible y el
// orden de leyenda viven en LocalizacionTecnicosPage.tsx).
export const COLOR_POR_ESTADO_TECNICO: Record<EstadoUbicacionTecnico, string> = {
  EN_LINEA: "#059669",
  RECIENTE: "#d97706",
  DESCONECTADO: "#9ca3af",
  SIN_DATOS: "#9ca3af",
};

function escaparHtml(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// "hace X min/h/d" — mismo criterio de redondeo que minutosDesde() en
// routes/ubicacionesTecnicos.ts, acá solo para mostrar (el estado/color ya
// lo decidió el backend).
function haceCuanto(minutos: number): string {
  if (minutos < 1) return "recién";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  return `hace ${Math.floor(horas / 24)} d`;
}

function contenidoTooltip(t: UbicacionActualTecnico): string {
  const lineas = [`<b>${escaparHtml(t.nombre)}</b>`, haceCuanto(t.minutos)];
  lineas.push(t.vehiculo ? `Vehículo: ${escaparHtml(t.vehiculo.placa)} (${escaparHtml(t.vehiculo.marca.nombre)} ${escaparHtml(t.vehiculo.modelo.nombre)})` : "Sin vehículo asignado hoy");
  if (t.precisionMetros) lineas.push(`Precisión: ±${Math.round(Number(t.precisionMetros))} m`);
  return lineas.join("<br/>");
}

// Mapa con la última posición conocida de cada técnico (coloreada por
// EstadoUbicacionTecnico) + opcionalmente la línea del recorrido del día del
// técnico seleccionado — mismo patrón imperativo de Leaflet que
// MapaClientesRed.tsx (capa de marcadores que se reconstruye cuando cambian
// los datos, sin recrear el mapa entero).
export function MapaTecnicos({ tecnicos, recorrido, onSeleccionar, vuelaHaciaId }: Props) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const capaMarcadoresRef = useRef<L.LayerGroup | null>(null);
  const capaRecorridoRef = useRef<L.LayerGroup | null>(null);
  const ajustadoInicialRef = useRef(false);

  useEffect(() => {
    if (!contenedorRef.current) return;
    // Centro por defecto: Cuenca (misma convención que MapaClientesRed.tsx).
    const mapa = L.map(contenedorRef.current).setView([-2.9, -79.0], 12);
    mapaRef.current = mapa;

    agregarCapasBase(mapa);

    capaRecorridoRef.current = L.layerGroup().addTo(mapa);
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

    for (const t of tecnicos) {
      const lat = Number(t.latitud);
      const lng = Number(t.longitud);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const color = COLOR_POR_ESTADO_TECNICO[t.estado];
      const anillo =
        t.estado === "EN_LINEA" ? `<span class="marcador-tecnico-anillo" style="border-color:${color}"></span>` : "";
      const icono = L.divIcon({
        className: "",
        html: `<div style="position:relative;width:20px;height:20px;">${anillo}<div style="position:absolute;inset:0;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;color:white;font-size:10px;font-weight:600;"></div></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });

      const marcador = L.marker([lat, lng], { icon: icono }).addTo(capa);
      marcador.bindTooltip(contenidoTooltip(t));
      if (onSeleccionar) marcador.on("click", () => onSeleccionar(t));
    }

    if (!ajustadoInicialRef.current && tecnicos.length > 0) {
      const puntos = tecnicos
        .map((t) => [Number(t.latitud), Number(t.longitud)] as [number, number])
        .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
      if (puntos.length > 0) {
        mapa.fitBounds(L.latLngBounds(puntos), { padding: [40, 40], maxZoom: 15 });
        ajustadoInicialRef.current = true;
      }
    }
  }, [tecnicos, onSeleccionar]);

  // Línea del recorrido del día del técnico seleccionado.
  useEffect(() => {
    const capa = capaRecorridoRef.current;
    if (!capa) return;
    capa.clearLayers();
    if (!recorrido || recorrido.length === 0) return;

    const puntos = recorrido
      .map((p) => [Number(p.latitud), Number(p.longitud)] as [number, number])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
    if (puntos.length < 2) return;

    L.polyline(puntos, { color: "#2563eb", weight: 3, opacity: 0.7 }).addTo(capa);
    // Punto de partida (primero del día) para distinguirlo del marcador
    // "actual" (que ya muestra la capa de arriba, siempre el más reciente).
    L.circleMarker(puntos[0], { radius: 5, color: "#2563eb", fillColor: "#fff", fillOpacity: 1, weight: 2 }).addTo(capa);
  }, [recorrido]);

  useEffect(() => {
    if (!vuelaHaciaId) return;
    const tecnico = tecnicos.find((t) => t.empleadoId === vuelaHaciaId);
    const mapa = mapaRef.current;
    if (!tecnico || !mapa) return;
    const lat = Number(tecnico.latitud);
    const lng = Number(tecnico.longitud);
    if (Number.isFinite(lat) && Number.isFinite(lng)) mapa.flyTo([lat, lng], 16, { duration: 0.75 });
  }, [vuelaHaciaId, tecnicos]);

  return (
    <>
      <style>{`
        .marcador-tecnico-anillo {
          position: absolute;
          inset: -6px;
          border-radius: 9999px;
          border-width: 2px;
          border-style: solid;
          opacity: 0.6;
          animation: marcador-tecnico-pulso 1.8s ease-out infinite;
        }
        @keyframes marcador-tecnico-pulso {
          0% { transform: scale(0.6); opacity: 0.7; }
          100% { transform: scale(1.8); opacity: 0; }
        }
      `}</style>
      <div ref={contenedorRef} className="w-full h-full" />
    </>
  );
}
