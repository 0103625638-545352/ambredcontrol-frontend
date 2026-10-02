import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw";
import "leaflet-draw/dist/leaflet.draw.css";
import type { CajaFibra, TendidoFibra, PuntoRuta } from "../api/client";
import { formatearLargo, largoTendidoMetros } from "../utils/geoFibra";
import { agregarCapasBase } from "../utils/capasMapaBase";

// Modo activo del mapa — nunca hay más de un handler de dibujo habilitado a
// la vez (ver el useEffect que los activa/desactiva más abajo). "ubicarNodo"
// no usa leaflet-draw: es un clic directo sobre el mapa. "editarTrazado" no
// usa ningún Draw.Handler tampoco — habilita la edición nativa de vértices
// de leaflet-draw (linea.editing) sobre UN tendido puntual, ver
// tendidoEnEdicion más abajo.
export type ModoMapaRedFisica = "ver" | "dibujarCaja" | "dibujarTendido" | "ubicarNodo" | "editarTrazado";

interface NodoUbicado {
  id: number;
  nombre: string;
  latitud: number;
  longitud: number;
}

interface Props {
  cajas: CajaFibra[];
  tendidos: TendidoFibra[];
  nodosUbicados: NodoUbicado[];
  modo: ModoMapaRedFisica;
  onCajaDibujada: (punto: PuntoRuta) => void;
  onTendidoDibujado: (puntos: PuntoRuta[]) => void;
  onNodoUbicado: (punto: PuntoRuta) => void;
  onSeleccionarCaja?: (caja: CajaFibra) => void;
  onSeleccionarTendido?: (tendido: TendidoFibra) => void;
  // Vista previa de una importación KML/KMZ todavía SIN guardar (ver
  // RedFisicaPage.tsx) — se pinta en naranja punteado, sin interacción, para
  // distinguirla claramente de lo que ya está guardado.
  previaCajas?: { latitud: number; longitud: number }[];
  previaTendidos?: { trazado: PuntoRuta[] }[];
  // Tendido puntual en edición de vértices (modo "editarTrazado") — se
  // dibuja APARTE de la capa normal (que lo excluye mientras tanto) con los
  // manijas de leaflet-draw habilitadas: arrastrar un punto lo mueve, un
  // clic sobre un punto lo borra, arrastrar el rombo del punto medio agrega
  // uno nuevo. El trazado acá es el de ARRANQUE (se usa solo para crear la
  // capa una vez, ver el id en las deps del efecto) — los cambios en vivo
  // salen por onTrazadoEditado, nunca se leen de vuelta por props mientras
  // se edita.
  tendidoEnEdicion?: { id: number; trazado: PuntoRuta[] } | null;
  onTrazadoEditado?: (puntos: PuntoRuta[]) => void;
}

// Color por tipo de tendido, para distinguirlos a simple vista (mismo
// espíritu que COLOR_POR_ESTADO en MapaClientesRed.tsx) — un tendido con
// colorHex propio siempre lo prioriza, y uno CORTADO siempre se ve rojo sin
// importar su tipo (es la señal más urgente para un técnico mirando el mapa).
const COLOR_POR_TIPO_TENDIDO: Record<string, string> = {
  Troncal: "#1d4ed8",
  Distribución: "#0891b2",
  Acometida: "#059669",
};
const COLOR_TENDIDO_DEFECTO = "#6366f1";

function colorTendido(t: TendidoFibra): string {
  if (t.estado === "CORTADO") return "#dc2626";
  if (t.colorHex) return t.colorHex;
  return COLOR_POR_TIPO_TENDIDO[t.tipo] ?? COLOR_TENDIDO_DEFECTO;
}

// Mapa de Red Física: dibuja cajas/NAP (CajaFibra), tramos de cable
// (TendidoFibra) y los nodos ya ubicados, y permite trazar nuevos directo
// sobre el mapa con leaflet-draw — el reemplazo de Google Earth. Mismo
// patrón imperativo de Leaflet que MapaClientesRed.tsx: una capa por tipo de
// dato que se reconstruye cuando cambian los props, sin recrear el mapa.
export function MapaRedFisica({
  cajas,
  tendidos,
  nodosUbicados,
  modo,
  onCajaDibujada,
  onTendidoDibujado,
  onNodoUbicado,
  onSeleccionarCaja,
  onSeleccionarTendido,
  previaCajas,
  previaTendidos,
  tendidoEnEdicion,
  onTrazadoEditado,
}: Props) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const capaCajasRef = useRef<L.LayerGroup | null>(null);
  const capaTendidosRef = useRef<L.LayerGroup | null>(null);
  const capaNodosRef = useRef<L.LayerGroup | null>(null);
  const capaPreviaRef = useRef<L.LayerGroup | null>(null);
  const dibujanteMarcadorRef = useRef<any>(null);
  const dibujantePolilineaRef = useRef<any>(null);
  const ajustadoInicialRef = useRef(false);

  // Los handlers de Leaflet quedan registrados UNA vez (ver el useEffect de
  // creación, deps: []) — este ref evita que usen closures viejas de los
  // callbacks recibidos por props en cada re-render.
  const callbacksRef = useRef({ onCajaDibujada, onTendidoDibujado, onNodoUbicado, onTrazadoEditado });
  callbacksRef.current = { onCajaDibujada, onTendidoDibujado, onNodoUbicado, onTrazadoEditado };

  useEffect(() => {
    if (!contenedorRef.current) return;
    // Centro por defecto: Cuenca, mismo criterio que MapaClientesRed.tsx —
    // se reemplaza apenas hay datos reales con fitBounds más abajo.
    const mapa = L.map(contenedorRef.current).setView([-2.9, -79.0], 13);
    mapaRef.current = mapa;

    agregarCapasBase(mapa);

    capaCajasRef.current = L.layerGroup().addTo(mapa);
    capaTendidosRef.current = L.layerGroup().addTo(mapa);
    capaNodosRef.current = L.layerGroup().addTo(mapa);
    capaPreviaRef.current = L.layerGroup().addTo(mapa);

    // Handlers de leaflet-draw usados SUELTOS (sin su barra de herramientas
    // propia) — el modo de dibujo lo eligen los botones de RedFisicaPage.tsx,
    // acá solo se habilita/deshabilita el handler correspondiente.
    dibujanteMarcadorRef.current = new (L as any).Draw.Marker(mapa);
    dibujantePolilineaRef.current = new (L as any).Draw.Polyline(mapa, { shapeOptions: { color: "#1d4ed8", weight: 4 } });

    mapa.on((L as any).Draw.Event.CREATED, (evento: any) => {
      if (evento.layerType === "marker") {
        const { lat, lng } = evento.layer.getLatLng();
        callbacksRef.current.onCajaDibujada({ lat, lng });
      } else if (evento.layerType === "polyline") {
        const puntos: PuntoRuta[] = evento.layer.getLatLngs().map((p: L.LatLng) => ({ lat: p.lat, lng: p.lng }));
        callbacksRef.current.onTendidoDibujado(puntos);
      }
    });

    return () => {
      mapa.remove();
      mapaRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Modo "ubicar nodo": un clic directo sobre el mapa (no hace falta
  // arrastrar un marcador nuevo, solo elegir el punto).
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;
    function manejarClick(e: L.LeafletMouseEvent) {
      if (modo === "ubicarNodo") callbacksRef.current.onNodoUbicado({ lat: e.latlng.lat, lng: e.latlng.lng });
    }
    mapa.on("click", manejarClick);
    return () => {
      mapa.off("click", manejarClick);
    };
  }, [modo]);

  // Activa/desactiva el handler de dibujo del modo elegido — nunca hay más
  // de uno habilitado a la vez.
  useEffect(() => {
    dibujanteMarcadorRef.current?.disable();
    dibujantePolilineaRef.current?.disable();
    if (modo === "dibujarCaja") dibujanteMarcadorRef.current?.enable();
    if (modo === "dibujarTendido") dibujantePolilineaRef.current?.enable();
  }, [modo]);

  useEffect(() => {
    const capa = capaCajasRef.current;
    if (!capa) return;
    capa.clearLayers();
    for (const c of cajas) {
      const lat = Number(c.latitud);
      const lng = Number(c.longitud);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const icono = L.divIcon({
        className: "",
        html: `<div style="width:14px;height:14px;border-radius:3px;background:#f59e0b;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.5)"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      const marcador = L.marker([lat, lng], { icon: icono }).addTo(capa);
      marcador.bindTooltip(`<b>${c.codigo}</b><br/>${c.tipo}${c.nodo ? `<br/>Nodo: ${c.nodo.nombre}` : ""}`);
      if (onSeleccionarCaja) marcador.on("click", () => onSeleccionarCaja(c));
    }
  }, [cajas, onSeleccionarCaja]);

  useEffect(() => {
    const capa = capaTendidosRef.current;
    if (!capa) return;
    capa.clearLayers();
    for (const t of tendidos) {
      // El que está en edición de vértices se dibuja APARTE (ver el efecto
      // de más abajo, capa roja punteada con manijas) — acá se salta para
      // no duplicarlo.
      if (t.id === tendidoEnEdicion?.id) continue;
      const puntos = t.trazado
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
        .map((p) => [p.lat, p.lng] as [number, number]);
      if (puntos.length < 2) continue;
      const linea = L.polyline(puntos, { color: colorTendido(t), weight: 4, opacity: 0.85 }).addTo(capa);
      const largo = formatearLargo(largoTendidoMetros(t.trazado));
      linea.bindTooltip(`<b>${t.nombre || t.tipo}</b><br/>${t.tipo} · ${largo}${t.estado !== "ACTIVO" ? `<br/>${t.estado}` : ""}`);
      if (onSeleccionarTendido) linea.on("click", () => onSeleccionarTendido(t));
    }
  }, [tendidos, onSeleccionarTendido, tendidoEnEdicion?.id]);

  // Capa de edición de vértices — se crea UNA sola vez por tendido (deps:
  // solo el id, no el trazado) para no perder el trabajo en curso del
  // usuario ni recrear la capa en cada arrastre; leaflet-draw ya sabe
  // gestionar sus propios manijas de edición mientras la capa exista.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !tendidoEnEdicion) return;

    const puntos = tendidoEnEdicion.trazado
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
      .map((p) => [p.lat, p.lng] as [number, number]);
    const linea = L.polyline(puntos, { color: "#dc2626", weight: 5, opacity: 0.95, dashArray: "8,4" }).addTo(mapa);
    (linea as any).editing.enable();

    function manejarEdicion() {
      const nuevosPuntos: PuntoRuta[] = (linea.getLatLngs() as L.LatLng[]).map((p) => ({ lat: p.lat, lng: p.lng }));
      callbacksRef.current.onTrazadoEditado?.(nuevosPuntos);
    }
    linea.on("edit", manejarEdicion);

    if (puntos.length > 0) mapa.fitBounds(L.latLngBounds(puntos), { padding: [60, 60], maxZoom: 17 });

    return () => {
      linea.off("edit", manejarEdicion);
      (linea as any).editing.disable();
      mapa.removeLayer(linea);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tendidoEnEdicion?.id]);

  useEffect(() => {
    const capa = capaNodosRef.current;
    if (!capa) return;
    capa.clearLayers();
    for (const n of nodosUbicados) {
      if (!Number.isFinite(n.latitud) || !Number.isFinite(n.longitud)) continue;
      const icono = L.divIcon({
        className: "",
        html: `<div style="width:16px;height:16px;border-radius:9999px;background:#7c3aed;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.5)"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      L.marker([n.latitud, n.longitud], { icon: icono })
        .addTo(capa)
        .bindTooltip(`<b>Nodo: ${n.nombre}</b>`);
    }
  }, [nodosUbicados]);

  // Vista previa de una importación KML/KMZ todavía sin guardar — naranja
  // punteado, sin tooltip ni click (es de solo lectura, la edición pasa por
  // el formulario de revisión en RedFisicaPage.tsx, no por el mapa).
  useEffect(() => {
    const capa = capaPreviaRef.current;
    if (!capa) return;
    capa.clearLayers();
    for (const c of previaCajas ?? []) {
      if (!Number.isFinite(c.latitud) || !Number.isFinite(c.longitud)) continue;
      L.circleMarker([c.latitud, c.longitud], {
        radius: 7,
        color: "#ea580c",
        weight: 2,
        fillColor: "#fed7aa",
        fillOpacity: 0.9,
        dashArray: "3,3",
      }).addTo(capa);
    }
    for (const t of previaTendidos ?? []) {
      const puntos = t.trazado.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)).map((p) => [p.lat, p.lng] as [number, number]);
      if (puntos.length < 2) continue;
      L.polyline(puntos, { color: "#ea580c", weight: 3, dashArray: "6,6", opacity: 0.9 }).addTo(capa);
    }
  }, [previaCajas, previaTendidos]);

  // Encuadre inicial, una sola vez, apenas hay algo que mostrar.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || ajustadoInicialRef.current) return;
    const puntos: [number, number][] = [
      ...cajas
        .filter((c) => Number.isFinite(Number(c.latitud)) && Number.isFinite(Number(c.longitud)))
        .map((c) => [Number(c.latitud), Number(c.longitud)] as [number, number]),
      ...nodosUbicados
        .filter((n) => Number.isFinite(n.latitud) && Number.isFinite(n.longitud))
        .map((n) => [n.latitud, n.longitud] as [number, number]),
      ...(previaCajas ?? [])
        .filter((c) => Number.isFinite(c.latitud) && Number.isFinite(c.longitud))
        .map((c) => [c.latitud, c.longitud] as [number, number]),
    ];
    if (puntos.length > 0) {
      mapa.fitBounds(L.latLngBounds(puntos), { padding: [40, 40], maxZoom: 16 });
      ajustadoInicialRef.current = true;
    }
  }, [cajas, nodosUbicados, previaCajas]);

  return <div ref={contenedorRef} className="w-full h-full" style={{ cursor: modo === "ubicarNodo" ? "crosshair" : undefined }} />;
}
