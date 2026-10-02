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
import { BuscadorCliente } from "../components/BuscadorCliente";
import { CampoPegarUbicacion } from "../components/CampoPegarUbicacion";
import { MapaGeocerca } from "../components/MapaGeocerca";
import { Paginacion } from "../components/Paginacion";
import { TarjetaVisitaDetalle } from "../components/TarjetaVisitaDetalle";
import { SeccionMiRuta, ETIQUETA_ESTADO } from "../components/SeccionMiRuta";
import { useFiltrosListado, BarraBuscadorDocumentos } from "../components/BuscadorDocumentos";
import {
  CLASE_CAMPO,
  CLASE_ETIQUETA,
  CLASE_TH,
  MarcoDocumento,
  Sello,
  ConteoItems,
  CabeceraDocumento,
  EtiquetaCabecera,
  DetalleDocumento,
  FilaDetalleVacia,
  BotonConfirmar,
  Resaltar,
} from "../components/FormatoDocumento";

// "Mi ruta de hoy" (SeccionMiRuta) vive ahora en components/SeccionMiRuta.tsx
// — se comparte con el shell móvil del técnico (ver AppMovil.tsx). ETIQUETA_ESTADO
// se re-exporta desde ahí y se importa arriba porque también se usa en el
// buscador "¿dónde está instalado este equipo?" más abajo.

interface ParadaForm {
  key: string;
  modo: "cliente" | "libre";
  clienteId: number | "";
  clienteSeleccionado: Cliente | null;
  nombreContacto: string;
  direccion: string;
  motivoVisita: string;
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
    motivoVisita: "",
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
              className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
            />
            <input
              placeholder="Dirección (opcional, ej. copiada de WhatsApp)"
              value={valor.direccion}
              onChange={(e) => onCambiar({ ...valor, direccion: e.target.value })}
              className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
            />
          </div>
          <CampoPegarUbicacion latitud={valor.lat} longitud={valor.lng} onDetectar={(lat, lng) => onCambiar({ ...valor, lat, lng })} />
        </div>
      )}

      <input
        placeholder="¿Qué debe hacer el técnico? (opcional, ej. Revisión de equipos, fibra óptica rota)"
        value={valor.motivoVisita}
        onChange={(e) => onCambiar({ ...valor, motivoVisita: e.target.value })}
        className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm mb-2"
      />

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
  // A propósito NUNCA new Date().toISOString().slice(0,10): trunca en UTC,
  // no en hora local — en Ecuador (UTC-5), de noche ya cayó al día
  // calendario SIGUIENTE, y una ruta "para hoy" quedaba fechada mañana sin
  // que el despachador lo notara (ver mismo bug ya documentado en
  // backend/src/utils/rangoFechas.ts).
  const [fecha, setFecha] = useState(() => {
    const hoy = new Date();
    return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
  });
  const [paradas, setParadas] = useState<ParadaForm[]>([]);
  const [nuevaParada, setNuevaParada] = useState<ParadaForm>(paradaVacia());
  const [pagina, setPagina] = useState(1);
  const [filtroEmpleadoId, setFiltroEmpleadoId] = useState("");
  // Buscador de "Rutas planificadas" (en el servidor: la lista pagina).
  const filtros = useFiltrosListado(setPagina);
  const [rutaDetalleId, setRutaDetalleId] = useState<number | null>(null);

  const { data: empleados } = useQuery({
    queryKey: ["empleados-activos"],
    queryFn: async () => (await api.get<Empleado[]>("/empleados")).data.filter((e) => e.activo),
  });

  const { data: respuesta, isLoading: cargandoRutas } = useQuery({
    queryKey: ["rutas-visita", pagina, filtroEmpleadoId, ...filtros.clave],
    queryFn: async () =>
      (
        await api.get<RespuestaPaginada<RutaVisita>>("/visitas/rutas", {
          params: { page: pagina, pageSize: 10, empleadoId: filtroEmpleadoId || undefined, ...filtros.params },
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
          motivoVisita: p.motivoVisita.trim() || undefined,
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
    <div className="space-y-4 mb-4">

      {puedeEditar && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            crearRuta.mutate();
          }}
        >
          <MarcoDocumento
            titulo="Nueva ruta de visitas"
            sello={
              <>
                <ConteoItems cantidad={paradas.length} singular="parada" plural="paradas" />
                <Sello>Borrador</Sello>
              </>
            }
          >
            <CabeceraDocumento>
              <EtiquetaCabecera>Técnico</EtiquetaCabecera>
              <select required value={empleadoId} onChange={(e) => setEmpleadoId(e.target.value)} className={CLASE_CAMPO}>
                <option value="">Elegir técnico...</option>
                {empleados?.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombres} {e.apellidos}
                  </option>
                ))}
              </select>
              <EtiquetaCabecera>Fecha de la ruta</EtiquetaCabecera>
              <input type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} className={`${CLASE_CAMPO} font-mono`} />
            </CabeceraDocumento>

            {/* Línea de ingreso: la parada que se está armando */}
            <div className="mx-4 border border-stone-300 dark:border-gray-700 bg-stone-50 dark:bg-gray-900/40 p-3">
              <p className={`${CLASE_ETIQUETA} mb-2`}>Agregar parada · cliente registrado o contacto libre</p>
              <CamposParada valor={nuevaParada} onCambiar={setNuevaParada} alturaMapa={480} />
              <button
                type="button"
                onClick={agregarParada}
                className="mt-2 bg-brand-700 text-white px-3 py-1.5 rounded-sm text-sm font-semibold hover:bg-brand-800"
              >
                Agregar parada ↵
              </button>
            </div>

            {/* Detalle: paradas de la ruta, en orden */}
            <DetalleDocumento>
              <thead>
                <tr className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700">
                  <th className={`${CLASE_TH} w-10`}>#</th>
                  <th className={CLASE_TH}>Cliente / contacto</th>
                  <th className={CLASE_TH}>Dirección</th>
                  <th className={CLASE_TH}>Motivo</th>
                  <th className={`${CLASE_TH} w-10`}></th>
                </tr>
              </thead>
              <tbody>
                {paradas.length === 0 && (
                  <FilaDetalleVacia columnas={5}>Agrega al menos una parada para poder crear la ruta.</FilaDetalleVacia>
                )}
                {paradas.map((p, i) => (
                  <tr key={p.key} className="border-b border-stone-100 dark:border-gray-700/60 last:border-b-0">
                    <td className="px-3 py-1.5 font-mono text-xs text-gray-400">{i + 1}</td>
                    <td className="px-3 py-1.5 text-gray-800 dark:text-gray-100">
                      {p.modo === "cliente" ? p.clienteSeleccionado?.razonSocial : p.nombreContacto}
                      {p.modo === "cliente" && p.clienteSeleccionado?.identificacion && (
                        <span className="block font-mono text-[11px] text-gray-400 dark:text-gray-500">{p.clienteSeleccionado.identificacion}</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-gray-600 dark:text-gray-300">{p.direccion || "—"}</td>
                    <td className="px-3 py-1.5 text-gray-600 dark:text-gray-300">{p.motivoVisita || "—"}</td>
                    <td className="px-2 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => quitarParada(p.key)}
                        title="Quitar parada"
                        className="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DetalleDocumento>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4 p-4 items-start">
              <p className="text-xs text-gray-400 dark:text-gray-500 lg:pt-2">
                El técnico ve esta ruta en "Mi ruta de hoy" (celular) el día elegido, con las paradas en este orden.
              </p>
              <BotonConfirmar type="submit" disabled={crearRuta.isPending || paradas.length === 0 || !empleadoId}>
                {crearRuta.isPending ? "Creando ruta..." : "Crear ruta"}
              </BotonConfirmar>
            </div>
          </MarcoDocumento>
        </form>
      )}

      <div className="bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-stone-300 dark:border-gray-700">
          <h3 className="text-base font-bold text-gray-900 dark:text-gray-50">Rutas planificadas</h3>
          <span className="font-mono text-[11px] text-gray-400 dark:text-gray-500">
            {respuesta ? `${respuesta.paginacion.total} ruta${respuesta.paginacion.total === 1 ? "" : "s"}` : ""}
          </span>
        </div>
        <BarraBuscadorDocumentos
          filtros={filtros}
          etiquetaBusqueda="Buscar · técnico, cliente, contacto, dirección o motivo"
          placeholder="Ej: Pérez, fibra rota, Av. Loja..."
          mostrarPago={false}
          extras={
            <label className="flex flex-col gap-1 w-48">
              <span className={CLASE_ETIQUETA}>Técnico</span>
              <select
                value={filtroEmpleadoId}
                onChange={(e) => {
                  setFiltroEmpleadoId(e.target.value);
                  setPagina(1);
                }}
                className={CLASE_CAMPO}
              >
                <option value="">Todos los técnicos</option>
                {empleados?.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombres} {e.apellidos}
                  </option>
                ))}
              </select>
            </label>
          }
        />
        <table className="w-full text-sm">
          <thead className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700 text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 [&_th]:font-medium">
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
                <td colSpan={6} className="px-3 py-3 text-center text-gray-400 dark:text-gray-500">{filtros.hayFiltros || filtroEmpleadoId ? "Ninguna ruta coincide con la búsqueda." : "Sin rutas planificadas todavía"}</td>
              </tr>
            )}
            {rutas?.map((r) => (
              <tr key={r.id} className="border-t border-stone-100 dark:border-gray-700">
                <td className="px-3 py-2 font-mono text-xs">{r.fecha.slice(0, 10)}</td>
                <td className="px-3 py-2"><Resaltar texto={`${r.empleado.nombres} ${r.empleado.apellidos}`} termino={filtros.busquedaAplicada} /></td>
                <td className="px-3 py-2">{r.visitas.length}</td>
                <td className="px-3 py-2">{r.visitas.filter((v) => v.estado === "COMPLETADA").length}</td>
                <td className="px-3 py-2">{r.visitas.filter((v) => v.estado === "OMITIDA").length}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => setRutaDetalleId(r.id)}
                    className="text-brand-700 dark:text-brand-300 hover:underline text-xs font-medium"
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
          return (
            <ModalDetalleRuta
              ruta={ruta}
              empleados={empleados ?? []}
              puedeEditar={puedeEditar}
              onCerrar={() => setRutaDetalleId(null)}
            />
          );
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
function ModalDetalleRuta({
  ruta,
  empleados,
  puedeEditar,
  onCerrar,
}: {
  ruta: RutaVisita;
  empleados: Empleado[];
  puedeEditar: boolean;
  onCerrar: () => void;
}) {
  const pendientes = ruta.visitas.filter((v) => v.estado === "PENDIENTE");
  // Técnicos a los que se puede pasar una visita: activos y distintos al
  // dueño de esta ruta.
  const destinos = empleados.filter((e) => e.id !== ruta.empleadoId);

  return (
    <div className="border border-stone-300 dark:border-gray-700 rounded-sm p-4 mt-4">
      <div className="flex justify-between items-center mb-3">
        <h4 className="font-mono text-[11px] uppercase tracking-[0.15em] text-gray-600 dark:text-gray-300">
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

      {puedeEditar && pendientes.length > 0 && destinos.length > 0 && (
        <BarraReasignarRuta ruta={ruta} pendientes={pendientes.length} destinos={destinos} onListo={onCerrar} />
      )}

      <div className="space-y-4">
        {ruta.visitas.map((v) => (
          <div key={v.id}>
            <TarjetaVisitaDetalle
              visita={v}
              encabezado={
                <>
                  {v.orden}. {v.nombreContacto}
                  {v.cliente && <span className="text-gray-400 dark:text-gray-500 ml-1 text-xs font-normal">({v.cliente.identificacion})</span>}
                </>
              }
            />
            {puedeEditar && v.estado === "PENDIENTE" && destinos.length > 0 && (
              <ReasignarVisita visitaId={v.id} nombreContacto={v.nombreContacto} destinos={destinos} onListo={onCerrar} />
            )}
          </div>
        ))}
      </div>
      <FormularioVisitaFlash ruta={ruta} />
    </div>
  );
}

// Pasa UNA visita pendiente a otro técnico (PATCH /visitas/:id/reasignar).
// La confirmación es EN FLUJO (un segundo paso "¿Sí/No?" en la misma barra),
// no un <Modal> flotante — en algunos equipos el overlay "fixed" no se pinta
// (ver la nota en ModalDetalleRuta y en FormularioVisitaFlash).
function ReasignarVisita({
  visitaId,
  nombreContacto,
  destinos,
  onListo,
}: {
  visitaId: number;
  nombreContacto: string;
  destinos: Empleado[];
  onListo: () => void;
}) {
  const { mostrarToast } = useToast();
  const queryClient = useQueryClient();
  const [empleadoId, setEmpleadoId] = useState("");
  const [confirmando, setConfirmando] = useState(false);

  const reasignar = useMutation({
    mutationFn: async () => api.patch(`/visitas/${visitaId}/reasignar`, { empleadoId: Number(empleadoId) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rutas-visita"] });
      queryClient.invalidateQueries({ queryKey: ["mi-ruta-hoy"] });
      mostrarToast("Visita reasignada", "success");
      onListo();
    },
    onError: (error: any) => {
      setConfirmando(false);
      mostrarToast(error.response?.data?.error ?? "Error al reasignar la visita");
    },
  });

  const destino = destinos.find((e) => e.id === Number(empleadoId));

  return (
    <div className="flex flex-wrap items-center gap-2 mt-1 pl-3">
      <span className="text-xs text-gray-400 dark:text-gray-500">Reasignar a:</span>
      <select
        value={empleadoId}
        onChange={(e) => {
          setEmpleadoId(e.target.value);
          setConfirmando(false);
        }}
        className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1 text-xs"
      >
        <option value="">Elegir técnico...</option>
        {destinos.map((e) => (
          <option key={e.id} value={e.id}>{e.nombres} {e.apellidos}</option>
        ))}
      </select>
      {!confirmando ? (
        <button
          onClick={() => setConfirmando(true)}
          disabled={!empleadoId}
          className="bg-slate-600 text-white px-3 py-1 rounded-md text-xs font-medium hover:bg-brand-800 disabled:opacity-50"
        >
          Reasignar
        </button>
      ) : (
        <>
          <span className="text-xs text-gray-600 dark:text-gray-300">
            ¿Pasar "{nombreContacto}" a {destino?.nombres} {destino?.apellidos}?
          </span>
          <button
            onClick={() => reasignar.mutate()}
            disabled={reasignar.isPending}
            className="bg-slate-600 text-white px-3 py-1 rounded-md text-xs font-medium hover:bg-brand-800 disabled:opacity-50"
          >
            {reasignar.isPending ? "Reasignando..." : "Sí, reasignar"}
          </button>
          <button
            onClick={() => setConfirmando(false)}
            disabled={reasignar.isPending}
            className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:underline"
          >
            Cancelar
          </button>
        </>
      )}
    </div>
  );
}

// Pasa TODAS las visitas pendientes de la ruta a otro técnico
// (PATCH /visitas/rutas/:id/reasignar) — el caso "se dañó el vehículo,
// muévanle el resto del día a otro". Confirmación en flujo, igual que
// ReasignarVisita.
function BarraReasignarRuta({
  ruta,
  pendientes,
  destinos,
  onListo,
}: {
  ruta: RutaVisita;
  pendientes: number;
  destinos: Empleado[];
  onListo: () => void;
}) {
  const { mostrarToast } = useToast();
  const queryClient = useQueryClient();
  const [empleadoId, setEmpleadoId] = useState("");
  const [confirmando, setConfirmando] = useState(false);

  const reasignar = useMutation({
    mutationFn: async () => api.patch(`/visitas/rutas/${ruta.id}/reasignar`, { empleadoId: Number(empleadoId) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rutas-visita"] });
      queryClient.invalidateQueries({ queryKey: ["mi-ruta-hoy"] });
      mostrarToast(`${pendientes} visita(s) reasignada(s)`, "success");
      onListo();
    },
    onError: (error: any) => {
      setConfirmando(false);
      mostrarToast(error.response?.data?.error ?? "Error al reasignar las visitas");
    },
  });

  const destino = destinos.find((e) => e.id === Number(empleadoId));

  return (
    <div className="mb-3 p-2 rounded-md bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-900/40">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-amber-800 dark:text-amber-300">
          Reasignar las {pendientes} pendiente(s) a:
        </span>
        <select
          value={empleadoId}
          onChange={(e) => {
            setEmpleadoId(e.target.value);
            setConfirmando(false);
          }}
          className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1 text-xs"
        >
          <option value="">Elegir técnico...</option>
          {destinos.map((e) => (
            <option key={e.id} value={e.id}>{e.nombres} {e.apellidos}</option>
          ))}
        </select>
        {!confirmando ? (
          <button
            onClick={() => setConfirmando(true)}
            disabled={!empleadoId}
            className="bg-amber-600 text-white px-3 py-1 rounded-md text-xs font-medium hover:bg-amber-700 disabled:opacity-50"
          >
            Reasignar todas
          </button>
        ) : (
          <>
            <button
              onClick={() => reasignar.mutate()}
              disabled={reasignar.isPending}
              className="bg-amber-600 text-white px-3 py-1 rounded-md text-xs font-medium hover:bg-amber-700 disabled:opacity-50"
            >
              {reasignar.isPending ? "Reasignando..." : `Sí, pasar a ${destino?.nombres}`}
            </button>
            <button
              onClick={() => setConfirmando(false)}
              disabled={reasignar.isPending}
              className="text-xs font-medium text-amber-800 dark:text-amber-300 hover:underline"
            >
              Cancelar
            </button>
          </>
        )}
      </div>
      {confirmando && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1.5">
          Las visitas ya completadas u omitidas se quedan con {ruta.empleado.nombres} {ruta.empleado.apellidos}.
        </p>
      )}
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
        motivoVisita: parada.motivoVisita.trim() || undefined,
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
          className="bg-stone-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-1.5 rounded-md text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-600"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// Buscar en TODOS los equipos dejados en visitas (cualquier cliente) por
// tipo, modelo, serial/MAC, o por el cliente (nombre/razón social o
// cédula/RUC) — responde tanto "¿dónde está instalado este equipo?" como
// "¿qué equipos tiene este cliente y qué técnico se los entregó?" con el
// mismo buscador, sin tener que abrir cliente por cliente. Sección en línea,
// no ventana flotante (ver nota en ModalDetalleRuta más arriba).
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
    <div className="bg-white dark:bg-gray-800 rounded-sm border border-stone-300 dark:border-gray-700 p-4 mb-4">
      <div className="flex flex-wrap justify-between items-center gap-3 -mx-4 -mt-4 mb-3 px-4 py-3 border-b border-stone-300 dark:border-gray-700">
        <h3 className="text-base font-bold text-gray-900 dark:text-gray-50">Buscar equipo instalado</h3>
        {resultados && resultados.length > 0 && (
          <button
            onClick={exportarExcel}
            className="bg-brand-700 text-white px-3 py-1.5 rounded-sm text-xs font-semibold hover:bg-brand-800"
          >
            Exportar a Excel
          </button>
        )}
      </div>
      <input
        type="text"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Buscar por serial, MAC, modelo, tipo, o nombre/cédula del cliente..."
        className={`${CLASE_CAMPO} mb-3`}
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
          <thead className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700 text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 [&_th]:font-medium">
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
              <tr key={eq.id} className="border-t border-stone-100 dark:border-gray-700">
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
      <h2 className="text-lg font-bold text-gray-900 dark:text-gray-50 mb-4">Visitas Técnicas</h2>

      {tieneEmpleadoVinculado && <SeccionMiRuta />}
      {(puedeVer || puedeEditarVisitas) && <SeccionPlanificar puedeEditar={puedeEditarVisitas} />}
      {(puedeVer || puedeEditarVisitas) && <BuscadorEquiposInstalados />}

      {!tieneEmpleadoVinculado && !puedeVer && !puedeEditarVisitas && (
        <p className="text-sm text-gray-400 dark:text-gray-500">No tienes acceso a esta sección.</p>
      )}
    </div>
  );
}
