import { useState } from "react";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import {
  api,
  type Empleado,
  type Cliente,
  type RutaVisita,
  type RespuestaPaginada,
  type EquipoInstaladoBusqueda,
} from "../api/client";
import { useAuth, usePermiso } from "../context/AuthContext";
import { useToast } from "../components/ToastProvider";
import { useDebounce } from "../hooks/useDebounce";
import { useSincronizarAccionesPendientes } from "../hooks/useSincronizarAccionesPendientes";
import { agregarAccionPendiente } from "../utils/colaOffline";
import { BuscadorCliente } from "../components/BuscadorCliente";
import { CampoPegarUbicacion } from "../components/CampoPegarUbicacion";
import { MapaGeocerca } from "../components/MapaGeocerca";
import { MapaRuta, type ParadaMapa } from "../components/MapaRuta";
import { Paginacion } from "../components/Paginacion";
import { DetalleTrabajoVisita } from "../components/DetalleTrabajoVisita";
import { TarjetaVisitaDetalle } from "../components/TarjetaVisitaDetalle";

const ETIQUETA_ESTADO: Record<string, string> = {
  PENDIENTE: "Pendiente",
  COMPLETADA: "Completada",
  OMITIDA: "Omitida",
};

const CLASE_ESTADO: Record<string, string> = {
  PENDIENTE: "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300",
  COMPLETADA: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
  OMITIDA: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300",
};

// A diferencia de obtenerUbicacion() en FormularioMarcacion.tsx (donde no
// tener GPS no bloquea marcar asistencia), acá la ubicación real de llegada
// SÍ es obligatoria — es el dato que justifica todo el módulo (confirmar que
// la visita ocurrió en el punto correcto). Si no se puede obtener, se avisa
// y no se manda el PATCH.
function obtenerUbicacionObligatoria(): Promise<{ latitud: number; longitud: number } | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) {
      resolve(null);
      return;
    }
    let resuelto = false;
    const terminar = (valor: { latitud: number; longitud: number } | null) => {
      if (resuelto) return;
      resuelto = true;
      resolve(valor);
    };
    const timeoutId = setTimeout(() => terminar(null), 10000);
    navigator.geolocation.getCurrentPosition(
      (posicion) => {
        clearTimeout(timeoutId);
        terminar({ latitud: posicion.coords.latitude, longitud: posicion.coords.longitude });
      },
      () => {
        clearTimeout(timeoutId);
        terminar(null);
      },
      { enableHighAccuracy: true, timeout: 9000 }
    );
  });
}

// "Mi ruta de hoy" — cualquier Usuario con empleadoId vinculado (ver select
// en UsuariosPage.tsx) ve acá SOLO sus propias paradas del día, sin
// necesitar el permiso "visitas" (ver backend/src/routes/visitas.ts).
function SeccionMiRuta() {
  const { mostrarToast } = useToast();
  const queryClient = useQueryClient();
  const [observaciones, setObservaciones] = useState<Record<number, string>>({});
  const { pendientes, sincronizarAhora, refrescarPendientes } = useSincronizarAccionesPendientes();

  const { data: ruta, isLoading } = useQuery({
    queryKey: ["mi-ruta-hoy"],
    queryFn: async () => (await api.get<RutaVisita | null>("/visitas/mi-ruta-hoy")).data,
  });

  const marcarLlegada = useMutation({
    mutationFn: async (visitaId: number) => {
      const ubicacion = await obtenerUbicacionObligatoria();
      if (!ubicacion) {
        throw new Error("No se pudo obtener tu ubicación. Activa el GPS y el permiso de ubicación del navegador e intenta de nuevo.");
      }
      try {
        return { ...(await api.patch<{ ubicacionClienteActualizada: boolean }>(`/visitas/${visitaId}/llegada`, ubicacion)).data, encolada: false as const };
      } catch (error: any) {
        // Sin error.response = no llegó al servidor (sin señal) — se guarda
        // para reintentar solo, en vez de perder el "Llegué" del técnico.
        if (!error.response) {
          agregarAccionPendiente("llegada", visitaId, ubicacion);
          refrescarPendientes();
          return { ubicacionClienteActualizada: false, encolada: true as const };
        }
        throw error;
      }
    },
    onSuccess: (resultado) => {
      if (resultado.encolada) {
        mostrarToast("Sin señal — la llegada se guardó en este dispositivo y se enviará sola cuando vuelva la conexión", "success");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["mi-ruta-hoy"] });
      if (resultado.ubicacionClienteActualizada) {
        queryClient.invalidateQueries({ queryKey: ["clientes"] }); // la ficha del cliente ya tiene la ubicación nueva
      }
      mostrarToast(
        resultado.ubicacionClienteActualizada
          ? "Llegada registrada — se actualizó la ubicación guardada del cliente"
          : "Llegada registrada",
        "success"
      );
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? error.message ?? "Error al registrar la llegada"),
  });

  const omitirVisita = useMutation({
    mutationFn: async (visitaId: number) => {
      const payload = { observaciones: observaciones[visitaId]?.trim() || undefined };
      try {
        await api.patch(`/visitas/${visitaId}/omitir`, payload);
        return { encolada: false };
      } catch (error: any) {
        if (!error.response) {
          agregarAccionPendiente("omitir", visitaId, payload);
          refrescarPendientes();
          return { encolada: true };
        }
        throw error;
      }
    },
    onSuccess: (resultado) => {
      if (resultado.encolada) {
        mostrarToast("Sin señal — se guardó en este dispositivo y se enviará sola cuando vuelva la conexión", "success");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["mi-ruta-hoy"] });
      mostrarToast("Visita omitida", "success");
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al omitir la visita"),
  });

  return (
    <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 p-4 mb-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Mi ruta de hoy</h3>
        {pendientes.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
              🕓 {pendientes.length} acción(es) pendiente(s) de sincronizar
            </span>
            <button
              onClick={() => sincronizarAhora()}
              className="text-xs font-medium text-slate-700 dark:text-slate-300 hover:underline"
            >
              Reintentar ahora
            </button>
          </div>
        )}
      </div>

      {isLoading && <p className="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>}
      {!isLoading && !ruta && (
        <p className="text-sm text-gray-400 dark:text-gray-500">No tienes una ruta planificada para hoy.</p>
      )}

      {ruta && (
        <>
          <MapaRuta
            alturaPx={520}
            paradas={ruta.visitas.map(
              (v): ParadaMapa => ({
                id: v.id,
                lat: Number(v.latitud),
                lng: Number(v.longitud),
                orden: v.orden,
                estado: v.estado,
                etiqueta: v.nombreContacto,
              })
            )}
          />
          <ul className="divide-y divide-gray-100 dark:divide-gray-700 mt-3">
            {ruta.visitas.map((v) => {
              const pendienteLocal = pendientes.some((p) => p.visitaId === v.id);
              return (
              <li key={v.id} className={`py-3 ${v.esUrgente ? "bg-red-50 dark:bg-red-900/10 -mx-4 px-4" : ""}`}>
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                      {v.esUrgente && <span className="text-red-600 dark:text-red-400 mr-1">🚨 Urgente —</span>}
                      {v.orden}. {v.nombreContacto}
                    </p>
                    {v.direccion && <p className="text-xs text-gray-500 dark:text-gray-400">{v.direccion}</p>}
                    {v.estado === "COMPLETADA" && v.distanciaAlPunto && (
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        Llegada a {Number(v.distanciaAlPunto).toFixed(0)} m del punto planeado
                      </p>
                    )}
                    {v.estado === "OMITIDA" && v.observaciones && (
                      <p className="text-xs text-gray-400 dark:text-gray-500">Motivo: {v.observaciones}</p>
                    )}
                    {pendienteLocal && (
                      <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mt-0.5">🕓 Pendiente de sincronizar</p>
                    )}
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium shrink-0 ${CLASE_ESTADO[v.estado]}`}>
                    {ETIQUETA_ESTADO[v.estado]}
                  </span>
                </div>
                {v.estado === "PENDIENTE" && !pendienteLocal && (
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <button
                      onClick={() => marcarLlegada.mutate(v.id)}
                      disabled={marcarLlegada.isPending}
                      className="bg-brand-600 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-brand-700 disabled:opacity-50"
                    >
                      {marcarLlegada.isPending ? "Ubicando..." : "Llegué"}
                    </button>
                    <input
                      type="text"
                      placeholder="Motivo si la omites (opcional)"
                      value={observaciones[v.id] ?? ""}
                      onChange={(e) => setObservaciones({ ...observaciones, [v.id]: e.target.value })}
                      className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1.5 text-xs flex-1 min-w-[160px]"
                    />
                    <button
                      onClick={() => omitirVisita.mutate(v.id)}
                      disabled={omitirVisita.isPending}
                      className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-1.5 rounded-md text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
                    >
                      Omitir
                    </button>
                  </div>
                )}
                {v.estado === "COMPLETADA" && <DetalleTrabajoVisita visita={v} />}
              </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

interface ParadaForm {
  key: string;
  modo: "cliente" | "libre";
  clienteId: number | "";
  clienteSeleccionado: Cliente | null;
  nombreContacto: string;
  direccion: string;
  lat: string;
  lng: string;
}

function paradaVacia(): ParadaForm {
  return {
    key: Math.random().toString(36).slice(2),
    modo: "cliente",
    clienteId: "",
    clienteSeleccionado: null,
    nombreContacto: "",
    direccion: "",
    lat: "",
    lng: "",
  };
}

// Campos para armar UNA parada (cliente existente o contacto libre + mapa) —
// compartido entre "Agregar parada" (armar una ruta nueva) y "Agregar visita
// urgente" (sumarle una parada de última hora a una ruta que ya existía).
function CamposParada({
  valor,
  onCambiar,
  alturaMapa = 380,
}: {
  valor: ParadaForm;
  onCambiar: (p: ParadaForm) => void;
  alturaMapa?: number;
}) {
  return (
    <>
      <div className="flex gap-3 mb-2 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={valor.modo === "cliente"} onChange={() => onCambiar({ ...valor, modo: "cliente" })} />
          Cliente existente
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={valor.modo === "libre"} onChange={() => onCambiar({ ...valor, modo: "libre" })} />
          Contacto libre (prospecto)
        </label>
      </div>

      {valor.modo === "cliente" ? (
        <>
          <BuscadorCliente
            clienteId={valor.clienteId}
            onSeleccionar={(id, cliente) =>
              onCambiar({
                ...valor,
                clienteId: id,
                clienteSeleccionado: cliente ?? null,
                // Si el cliente ya tiene una ubicación guardada (ver
                // Cliente.latitud/longitud), se autocompleta acá — evita
                // que el despachador tenga que volver a buscarla en el
                // mapa cada vez que ya la conocemos.
                ...(cliente?.latitud && cliente?.longitud ? { lat: cliente.latitud, lng: cliente.longitud } : {}),
              })
            }
          />
          {valor.clienteSeleccionado && valor.clienteSeleccionado.latitud && valor.clienteSeleccionado.longitud && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 mb-2">
              📍 Se cargó la ubicación guardada del cliente — ajústala en el mapa si hace falta.
            </p>
          )}
          {valor.clienteSeleccionado && (!valor.clienteSeleccionado.latitud || !valor.clienteSeleccionado.longitud) && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 mb-2">
              Este cliente todavía no tiene una ubicación guardada — ubícalo en el mapa de abajo.
            </p>
          )}
        </>
      ) : (
        <div className="space-y-2 mb-3">
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="Nombre de contacto"
              value={valor.nombreContacto}
              onChange={(e) => onCambiar({ ...valor, nombreContacto: e.target.value })}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
            />
            <input
              placeholder="Dirección (opcional, ej. copiada de WhatsApp)"
              value={valor.direccion}
              onChange={(e) => onCambiar({ ...valor, direccion: e.target.value })}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
            />
          </div>
          <CampoPegarUbicacion latitud={valor.lat} longitud={valor.lng} onDetectar={(lat, lng) => onCambiar({ ...valor, lat, lng })} />
        </div>
      )}

      <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">
        {valor.lat && valor.lng ? "Ajusta el punto en el mapa si hace falta:" : "Toca el mapa en el punto que mandó el cliente por WhatsApp:"}
      </p>
      <MapaGeocerca
        latitud={valor.lat}
        longitud={valor.lng}
        radioMetros="0"
        alturaPx={alturaMapa}
        onCambiarUbicacion={(lat, lng) => onCambiar({ ...valor, lat, lng })}
      />
    </>
  );
}

// Planificación de rutas — visible con el permiso "visitas" (solo ver el
// historial) o "visitas_editar" (además, crear rutas nuevas).
function SeccionPlanificar({ puedeEditar }: { puedeEditar: boolean }) {
  const { mostrarToast } = useToast();
  const queryClient = useQueryClient();
  const [empleadoId, setEmpleadoId] = useState("");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [paradas, setParadas] = useState<ParadaForm[]>([]);
  const [nuevaParada, setNuevaParada] = useState<ParadaForm>(paradaVacia());
  const [pagina, setPagina] = useState(1);
  const [filtroEmpleadoId, setFiltroEmpleadoId] = useState("");
  const [rutaDetalleId, setRutaDetalleId] = useState<number | null>(null);

  const { data: empleados } = useQuery({
    queryKey: ["empleados-activos"],
    queryFn: async () => (await api.get<Empleado[]>("/empleados")).data.filter((e) => e.activo),
  });

  const { data: respuesta, isLoading: cargandoRutas } = useQuery({
    queryKey: ["rutas-visita", pagina, filtroEmpleadoId],
    queryFn: async () =>
      (
        await api.get<RespuestaPaginada<RutaVisita>>("/visitas/rutas", {
          params: { page: pagina, pageSize: 10, empleadoId: filtroEmpleadoId || undefined },
        })
      ).data,
    placeholderData: keepPreviousData,
  });
  const rutas = respuesta?.datos;

  function agregarParada() {
    if (nuevaParada.modo === "cliente" && !nuevaParada.clienteId) {
      mostrarToast("Selecciona un cliente para esta parada");
      return;
    }
    if (nuevaParada.modo === "libre" && !nuevaParada.nombreContacto.trim()) {
      mostrarToast("Escribe un nombre de contacto para esta parada");
      return;
    }
    if (!nuevaParada.lat || !nuevaParada.lng) {
      mostrarToast("Ubica el punto en el mapa antes de agregar la parada");
      return;
    }
    setParadas([...paradas, nuevaParada]);
    setNuevaParada(paradaVacia());
  }

  function quitarParada(key: string) {
    setParadas(paradas.filter((p) => p.key !== key));
  }

  const crearRuta = useMutation({
    mutationFn: async () =>
      api.post("/visitas/rutas", {
        empleadoId: Number(empleadoId),
        fecha,
        paradas: paradas.map((p) => ({
          clienteId: p.modo === "cliente" ? Number(p.clienteId) : undefined,
          nombreContacto: p.modo === "libre" ? p.nombreContacto.trim() : undefined,
          direccion: p.direccion.trim() || undefined,
          latitud: Number(p.lat),
          longitud: Number(p.lng),
        })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rutas-visita"] });
      mostrarToast("Ruta creada", "success");
      setEmpleadoId("");
      setParadas([]);
      setNuevaParada(paradaVacia());
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al crear la ruta"),
  });

  return (
    <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 p-4 mb-4">
      <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3">Planificar rutas</h3>

      {puedeEditar && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            crearRuta.mutate();
          }}
          className="mb-6 space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <select
              required
              value={empleadoId}
              onChange={(e) => setEmpleadoId(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
            >
              <option value="">Técnico...</option>
              {empleados?.map((e) => (
                <option key={e.id} value={e.id}>{e.nombres} {e.apellidos}</option>
              ))}
            </select>
            <input
              type="date"
              required
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div className="border border-gray-200 dark:border-gray-700 rounded-md p-3">
            <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">Agregar parada</p>
            <CamposParada valor={nuevaParada} onCambiar={setNuevaParada} alturaMapa={480} />

            <button
              type="button"
              onClick={agregarParada}
              className="mt-2 bg-slate-800 dark:bg-slate-700 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-slate-700 dark:hover:bg-slate-600"
            >
              + Agregar parada
            </button>
          </div>

          {paradas.length > 0 && (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-md">
              {paradas.map((p, i) => (
                <li key={p.key} className="flex justify-between items-center px-3 py-2 text-sm">
                  <span className="text-gray-700 dark:text-gray-300">
                    {i + 1}. {p.modo === "cliente" ? p.clienteSeleccionado?.razonSocial : p.nombreContacto}
                    {p.direccion && <span className="text-gray-400 dark:text-gray-500 ml-1 text-xs">({p.direccion})</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => quitarParada(p.key)}
                    className="text-red-600 dark:text-red-400 hover:underline text-xs font-medium"
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="submit"
            disabled={crearRuta.isPending || paradas.length === 0 || !empleadoId}
            className="w-full bg-brand-600 text-white py-2 rounded-md text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
          >
            {crearRuta.isPending ? "Creando ruta..." : "Crear ruta"}
          </button>
        </form>
      )}

      <div className="flex justify-between items-center mb-2">
        <p className="text-xs font-medium text-gray-600 dark:text-gray-300">Rutas planificadas</p>
        <select
          value={filtroEmpleadoId}
          onChange={(e) => {
            setFiltroEmpleadoId(e.target.value);
            setPagina(1);
          }}
          className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1 text-xs"
        >
          <option value="">Todos los técnicos</option>
          {empleados?.map((e) => (
            <option key={e.id} value={e.id}>{e.nombres} {e.apellidos}</option>
          ))}
        </select>
      </div>

      <div className="border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Técnico</th>
              <th className="px-3 py-2">Paradas</th>
              <th className="px-3 py-2">Completadas</th>
              <th className="px-3 py-2">Omitidas</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {cargandoRutas && (
              <tr>
                <td colSpan={6} className="px-3 py-3 text-center text-gray-400 dark:text-gray-500">Cargando...</td>
              </tr>
            )}
            {!cargandoRutas && rutas?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-3 text-center text-gray-400 dark:text-gray-500">Sin rutas planificadas todavía</td>
              </tr>
            )}
            {rutas?.map((r) => (
              <tr key={r.id} className="border-t border-gray-100 dark:border-gray-700">
                <td className="px-3 py-2">{r.fecha.slice(0, 10)}</td>
                <td className="px-3 py-2">{r.empleado.nombres} {r.empleado.apellidos}</td>
                <td className="px-3 py-2">{r.visitas.length}</td>
                <td className="px-3 py-2">{r.visitas.filter((v) => v.estado === "COMPLETADA").length}</td>
                <td className="px-3 py-2">{r.visitas.filter((v) => v.estado === "OMITIDA").length}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => setRutaDetalleId(r.id)}
                    className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium"
                  >
                    Ver detalle
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {respuesta && (
          <Paginacion
            page={respuesta.paginacion.page}
            totalPaginas={respuesta.paginacion.totalPaginas}
            total={respuesta.paginacion.total}
            onCambiarPagina={setPagina}
          />
        )}
      </div>

      {rutaDetalleId !== null &&
        (() => {
          const ruta = rutas?.find((r) => r.id === rutaDetalleId);
          if (!ruta) return null;
          return <ModalDetalleRuta ruta={ruta} onCerrar={() => setRutaDetalleId(null)} />;
        })()}
    </div>
  );
}

// Detalle de una ruta para el admin: cliente/contacto de cada parada, qué
// se hizo y qué equipos quedaron en la vivienda — el "acta" que pidió el
// negocio, todo en un solo lugar en vez de ir visita por visita. Se muestra
// como sección normal debajo de la tabla (no como ventana flotante encima
// del mapa) — en algunos equipos el overlay "fixed" no se pintaba en
// pantalla hasta forzar un repintado; en flujo normal de la página no tiene
// ese problema.
function ModalDetalleRuta({ ruta, onCerrar }: { ruta: RutaVisita; onCerrar: () => void }) {
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 mt-4">
      <div className="flex justify-between items-center mb-3">
        <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          Detalle — {ruta.empleado.nombres} {ruta.empleado.apellidos} ({ruta.fecha.slice(0, 10)})
        </h4>
        <button
          onClick={onCerrar}
          aria-label="Cerrar"
          className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none"
        >
          ×
        </button>
      </div>
      <div className="space-y-4">
        {ruta.visitas.map((v) => (
          <TarjetaVisitaDetalle
            key={v.id}
            visita={v}
            encabezado={
              <>
                {v.orden}. {v.nombreContacto}
                {v.cliente && <span className="text-gray-400 dark:text-gray-500 ml-1 text-xs font-normal">({v.cliente.identificacion})</span>}
              </>
            }
          />
        ))}
      </div>
      <FormularioVisitaFlash ruta={ruta} />
    </div>
  );
}

// Sumar una parada de última hora a una ruta que ya existía — ej. un cliente
// llama pidiendo una visita urgente el mismo día y el técnico ya tiene su
// ruta armada (ver POST /visitas/rutas/:id/paradas). Colapsado por defecto
// para no saturar el detalle cuando solo se quiere revisar lo ya hecho.
function FormularioVisitaFlash({ ruta }: { ruta: RutaVisita }) {
  const { mostrarToast } = useToast();
  const queryClient = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [parada, setParada] = useState<ParadaForm>(paradaVacia());

  const agregarVisitaFlash = useMutation({
    mutationFn: async () => {
      if (parada.modo === "cliente" && !parada.clienteId) {
        throw new Error("Selecciona un cliente para esta visita");
      }
      if (parada.modo === "libre" && !parada.nombreContacto.trim()) {
        throw new Error("Escribe un nombre de contacto para esta visita");
      }
      if (!parada.lat || !parada.lng) {
        throw new Error("Ubica el punto en el mapa antes de agregar la visita");
      }
      return api.post(`/visitas/rutas/${ruta.id}/paradas`, {
        clienteId: parada.modo === "cliente" ? Number(parada.clienteId) : undefined,
        nombreContacto: parada.modo === "libre" ? parada.nombreContacto.trim() : undefined,
        direccion: parada.direccion.trim() || undefined,
        latitud: Number(parada.lat),
        longitud: Number(parada.lng),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rutas-visita"] });
      queryClient.invalidateQueries({ queryKey: ["mi-ruta-hoy"] });
      mostrarToast("Visita urgente agregada a la ruta", "success");
      setParada(paradaVacia());
      setAbierto(false);
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? error.message ?? "Error al agregar la visita urgente"),
  });

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="mt-4 text-xs font-medium text-red-600 dark:text-red-400 hover:underline"
      >
        🚨 + Agregar visita urgente
      </button>
    );
  }

  return (
    <div className="border border-red-200 dark:border-red-800 rounded-md p-3 mt-4">
      <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-2">
        Agregar visita urgente a la ruta de {ruta.empleado.nombres} {ruta.empleado.apellidos}
      </p>
      <CamposParada valor={parada} onCambiar={setParada} />
      <div className="flex gap-2 mt-2">
        <button
          type="button"
          onClick={() => agregarVisitaFlash.mutate()}
          disabled={agregarVisitaFlash.isPending}
          className="bg-red-600 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-red-700 disabled:opacity-50"
        >
          {agregarVisitaFlash.isPending ? "Agregando..." : "Agregar visita urgente"}
        </button>
        <button
          type="button"
          onClick={() => {
            setAbierto(false);
            setParada(paradaVacia());
          }}
          className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-1.5 rounded-md text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-600"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// Buscar en TODOS los equipos dejados en visitas (cualquier cliente) por
// tipo, modelo o serial/MAC — para responder "¿dónde está instalado este
// equipo?" sin tener que abrir cliente por cliente. Sección en línea, no
// ventana flotante (ver nota en ModalDetalleRuta más arriba).
function BuscadorEquiposInstalados() {
  const [texto, setTexto] = useState("");
  const textoDebounced = useDebounce(texto);

  const { data: resultados, isFetching } = useQuery({
    queryKey: ["equipos-instalados-buscador", textoDebounced],
    queryFn: async () => (await api.get<EquipoInstaladoBusqueda[]>("/visitas/equipos", { params: { q: textoDebounced } })).data,
    enabled: textoDebounced.trim().length >= 2,
  });

  function exportarExcel() {
    if (!resultados || resultados.length === 0) return;
    const hoja = XLSX.utils.json_to_sheet(
      resultados.map((eq) => ({
        Tipo: eq.tipo,
        Modelo: eq.modelo ?? "",
        "Serial / MAC": eq.serial ?? "",
        Cliente: eq.visita.cliente?.razonSocial ?? eq.visita.nombreContacto,
        Identificación: eq.visita.cliente?.identificacion ?? "",
        Dirección: eq.visita.direccion ?? "",
        Fecha: new Date(eq.visita.rutaVisita.fecha).toLocaleDateString("es-EC"),
        Técnico: `${eq.visita.rutaVisita.empleado.nombres} ${eq.visita.rutaVisita.empleado.apellidos}`,
        Estado: ETIQUETA_ESTADO[eq.visita.estado],
      }))
    );
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Equipos instalados");
    XLSX.writeFile(libro, "equipos-instalados.xlsx");
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 p-4 mb-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Buscar equipo instalado</h3>
        {resultados && resultados.length > 0 && (
          <button
            onClick={exportarExcel}
            className="bg-brand-600 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-brand-700"
          >
            Exportar a Excel
          </button>
        )}
      </div>
      <input
        type="text"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Buscar por serial, MAC, modelo o tipo (ej. RB750, Router Mikrotik)..."
        className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm mb-3"
      />

      {textoDebounced.trim().length < 2 && (
        <p className="text-xs text-gray-400 dark:text-gray-500">Escribe al menos 2 caracteres para buscar.</p>
      )}
      {textoDebounced.trim().length >= 2 && isFetching && <p className="text-xs text-gray-400 dark:text-gray-500">Buscando...</p>}
      {textoDebounced.trim().length >= 2 && !isFetching && resultados?.length === 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500">No se encontró ningún equipo que coincida.</p>
      )}
      {resultados && resultados.length > 0 && (
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
            <tr>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Modelo</th>
              <th className="px-3 py-2">Serial / MAC</th>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Dirección</th>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Técnico</th>
            </tr>
          </thead>
          <tbody>
            {resultados.map((eq) => (
              <tr key={eq.id} className="border-t border-gray-100 dark:border-gray-700">
                <td className="px-3 py-2">{eq.tipo}</td>
                <td className="px-3 py-2">{eq.modelo ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-xs">{eq.serial ?? "—"}</td>
                <td className="px-3 py-2">
                  {eq.visita.cliente?.razonSocial ?? eq.visita.nombreContacto}
                  {eq.visita.cliente && <span className="text-gray-400 dark:text-gray-500 ml-1 text-xs">({eq.visita.cliente.identificacion})</span>}
                </td>
                <td className="px-3 py-2">{eq.visita.direccion ?? "—"}</td>
                <td className="px-3 py-2">{new Date(eq.visita.rutaVisita.fecha).toLocaleDateString("es-EC")}</td>
                <td className="px-3 py-2">{eq.visita.rutaVisita.empleado.nombres} {eq.visita.rutaVisita.empleado.apellidos}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function VisitasPage() {
  const usuario = useAuth();
  const puedeVer = usePermiso("visitas");
  const puedeEditarVisitas = usePermiso("visitas_editar");
  const tieneEmpleadoVinculado = !!usuario?.empleadoId;

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Visitas Técnicas</h2>

      {tieneEmpleadoVinculado && <SeccionMiRuta />}
      {(puedeVer || puedeEditarVisitas) && <SeccionPlanificar puedeEditar={puedeEditarVisitas} />}
      {(puedeVer || puedeEditarVisitas) && <BuscadorEquiposInstalados />}

      {!tieneEmpleadoVinculado && !puedeVer && !puedeEditarVisitas && (
        <p className="text-sm text-gray-400 dark:text-gray-500">No tienes acceso a esta sección.</p>
      )}
    </div>
  );
}
