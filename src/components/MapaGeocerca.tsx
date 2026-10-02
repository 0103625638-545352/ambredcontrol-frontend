import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { agregarCapasBase } from "../utils/capasMapaBase";

interface Props {
  latitud: string;
  longitud: string;
  radioMetros: string;
  onCambiarUbicacion: (lat: string, lng: string) => void;
  // Alto en px del mapa — opcional, cada pantalla que lo usa (Ajustes para
  // la geocerca de una sucursal, Visitas Técnicas para ubicar una parada)
  // puede pedir un tamaño distinto sin afectar a la otra.
  alturaPx?: number;
}

const ELEMENTO_ID_PREFIJO = "mapa-geocerca-";

// Cuenca, Ecuador — centro por defecto cuando la sucursal todavía no tiene
// geocerca configurada (la empresa "principal" de este sistema opera ahí).
const CENTRO_DEFECTO: [number, number] = [-2.9, -79.0];
const ZOOM_DEFECTO = 15;
const ZOOM_SIN_UBICACION = 12;

// Mapa interactivo (OpenStreetMap + Leaflet) para configurar la geocerca de
// una sucursal — reemplaza los inputs planos de latitud/longitud (ver
// pages/AjustesPage.tsx). Se integra IMPERATIVAMENTE con refs, mismo
// criterio que ya usa components/EscanerCodigoBarras.tsx para html5-qrcode
// (la única otra librería JS no-React de este proyecto): se crea una sola
// vez al montar y se destruye al desmontar; los cambios de props (lat/lng/
// radio) se reflejan moviendo el marcador/círculo YA existentes, sin
// recrear el mapa completo.
//
// A propósito NO permite redimensionar el círculo arrastrando su borde —
// eso exigiría un plugin adicional (ej. Leaflet.Editable), fuera de
// alcance de esta ronda. El radio se sigue editando con el input numérico
// de al lado; el mapa solo lo VISUALIZA.
export function MapaGeocerca({ latitud, longitud, radioMetros, onCambiarUbicacion, alturaPx = 280 }: Props) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const marcadorRef = useRef<L.Marker | null>(null);
  const circuloRef = useRef<L.Circle | null>(null);
  // El callback más reciente, para que el listener de "click"/"dragend"
  // (registrado una sola vez al montar) siempre llame a la versión vigente
  // sin tener que recrear el mapa cada vez que el padre re-renderiza.
  const onCambiarUbicacionRef = useRef(onCambiarUbicacion);
  onCambiarUbicacionRef.current = onCambiarUbicacion;

  const elementoId = useRef(`${ELEMENTO_ID_PREFIJO}${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    if (!contenedorRef.current) return;

    const latInicial = parseFloat(latitud);
    const lngInicial = parseFloat(longitud);
    const tieneUbicacion = !Number.isNaN(latInicial) && !Number.isNaN(lngInicial);
    const centro: [number, number] = tieneUbicacion ? [latInicial, lngInicial] : CENTRO_DEFECTO;

    const mapa = L.map(contenedorRef.current).setView(centro, tieneUbicacion ? ZOOM_DEFECTO : ZOOM_SIN_UBICACION);
    mapaRef.current = mapa;

    agregarCapasBase(mapa);

    const marcador = L.marker(centro, { draggable: true }).addTo(mapa);
    marcadorRef.current = marcador;

    const radioInicial = parseFloat(radioMetros);
    const circulo = L.circle(centro, {
      radius: !Number.isNaN(radioInicial) && radioInicial > 0 ? radioInicial : 0,
      color: "#0284c7",
      fillColor: "#0284c7",
      fillOpacity: 0.15,
    }).addTo(mapa);
    circuloRef.current = circulo;

    marcador.on("dragend", () => {
      const { lat, lng } = marcador.getLatLng();
      circulo.setLatLng(marcador.getLatLng());
      onCambiarUbicacionRef.current(lat.toFixed(6), lng.toFixed(6));
    });

    mapa.on("click", (e: L.LeafletMouseEvent) => {
      marcador.setLatLng(e.latlng);
      circulo.setLatLng(e.latlng);
      onCambiarUbicacionRef.current(e.latlng.lat.toFixed(6), e.latlng.lng.toFixed(6));
    });

    return () => {
      mapa.remove();
      mapaRef.current = null;
    };
    // Se crea una sola vez — los cambios posteriores de latitud/longitud/
    // radioMetros se aplican en el efecto de abajo, sin recrear el mapa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sincroniza el marcador/círculo cuando las props cambian por una vía
  // DISTINTA al mapa mismo (ej. el input numérico de radio, o "Usar mi
  // ubicación actual") — mover el marcador/círculo a la misma posición que
  // ya tienen (ej. tras un click en el propio mapa) es un no-op visual.
  useEffect(() => {
    const marcador = marcadorRef.current;
    const circulo = circuloRef.current;
    if (!marcador || !circulo) return;

    const lat = parseFloat(latitud);
    const lng = parseFloat(longitud);
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      marcador.setLatLng([lat, lng]);
      circulo.setLatLng([lat, lng]);
      // Centra la vista en el nuevo punto — necesario cuando lat/lng llegan
      // de afuera (ej. se autocompletó con la ubicación guardada del
      // cliente) y el mapa seguía centrado en Cuenca por defecto; para un
      // click/arrastre del propio mapa esto es un no-op o un ajuste mínimo.
      mapaRef.current?.setView([lat, lng], mapaRef.current.getZoom());
    }

    const radio = parseFloat(radioMetros);
    circulo.setRadius(!Number.isNaN(radio) && radio > 0 ? radio : 0);
  }, [latitud, longitud, radioMetros]);

  return <div id={elementoId.current} ref={contenedorRef} className="rounded-md overflow-hidden" style={{ height: alturaPx }} />;
}
