import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Search, MapPin, Wifi } from "lucide-react";
import { api, type Cliente, type VisitaHistorialCliente } from "../../api/client";
import { useDebounce } from "../../hooks/useDebounce";
import { MapaPunto } from "../../components/MapaPunto";

// Buscador de clientes + ficha de SOLO LECTURA para el técnico en campo.
// Reusa exactamente los mismos endpoints abiertos (solo requireAuth) que el
// BuscadorCliente del escritorio: GET /clientes?q= y
// GET /clientes/:id/historial-visitas (ver backend/src/routes/clientes.ts).
export function ClienteMovil() {
  const [texto, setTexto] = useState("");
  const [seleccionado, setSeleccionado] = useState<Cliente | null>(null);
  const textoDebounced = useDebounce(texto);

  const { data: resultados, isFetching } = useQuery({
    queryKey: ["clientes-buscador-movil", textoDebounced],
    queryFn: async () => (await api.get<Cliente[]>("/clientes", { params: { q: textoDebounced } })).data,
    enabled: textoDebounced.trim().length >= 2 && !seleccionado,
  });

  if (seleccionado) {
    return <FichaCliente cliente={seleccionado} onVolver={() => setSeleccionado(null)} />;
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          inputMode="search"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar por nombre, cédula o RUC"
          className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-sm pl-9 pr-3 py-3 text-base"
        />
      </div>

      {texto.trim().length > 0 && texto.trim().length < 2 && (
        <p className="text-sm text-gray-400 dark:text-gray-500">Escribe al menos 2 caracteres.</p>
      )}
      {isFetching && <p className="text-sm text-gray-400 dark:text-gray-500">Buscando...</p>}
      {resultados && resultados.length === 0 && textoDebounced.trim().length >= 2 && !isFetching && (
        <p className="text-sm text-gray-400 dark:text-gray-500">Ningún cliente coincide.</p>
      )}

      <ul className="space-y-2">
        {resultados?.map((c) => (
          <li key={c.id}>
            <button
              onClick={() => setSeleccionado(c)}
              className="w-full text-left bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700 rounded-sm p-3 active:bg-stone-50 dark:active:bg-gray-700/50"
            >
              <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{c.razonSocial}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {c.identificacion}
                {c.planInternet ? ` · ${c.planInternet.nombre}` : ""}
              </p>
              {c.direccion && <p className="text-xs text-gray-400 dark:text-gray-500">{c.direccion}</p>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FichaCliente({ cliente, onVolver }: { cliente: Cliente; onVolver: () => void }) {
  const { data: visitas } = useQuery({
    queryKey: ["cliente-historial-visitas-movil", cliente.id],
    queryFn: async () => (await api.get<VisitaHistorialCliente[]>(`/clientes/${cliente.id}/historial-visitas`)).data,
  });

  const equipos = (visitas ?? []).flatMap((v) =>
    v.equiposDejados.map((e) => ({ ...e, fecha: v.rutaVisita.fecha }))
  );

  const lat = cliente.latitud ? Number(cliente.latitud) : null;
  const lng = cliente.longitud ? Number(cliente.longitud) : null;

  return (
    <div className="space-y-3">
      <button onClick={onVolver} className="flex items-center gap-1.5 text-sm font-medium text-brand-700 dark:text-brand-300">
        <ArrowLeft className="w-4 h-4" />
        Volver a la búsqueda
      </button>

      <div className="bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700 rounded-sm p-4 space-y-1">
        <p className="text-base font-semibold text-gray-800 dark:text-gray-100">{cliente.razonSocial}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">{cliente.tipoIdentificacion} · {cliente.identificacion}</p>
        {cliente.telefono && (
          <p className="text-sm">
            <a href={`tel:${cliente.telefono}`} className="text-brand-700 dark:text-brand-300 font-medium">
              {cliente.telefono}
            </a>
          </p>
        )}
        {cliente.direccion && <p className="text-sm text-gray-600 dark:text-gray-300">{cliente.direccion}</p>}
      </div>

      <div className="bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700 rounded-sm p-4 space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
          <Wifi className="w-3.5 h-3.5" /> Servicio de internet
        </p>
        <p className="text-sm text-gray-700 dark:text-gray-200">
          Plan: {cliente.planInternet ? `${cliente.planInternet.nombre} (${cliente.planInternet.velocidadBajada}/${cliente.planInternet.velocidadSubida})` : "—"}
        </p>
        <p className="text-sm text-gray-700 dark:text-gray-200 font-mono">IP: {cliente.direccionIp ?? "—"}</p>
        <p className="text-sm text-gray-700 dark:text-gray-200">Nodo: {cliente.nodo?.nombre ?? "—"}</p>
      </div>

      {lat != null && lng != null ? (
        <div className="bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700 rounded-sm overflow-hidden">
          <MapaPunto latitud={lat} longitud={lng} etiqueta={cliente.razonSocial} alturaPx={220} />
        </div>
      ) : (
        <p className="text-sm text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
          <MapPin className="w-4 h-4" /> Sin ubicación guardada.
        </p>
      )}

      <div className="bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700 rounded-sm p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
          Equipos instalados ({equipos.length})
        </p>
        {equipos.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">Ninguno registrado en visitas anteriores.</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {equipos.map((e) => (
              <li key={e.id} className="py-2">
                <p className="text-sm text-gray-800 dark:text-gray-100">
                  {e.tipo}
                  {e.modelo ? ` · ${e.modelo}` : ""}
                </p>
                {e.serial && <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{e.serial}</p>}
                <p className="text-xs text-gray-400 dark:text-gray-500">Dejado el {e.fecha.slice(0, 10)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
