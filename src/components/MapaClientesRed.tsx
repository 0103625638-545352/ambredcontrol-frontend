import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { agregarCapasBase } from "../utils/capasMapaBase";
import type { ClienteMapaRed, EstadoRedCliente } from "../api/client";

interface Props {
  clientes: ClienteMapaRed[];
  onSeleccionar?: (cliente: ClienteMapaRed) => void;
  vuelaHaciaId?: number | null;
}

// Color por estado — mismo criterio de severidad que ESTADOS_INFO en
// MapaRedPage.tsx (ahí vive también la etiqueta legible y el orden de la
// leyenda). NODO_CAIDO usa un morado propio a propósito: es un problema
// DISTINTO a que un cliente puntual esté mal (afecta a todo el sector), así
// que conviene que un técnico lo distinga de un vistazo en el mapa.
export const COLOR_POR_ESTADO: Record<EstadoRedCliente, string> = {
  OK: "#059669",
  SENAL_DEBIL: "#d97706",
  LATENCIA_ALTA: "#d97706",
  INESTABLE: "#ea580c",
  SIN_RESPUESTA: "#dc2626",
  ONU_OFFLINE: "#dc2626",
  NODO_CAIDO: "#7c3aed",
  SIN_DATOS: "#9ca3af",
};

// Estados que ameritan el anillo pulsante — todo menos "todo bien" y "no hay
// dato" (no tiene sentido llamar la atención sobre algo que no se puede
// diagnosticar).
export function esAlerta(estado: EstadoRedCliente): boolean {
  return estado !== "OK" && estado !== "SIN_DATOS";
}

// Evita que un dato con caracteres HTML (ej. un nombre con "&" o "<") rompa
// el tooltip — bindTooltip() de Leaflet inserta el string tal cual, sin
// escapar nada por su cuenta.
function escaparHtml(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// "hace X min/h" a partir de una fecha ISO — mismo criterio de redondeo que
// minutosDesde() en routes/mapaRed.ts, solo que acá es puramente para mostrar
// (el estado/prioridad ya lo decidió el backend).
function haceCuanto(fechaIso: string): string {
  const minutos = Math.floor((Date.now() - new Date(fechaIso).getTime()) / 60000);
  if (minutos < 1) return "recién";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  return `hace ${Math.floor(horas / 24)} d`;
}

// Contenido del tooltip de un cliente: el mensaje de mayor prioridad
// (c.detalle, ver calcularEstadoCliente en estadoRedCliente.ts) sigue yendo
// primero porque es la razón real del color del marcador, pero se agregan
// las demás señales crudas (IP, nodo, ONU/potencia óptica, ping) para que el
// técnico no tenga que abrir la ficha del cliente solo para verlas.
function contenidoTooltip(c: ClienteMapaRed): string {
  const lineas = [`<b>${escaparHtml(c.razonSocial)}</b>`, escaparHtml(c.detalle)];

  lineas.push(`IP: ${c.direccionIp ? escaparHtml(c.direccionIp) : "—"}`);
  lineas.push(`Nodo: ${c.nodo ? escaparHtml(c.nodo.nombre) : "—"}`);

  if (c.onu) {
    const rx = c.onu.rxPowerDbm !== null ? `${c.onu.rxPowerDbm} dBm` : "sin lectura";
    lineas.push(`ONU: ${c.onu.estado === "ONLINE" ? "online" : "offline"} · RX ${rx} · ${escaparHtml(c.onu.serial)}`);
  } else {
    lineas.push("ONU: sin vincular");
  }

  if (c.pingMs !== null && c.pingMs !== undefined) {
    const cuando = c.pingUltimaMedicion ? ` (${haceCuanto(c.pingUltimaMedicion)})` : "";
    lineas.push(`Ping: ${c.pingMs} ms${cuando}`);
  } else {
    lineas.push("Ping: sin datos");
  }

  return lineas.join("<br/>");
}

// Mapa de TODOS los clientes con ubicación cargada, coloreados por su estado
// de conexión (ver ClienteMapaRed) — pensado para quedar fijo en una
// pantalla grande de la sala de soporte técnico. Mismo patrón imperativo de
// Leaflet que MapaRuta.tsx (capa de marcadores que se reconstruye cuando
// cambian los datos, sin recrear el mapa entero).
export function MapaClientesRed({ clientes, onSeleccionar, vuelaHaciaId }: Props) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const capaMarcadoresRef = useRef<L.LayerGroup | null>(null);
  const ajustadoInicialRef = useRef(false);

  useEffect(() => {
    if (!contenedorRef.current) return;
    // Centro por defecto: Cuenca (donde opera la empresa principal de este
    // sistema, ver Sucursal.region en schema.prisma) — se reemplaza apenas
    // hay clientes reales con fitBounds más abajo.
    const mapa = L.map(contenedorRef.current).setView([-2.9, -79.0], 12);
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

    for (const c of clientes) {
      const lat = Number(c.latitud);
      const lng = Number(c.longitud);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const color = COLOR_POR_ESTADO[c.estado];
      const anillo = esAlerta(c.estado)
        ? `<span class="marcador-red-anillo" style="border-color:${color}"></span>`
        : "";
      const icono = L.divIcon({
        className: "",
        html: `<div style="position:relative;width:18px;height:18px;">${anillo}<div style="position:absolute;inset:0;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.5)"></div></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });

      const marcador = L.marker([lat, lng], { icon: icono }).addTo(capa);
      marcador.bindTooltip(contenidoTooltip(c));
      if (onSeleccionar) marcador.on("click", () => onSeleccionar(c));
    }

    if (!ajustadoInicialRef.current && clientes.length > 0) {
      const puntos = clientes
        .map((c) => [Number(c.latitud), Number(c.longitud)] as [number, number])
        .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
      if (puntos.length > 0) {
        mapa.fitBounds(L.latLngBounds(puntos), { padding: [40, 40], maxZoom: 15 });
        ajustadoInicialRef.current = true;
      }
    }
  }, [clientes, onSeleccionar]);

  useEffect(() => {
    if (!vuelaHaciaId) return;
    const cliente = clientes.find((c) => c.id === vuelaHaciaId);
    const mapa = mapaRef.current;
    if (!cliente || !mapa) return;
    const lat = Number(cliente.latitud);
    const lng = Number(cliente.longitud);
    if (Number.isFinite(lat) && Number.isFinite(lng)) mapa.flyTo([lat, lng], 17, { duration: 0.75 });
  }, [vuelaHaciaId, clientes]);

  return (
    <>
      <style>{`
        .marcador-red-anillo {
          position: absolute;
          inset: -6px;
          border-radius: 9999px;
          border-width: 2px;
          border-style: solid;
          opacity: 0.7;
          animation: marcador-red-pulso 1.6s ease-out infinite;
        }
        @keyframes marcador-red-pulso {
          0% { transform: scale(0.6); opacity: 0.8; }
          100% { transform: scale(1.8); opacity: 0; }
        }
      `}</style>
      <div ref={contenedorRef} className="w-full h-full" />
    </>
  );
}
