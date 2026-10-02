import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type UbicacionActualTecnico, type PuntoRecorridoTecnico, type EstadoUbicacionTecnico } from "../api/client";
import { MapaTecnicos, COLOR_POR_ESTADO_TECNICO } from "../components/MapaTecnicos";
import { useFiltrosListado, BarraBuscadorDocumentos, filtrarLocal, sinPaginacion } from "../components/BuscadorDocumentos";
import { Resaltar } from "../components/FormatoDocumento";

// Cada cuántos segundos se refresca la última posición de todos — el
// celular de cada técnico ya manda una lectura cada 2 min por su cuenta
// (ver hooks/useUbicacionTecnico.ts), esto solo controla qué tan seguido
// esta pantalla va a buscar el resultado ya guardado.
const INTERVALO_REFRESCO_MS = 30_000;

const ETIQUETA_POR_ESTADO: Record<EstadoUbicacionTecnico, string> = {
  EN_LINEA: "En línea",
  RECIENTE: "Reciente",
  DESCONECTADO: "Desconectado",
  SIN_DATOS: "Sin datos",
};

const ESTADOS_LEYENDA: EstadoUbicacionTecnico[] = ["EN_LINEA", "RECIENTE", "DESCONECTADO"];

function haceCuanto(minutos: number): string {
  if (minutos < 1) return "recién";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  return `hace ${Math.floor(horas / 24)} d`;
}

// Mapa en vivo de dónde está cada técnico (según el GPS de su celular
// propiedad de la empresa) — pensado para dirigir eventos/emergencias sin
// tener que llamar uno por uno a preguntar dónde está cada quién, y de paso
// saber dónde anda cada vehículo (ver Vehiculo/UsoVehiculo: se muestra el
// que el técnico tiene EN_USO hoy, si tiene uno). Solo puede rastrear
// mientras el técnico tiene la app abierta — un navegador no puede mandar
// ubicación con la app cerrada o el celular bloqueado, eso solo lo hace una
// app nativa (ver hooks/useUbicacionTecnico.ts).
export function LocalizacionTecnicosPage() {
  const [vuelaHaciaId, setVuelaHaciaId] = useState<number | null>(null);
  const [seleccionadoId, setSeleccionadoId] = useState<number | null>(null);

  const { data: tecnicos, isLoading } = useQuery({
    queryKey: ["ubicaciones-tecnicos-actual"],
    queryFn: async () => (await api.get<UbicacionActualTecnico[]>("/ubicaciones-tecnicos/actual")).data,
    refetchInterval: INTERVALO_REFRESCO_MS,
  });

  const { data: recorrido } = useQuery({
    queryKey: ["ubicaciones-tecnicos-recorrido", seleccionadoId],
    queryFn: async () =>
      (await api.get<PuntoRecorridoTecnico[]>(`/ubicaciones-tecnicos/${seleccionadoId}/recorrido`)).data,
    enabled: seleccionadoId !== null,
  });

  function seleccionar(t: UbicacionActualTecnico) {
    setVuelaHaciaId(t.empleadoId);
    setSeleccionadoId(t.empleadoId === seleccionadoId ? null : t.empleadoId);
  }

  // Buscador compartido de los listados (en el navegador: la lista ya viene
  // completa) — filtra A LA VEZ la lista lateral y los puntos del mapa.
  const filtros = useFiltrosListado(sinPaginacion);
  const ordenados =
    filtrarLocal([...(tecnicos ?? [])].sort((a, b) => a.minutos - b.minutos), filtros, {
      textos: (t) => [t.nombre, t.vehiculo?.placa, t.vehiculo?.marca.nombre, t.vehiculo?.modelo.nombre],
      estado: (t) => t.estado,
    }) ?? [];
  const enLinea = (tecnicos ?? []).filter((t) => t.estado === "EN_LINEA").length;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-stone-300 dark:border-gray-700">
        <h2 className="text-base font-bold text-gray-900 dark:text-gray-50">Localización de técnicos</h2>
        <div className="flex flex-wrap items-center gap-4">
          {ESTADOS_LEYENDA.map((estado) => (
            <span
              key={estado}
              className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400"
            >
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: COLOR_POR_ESTADO_TECNICO[estado] }} />
              {ETIQUETA_POR_ESTADO[estado]}
            </span>
          ))}
          <span className="font-mono text-[11px] text-gray-400 dark:text-gray-500">
            {tecnicos ? `${tecnicos.length} técnico${tecnicos.length === 1 ? "" : "s"} · ${enLinea} en línea` : ""}
          </span>
        </div>
      </div>
      <div className="px-4 py-2 bg-stone-50 dark:bg-gray-900/40 border-b border-stone-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
        Última posición del celular de cada técnico (mientras tiene la app abierta) y el vehículo que tiene a cargo hoy, si tiene uno. Se
        actualiza solo cada {INTERVALO_REFRESCO_MS / 1000} s. Hacé clic en un técnico para ver su recorrido del día.
      </div>

      <BarraBuscadorDocumentos
        filtros={filtros}
        etiquetaBusqueda="Buscar · técnico, placa o vehículo"
        placeholder="Ej: Pérez, ABC-1234, Hilux..."
        opcionesEstado={[
          { valor: "EN_LINEA", etiqueta: "En línea" },
          { valor: "RECIENTE", etiqueta: "Reciente" },
          { valor: "DESCONECTADO", etiqueta: "Desconectado" },
          { valor: "SIN_DATOS", etiqueta: "Sin datos" },
        ]}
        mostrarPago={false}
        mostrarFechas={false}
      />

      {isLoading && <p className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">Cargando...</p>}

      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 overflow-hidden">
          <MapaTecnicos tecnicos={ordenados} recorrido={seleccionadoId ? recorrido : undefined} vuelaHaciaId={vuelaHaciaId} onSeleccionar={seleccionar} />
        </div>

        <div className="w-72 shrink-0 border-l border-stone-300 dark:border-gray-700 overflow-y-auto">
          <h3 className="sticky top-0 px-3 py-2.5 bg-stone-50 dark:bg-gray-900 border-b border-stone-300 dark:border-gray-700 font-mono text-[10.5px] uppercase tracking-[0.15em] text-gray-600 dark:text-gray-300">
            Técnicos ({ordenados.length})
          </h3>
          {ordenados.length === 0 && (
            <p className="px-3 py-3 text-xs text-gray-400 dark:text-gray-500">
              {tecnicos?.length
                ? "Ningún técnico coincide con la búsqueda."
                : "Todavía no hay ninguna posición reportada — se necesita que un técnico abra la app móvil al menos una vez."}
            </p>
          )}
          <ul>
            {ordenados.map((t) => (
              <li key={t.empleadoId} className="border-b border-stone-100 dark:border-gray-700/60">
                <button
                  onClick={() => seleccionar(t)}
                  className={`w-full text-left px-3 py-2 hover:bg-stone-50 dark:hover:bg-gray-700/40 border-l-4 ${
                    seleccionadoId === t.empleadoId ? "bg-brand-50 dark:bg-brand-900/20" : ""
                  }`}
                  style={{ borderColor: COLOR_POR_ESTADO_TECNICO[t.estado] }}
                >
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                    <Resaltar texto={t.nombre} termino={filtros.busquedaAplicada} />
                  </p>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    {ETIQUETA_POR_ESTADO[t.estado]} · {haceCuanto(t.minutos)}
                  </p>
                  {t.vehiculo && (
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      <span className="font-mono">
                        <Resaltar texto={t.vehiculo.placa} termino={filtros.busquedaAplicada} />
                      </span>{" "}
                      — {t.vehiculo.marca.nombre} {t.vehiculo.modelo.nombre}
                    </p>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
