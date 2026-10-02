import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type ClienteMapaRed, type EstadoRedCliente } from "../api/client";
import { MapaClientesRed, COLOR_POR_ESTADO, esAlerta } from "../components/MapaClientesRed";
import { VistaPuertoOlt } from "../components/VistaPuertoOlt";
import { FormularioVisitaUrgente } from "../components/FormularioVisitaUrgente";
import { useToast } from "../components/ToastProvider";
import { usePermiso } from "../context/AuthContext";
import { useFiltrosListado, BarraBuscadorDocumentos, filtrarLocal, sinPaginacion } from "../components/BuscadorDocumentos";
import { Segmentado, Resaltar } from "../components/FormatoDocumento";

// Cada cuántos segundos se refresca el mapa — el ping y la sincronización de
// OLT ya corren solos cada 2-5 min en el backend (ver jobs/pingClientes.ts y
// jobs/pollingOlt.ts), esto solo controla qué tan seguido esta pantalla va a
// buscar el resultado ya calculado.
const INTERVALO_REFRESCO_MS = 20_000;

const ETIQUETA_POR_ESTADO: Record<EstadoRedCliente, string> = {
  OK: "Normal",
  SENAL_DEBIL: "Señal óptica débil",
  LATENCIA_ALTA: "Latencia alta",
  INESTABLE: "Conexión inestable",
  SIN_RESPUESTA: "Sin respuesta a ping",
  ONU_OFFLINE: "ONU offline",
  NODO_CAIDO: "Nodo caído",
  SIN_DATOS: "Sin datos",
};

// Orden de severidad para la lista lateral — un corte de nodo entero
// primero (afecta a muchos clientes de golpe), después problemas puntuales
// de un cliente, de más a menos grave.
const SEVERIDAD: Record<EstadoRedCliente, number> = {
  NODO_CAIDO: 0,
  ONU_OFFLINE: 1,
  SIN_RESPUESTA: 1,
  INESTABLE: 2,
  SENAL_DEBIL: 3,
  LATENCIA_ALTA: 3,
  SIN_DATOS: 9,
  OK: 9,
};

const ESTADOS_LEYENDA: EstadoRedCliente[] = ["OK", "SENAL_DEBIL", "LATENCIA_ALTA", "INESTABLE", "SIN_RESPUESTA", "ONU_OFFLINE", "NODO_CAIDO"];

export function MapaRedPage() {
  const { mostrarToast } = useToast();
  const puedeOlt = usePermiso("olt");
  const puedeVisitasEditar = usePermiso("visitas_editar");
  const [vista, setVista] = useState<"mapa" | "puerto">("mapa");
  const [vuelaHaciaId, setVuelaHaciaId] = useState<number | null>(null);
  const [clienteParaVisita, setClienteParaVisita] = useState<ClienteMapaRed | null>(null);
  const idsAlertaAnteriorRef = useRef<Set<number> | null>(null);

  const { data: clientes, isLoading } = useQuery({
    queryKey: ["mapa-red-clientes"],
    queryFn: async () => (await api.get<ClienteMapaRed[]>("/mapa-red/clientes")).data,
    refetchInterval: INTERVALO_REFRESCO_MS,
  });

  // Aviso tipo "volante" cuando un cliente que estaba bien pasa a un estado
  // de alerta entre un refresco y el siguiente — no se avisa en la primera
  // carga de la pantalla (ahí ya se ve todo en la lista lateral, avisar de
  // entrada sería puro ruido).
  useEffect(() => {
    if (!clientes) return;
    const idsAlertaActual = new Set(clientes.filter((c) => esAlerta(c.estado)).map((c) => c.id));

    if (idsAlertaAnteriorRef.current) {
      for (const c of clientes) {
        if (esAlerta(c.estado) && !idsAlertaAnteriorRef.current.has(c.id)) {
          mostrarToast(`${c.razonSocial}: ${c.detalle}`, "error");
        }
      }
    }
    idsAlertaAnteriorRef.current = idsAlertaActual;
  }, [clientes, mostrarToast]);

  // Buscador compartido de los listados (en el navegador: la lista ya viene
  // completa) — filtra A LA VEZ los clientes del mapa y la lista lateral.
  const filtros = useFiltrosListado(sinPaginacion);
  const clientesFiltrados =
    filtrarLocal(clientes, filtros, {
      textos: (c) => [c.razonSocial, c.identificacion, c.direccionIp, c.detalle, c.nodo?.nombre, c.onu?.serial],
      estado: (c) => c.estado,
    }) ?? [];
  const alertas = clientesFiltrados
    .filter((c) => esAlerta(c.estado))
    .sort((a, b) => SEVERIDAD[a.estado] - SEVERIDAD[b.estado]);
  const totalAlertas = (clientes ?? []).filter((c) => esAlerta(c.estado)).length;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-stone-300 dark:border-gray-700">
        <div className="flex flex-wrap items-center gap-4">
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-50">Mapa de red</h2>
          {puedeOlt && (
            <Segmentado
              opciones={[
                { valor: "mapa", etiqueta: "Mapa geográfico" },
                { valor: "puerto", etiqueta: "Vista por puerto GPON" },
              ]}
              valor={vista}
              onCambiar={setVista}
            />
          )}
        </div>
        <span className="font-mono text-[11px] text-gray-400 dark:text-gray-500">
          {clientes ? `${clientes.length} cliente${clientes.length === 1 ? "" : "s"} · ` : ""}
          {clientes ? (
            <span className={totalAlertas > 0 ? "text-red-600 dark:text-red-400" : ""}>
              {totalAlertas} con problemas
            </span>
          ) : null}
        </span>
      </div>
      <div className="px-4 py-2 bg-stone-50 dark:bg-gray-900/40 border-b border-stone-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
        Estado de conexión de todos los clientes con ubicación cargada — combina ping, estado/señal de la ONU en la OLT y el pulso del
        Mikrotik de cada nodo. Se actualiza solo cada {INTERVALO_REFRESCO_MS / 1000} s.
      </div>

      {vista === "mapa" && (
        <>
          <BarraBuscadorDocumentos
            filtros={filtros}
            etiquetaBusqueda="Buscar · cliente, cédula/RUC, IP, nodo, serial de ONU o detalle"
            placeholder="Ej: Pérez, 10.10.1.25, Nodo Norte..."
            opcionesEstado={ESTADOS_LEYENDA.map((estado) => ({ valor: estado, etiqueta: ETIQUETA_POR_ESTADO[estado] }))}
            mostrarPago={false}
            mostrarFechas={false}
          />
          <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2 border-b border-stone-200 dark:border-gray-700">
            {ESTADOS_LEYENDA.map((estado) => (
              <span
                key={estado}
                className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400"
              >
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: COLOR_POR_ESTADO[estado] }} />
                {ETIQUETA_POR_ESTADO[estado]}
              </span>
            ))}
          </div>

          {isLoading && <p className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">Cargando...</p>}

          <div className="flex-1 min-h-0 flex">
            <div className="flex-1 overflow-hidden">
              <MapaClientesRed
                clientes={clientesFiltrados}
                vuelaHaciaId={vuelaHaciaId}
                onSeleccionar={(c) => {
                  setVuelaHaciaId(c.id);
                  // Un clic sobre un cliente CAÍDO abre directamente el
                  // formulario de visita prioritaria — sobre uno OK, un clic
                  // solo centra el mapa ahí (comportamiento de antes).
                  if (esAlerta(c.estado) && puedeVisitasEditar) setClienteParaVisita(c);
                }}
              />
            </div>

            <div className="w-72 shrink-0 border-l border-stone-300 dark:border-gray-700 overflow-y-auto">
              <h3 className="sticky top-0 px-3 py-2.5 bg-stone-50 dark:bg-gray-900 border-b border-stone-300 dark:border-gray-700 font-mono text-[10.5px] uppercase tracking-[0.15em] text-gray-600 dark:text-gray-300">
                Clientes con problemas ({alertas.length})
              </h3>
              {alertas.length === 0 && (
                <p className="px-3 py-3 text-xs text-gray-400 dark:text-gray-500">
                  {filtros.hayFiltros && totalAlertas > 0 ? "Ningún cliente con problemas coincide con la búsqueda." : "Todo en orden por ahora"}
                </p>
              )}
              <ul>
                {alertas.map((c) => (
                  <li key={c.id} className="border-b border-stone-100 dark:border-gray-700/60">
                    <button
                      onClick={() => setVuelaHaciaId(c.id)}
                      className="w-full text-left px-3 py-2 hover:bg-stone-50 dark:hover:bg-gray-700/40 border-l-4"
                      style={{ borderColor: COLOR_POR_ESTADO[c.estado] }}
                    >
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                        <Resaltar texto={c.razonSocial} termino={filtros.busquedaAplicada} />
                      </p>
                      <p className="font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {ETIQUETA_POR_ESTADO[c.estado]}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        <Resaltar texto={c.detalle} termino={filtros.busquedaAplicada} />
                      </p>
                    </button>
                    {puedeVisitasEditar && (
                      <button
                        onClick={() => setClienteParaVisita(c)}
                        className="mx-3 mb-2 text-xs font-semibold text-brand-700 dark:text-brand-300 hover:underline"
                      >
                        Crear visita técnica prioritaria
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {clienteParaVisita && (
            <div className="p-3 border-t border-stone-300 dark:border-gray-700">
              <FormularioVisitaUrgente cliente={clienteParaVisita} onCerrar={() => setClienteParaVisita(null)} />
            </div>
          )}
        </>
      )}

      {vista === "puerto" && puedeOlt && (
        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          <VistaPuertoOlt />
        </div>
      )}
    </div>
  );
}
