import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type CajaFibra,
  type TendidoFibra,
  type NodoRed,
  type PuntoRuta,
  type PreviaImportacionKml,
} from "../api/client";
import { MapaRedFisica, type ModoMapaRedFisica } from "../components/MapaRedFisica";
import { useToast } from "../components/ToastProvider";
import { usePermiso } from "../context/AuthContext";
import { formatearLargo, largoTendidoMetros } from "../utils/geoFibra";
import { useFiltrosListado, BarraBuscadorDocumentos, filtrarLocal, sinPaginacion } from "../components/BuscadorDocumentos";
import { CLASE_CAMPO, CLASE_ETIQUETA, Resaltar } from "../components/FormatoDocumento";

const TIPOS_CAJA_SUGERIDOS = ["NAP", "Empalme", "Murete", "Poste", "Cámara"];
const TIPOS_TENDIDO_SUGERIDOS = ["Troncal", "Distribución", "Acometida"];
const ESTADOS_TENDIDO = ["ACTIVO", "CORTADO", "EN_MANTENIMIENTO"];

interface CajaRevision {
  incluir: boolean;
  codigo: string;
  tipo: string;
  latitud: number;
  longitud: number;
  descripcion?: string;
}
interface TendidoRevision {
  incluir: boolean;
  nombre: string;
  tipo: string;
  trazado: PuntoRuta[];
  descripcion?: string;
}

// Qué se ve en el panel lateral — reemplaza la lista por un formulario
// mientras se crea/edita algo. A propósito NO usa el Modal.tsx compartido
// (overlay position:fixed): en esta máquina esos overlays a veces no pintan
// hasta forzar un repintado ajeno — ver memoria del proyecto. Todo acá es
// contenido "en flujo" dentro del mismo panel.
type PanelLateral =
  | { tipo: "lista" }
  | { tipo: "nuevaCaja"; punto: PuntoRuta }
  | { tipo: "editarCaja"; caja: CajaFibra }
  | { tipo: "nuevoTendido"; puntos: PuntoRuta[] }
  | { tipo: "editarTendido"; tendido: TendidoFibra }
  | { tipo: "importarKml"; cajas: CajaRevision[]; tendidos: TendidoRevision[]; omitidos: number }
  // "tendido" nunca cambia mientras se edita (es el punto de partida fijo
  // que usa MapaRedFisica para crear la capa editable UNA sola vez, ver
  // tendidoEnEdicion ahí) — "trazadoActual" es el que va cambiando en vivo
  // con cada arrastre/agregado/borrado de vértice, vía onTrazadoEditado.
  | { tipo: "editarTrazado"; tendido: TendidoFibra; trazadoActual: PuntoRuta[] };

export function RedFisicaPage() {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const puedeEditar = usePermiso("red_fisica_editar");
  const puedeVerNodos = usePermiso("mikrotik"); // NodoRed vive detrás de ese permiso, ver routes/nodosRed.ts

  const [modo, setModo] = useState<ModoMapaRedFisica>("ver");
  const [nodoAUbicarId, setNodoAUbicarId] = useState("");
  const [filtroNodoId, setFiltroNodoId] = useState("");
  const [panel, setPanel] = useState<PanelLateral>({ tipo: "lista" });
  const [confirmandoBorrado, setConfirmandoBorrado] = useState<{ tipo: "caja" | "tendido"; id: number } | null>(null);
  const [exportando, setExportando] = useState<"kml" | "kmz" | null>(null);
  const [errorImportacion, setErrorImportacion] = useState<string | null>(null);
  const inputArchivoRef = useRef<HTMLInputElement>(null);

  const { data: cajas, isLoading: cargandoCajas } = useQuery({
    queryKey: ["red-fisica-cajas"],
    queryFn: async () => (await api.get<CajaFibra[]>("/red-fisica/cajas")).data,
  });
  const { data: tendidos, isLoading: cargandoTendidos } = useQuery({
    queryKey: ["red-fisica-tendidos"],
    queryFn: async () => (await api.get<TendidoFibra[]>("/red-fisica/tendidos")).data,
  });
  const { data: nodos } = useQuery({
    queryKey: ["nodos-red"],
    queryFn: async () => (await api.get<NodoRed[]>("/nodos-red")).data,
    enabled: puedeVerNodos,
  });

  // Buscador compartido de los listados: se suma al filtro por nodo y
  // filtra A LA VEZ la lista lateral y lo que se dibuja en el mapa.
  const filtros = useFiltrosListado(sinPaginacion);
  const cajasFiltradas = useMemo(
    () =>
      filtrarLocal(
        (cajas ?? []).filter((c) => !filtroNodoId || c.nodoId === Number(filtroNodoId)),
        filtros,
        { textos: (c) => [c.codigo, c.tipo, c.descripcion, c.nodo?.nombre] }
      ) ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cajas, filtroNodoId, filtros.busqueda]
  );
  const tendidosFiltrados = useMemo(
    () =>
      filtrarLocal(
        (tendidos ?? []).filter((t) => !filtroNodoId || t.nodoId === Number(filtroNodoId)),
        filtros,
        { textos: (t) => [t.nombre, t.tipo, t.estado, t.origenCaja?.codigo, t.destinoCaja?.codigo, t.nodo?.nombre] }
      ) ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tendidos, filtroNodoId, filtros.busqueda]
  );
  const nodosUbicados = useMemo(
    () =>
      (nodos ?? [])
        .filter((n) => n.latitud != null && n.longitud != null)
        .map((n) => ({ id: n.id, nombre: n.nombre, latitud: Number(n.latitud), longitud: Number(n.longitud) })),
    [nodos]
  );

  // Claves ESTABLES (solo lo geográfico: incluir/lat/lng) para memoizar la
  // vista previa que se le pasa al mapa — sin esto, CUALQUIER tecla escrita
  // en "Tipo"/"Código"/"Nombre" (que no cambia nada geográfico) generaba un
  // array nuevo en cada render y forzaba a MapaRedFisica a limpiar y
  // redibujar las 9+ marcas naranjas en CADA tecla, una carga de Leaflet
  // pesada que en esta máquina puede dejar la pantalla mostrando un cuadro
  // desactualizado (mismo tipo de bug de repintado ya visto con los
  // overlays position:fixed — ver memoria del proyecto).
  const claveCajasPrevia = panel.tipo === "importarKml" ? panel.cajas.map((c) => `${c.incluir}:${c.latitud}:${c.longitud}`).join("|") : "";
  const claveTendidosPrevia = panel.tipo === "importarKml" ? panel.tendidos.map((t) => `${t.incluir}:${t.trazado.length}`).join("|") : "";
  const previaCajasParaMapa = useMemo(
    () => (panel.tipo === "importarKml" ? panel.cajas.filter((c) => c.incluir).map((c) => ({ latitud: c.latitud, longitud: c.longitud })) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [claveCajasPrevia]
  );
  const previaTendidosParaMapa = useMemo(
    () => (panel.tipo === "importarKml" ? panel.tendidos.filter((t) => t.incluir).map((t) => ({ trazado: t.trazado })) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [claveTendidosPrevia]
  );

  const crearCaja = useMutation({
    mutationFn: async (datos: Record<string, unknown>) => (await api.post("/red-fisica/cajas", datos)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["red-fisica-cajas"] });
      setPanel({ tipo: "lista" });
      mostrarToast("Caja creada", "success");
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "No se pudo crear la caja"),
  });

  const editarCaja = useMutation({
    mutationFn: async ({ id, datos }: { id: number; datos: Record<string, unknown> }) => (await api.put(`/red-fisica/cajas/${id}`, datos)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["red-fisica-cajas"] });
      setPanel({ tipo: "lista" });
      mostrarToast("Caja actualizada", "success");
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "No se pudo editar la caja"),
  });

  const desactivarCaja = useMutation({
    mutationFn: async (id: number) => api.delete(`/red-fisica/cajas/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["red-fisica-cajas"] });
      setConfirmandoBorrado(null);
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "No se pudo desactivar la caja"),
  });

  const crearTendido = useMutation({
    mutationFn: async (datos: Record<string, unknown>) => (await api.post("/red-fisica/tendidos", datos)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["red-fisica-tendidos"] });
      setPanel({ tipo: "lista" });
      mostrarToast("Tendido creado", "success");
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "No se pudo crear el tendido"),
  });

  const editarTendido = useMutation({
    mutationFn: async ({ id, datos }: { id: number; datos: Record<string, unknown> }) => (await api.put(`/red-fisica/tendidos/${id}`, datos)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["red-fisica-tendidos"] });
      setPanel({ tipo: "lista" });
      setModo("ver"); // por si se guardó desde el modo "editarTrazado"
      mostrarToast("Tendido actualizado", "success");
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "No se pudo editar el tendido"),
  });

  const desactivarTendido = useMutation({
    mutationFn: async (id: number) => api.delete(`/red-fisica/tendidos/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["red-fisica-tendidos"] });
      setConfirmandoBorrado(null);
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "No se pudo desactivar el tendido"),
  });

  const ubicarNodo = useMutation({
    mutationFn: async ({ id, punto }: { id: number; punto: PuntoRuta }) =>
      (await api.patch(`/nodos-red/${id}/ubicacion`, { latitud: punto.lat, longitud: punto.lng })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nodos-red"] });
      mostrarToast("Nodo ubicado en el mapa", "success");
      setModo("ver");
      setNodoAUbicarId("");
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "No se pudo ubicar el nodo"),
  });

  function manejarNodoUbicado(punto: PuntoRuta) {
    if (!nodoAUbicarId) return;
    ubicarNodo.mutate({ id: Number(nodoAUbicarId), punto });
  }

  // Importar KML/KMZ: sube el archivo, arma copias EDITABLES de cada
  // candidato (nombreSugerido -> codigo/nombre; tipo se PRE-LLENA con
  // tipoSugerido si el backend pudo detectarlo — copiado de un campo del
  // propio archivo o de la carpeta de Google Earth, nunca inventado, ver
  // tipoSugeridoDe en redFisica.ts — así no hay que volver a tipear/
  // renombrar a mano lo que el archivo ya traía) y las deja en el panel para
  // revisión, ver PanelImportarKml más abajo. No guarda nada todavía. Si falla (archivo
  // corrupto, formato inválido, etc.), el error queda FIJO en pantalla (no
  // solo un toast que desaparece) con un botón para descartarlo — ver
  // errorImportacion.
  const importarKml = useMutation({
    mutationFn: async (archivo: File) => {
      const formData = new FormData();
      formData.append("archivo", archivo);
      return (await api.post<PreviaImportacionKml>("/red-fisica/importar-kml", formData)).data;
    },
    onSuccess: (previa) => {
      setErrorImportacion(null);
      setPanel({
        tipo: "importarKml",
        cajas: previa.cajas.map((c) => ({ incluir: true, codigo: c.nombreSugerido, tipo: c.tipoSugerido ?? "", latitud: c.latitud, longitud: c.longitud, descripcion: c.descripcion })),
        tendidos: previa.tendidos.map((t) => ({ incluir: true, nombre: t.nombreSugerido, tipo: t.tipoSugerido ?? "", trazado: t.trazado, descripcion: t.descripcion })),
        omitidos: previa.omitidos,
      });
      const sinTipoDetectado = previa.cajas.filter((c) => !c.tipoSugerido).length + previa.tendidos.filter((t) => !t.tipoSugerido).length;
      if (sinTipoDetectado > 0) {
        mostrarToast(`${sinTipoDetectado} elemento(s) no traían tipo en el archivo — elegilo a mano antes de importar`);
      }
      if (previa.omitidos > 0) {
        mostrarToast(`Se omitieron ${previa.omitidos} elemento(s) sin geometría aprovechable (puntos/líneas)`);
      }
    },
    onError: (error: any) => setErrorImportacion(error.response?.data?.error ?? "No se pudo leer ese archivo"),
  });

  function manejarArchivoSeleccionado(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo si se cancela y reintenta
    if (archivo) {
      setErrorImportacion(null);
      importarKml.mutate(archivo);
    }
  }

  const confirmarImportacion = useMutation({
    mutationFn: async (datos: { cajas: Record<string, unknown>[]; tendidos: Record<string, unknown>[] }) =>
      (await api.post("/red-fisica/importar-kml/confirmar", datos)).data,
    onSuccess: (resultado: { cajasCreadas: number; tendidosCreados: number }) => {
      queryClient.invalidateQueries({ queryKey: ["red-fisica-cajas"] });
      queryClient.invalidateQueries({ queryKey: ["red-fisica-tendidos"] });
      setPanel({ tipo: "lista" });
      mostrarToast(`Importado: ${resultado.cajasCreadas} caja(s), ${resultado.tendidosCreados} tendido(s)`, "success");
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "No se pudo importar"),
  });

  // Exportar KML/KMZ: descarga directa (no abre pestaña nueva) — mismo
  // patrón de blob que abrirPdfEnNuevaPestana en api/client.ts, pero con
  // "download" en vez de "target=_blank" porque acá el destino es guardar el
  // archivo, no verlo. Siempre refleja el estado ACTUAL de la base (incluye
  // cualquier cambio hecho acá después de una importación previa).
  async function exportarArchivo(formato: "kml" | "kmz") {
    setExportando(formato);
    try {
      const respuesta = await api.get(`/red-fisica/exportar-${formato}`, { responseType: "blob" });
      const blobUrl = URL.createObjectURL(respuesta.data);
      const enlace = document.createElement("a");
      enlace.href = blobUrl;
      enlace.download = `red-fisica.${formato}`;
      document.body.appendChild(enlace);
      enlace.click();
      document.body.removeChild(enlace);
      URL.revokeObjectURL(blobUrl);
    } catch (error: any) {
      mostrarToast(error.response?.data?.error ?? `No se pudo exportar el ${formato.toUpperCase()}`);
    } finally {
      setExportando(null);
    }
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-stone-300 dark:border-gray-700">
        <h2 className="text-base font-bold text-gray-900 dark:text-gray-50">Red física</h2>
        <span className="font-mono text-[11px] text-gray-400 dark:text-gray-500">
          {cajasFiltradas.length} caja{cajasFiltradas.length === 1 ? "" : "s"} · {tendidosFiltrados.length} tendido
          {tendidosFiltrados.length === 1 ? "" : "s"}
          {filtros.hayFiltros || filtroNodoId ? " · según filtro" : ""}
        </span>
      </div>
      <div className="px-4 py-2 bg-stone-50 dark:bg-gray-900/40 border-b border-stone-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
        Trazado de la fibra: cajas/NAP y los tramos de cable entre ellas — pensado como reemplazo de Google Earth para este dato.
      </div>

      {/* Franja de herramientas: modos del mapa + importar/exportar */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b border-stone-300 dark:border-gray-700">
        {puedeEditar && (
          <>
            <span className="font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mr-1">Modo</span>
            <div className="inline-flex border border-stone-300 dark:border-gray-600 rounded-sm overflow-hidden">
              <BotonModo activo={modo === "ver"} onClick={() => setModo("ver")}>
                Ver
              </BotonModo>
              <BotonModo activo={modo === "dibujarCaja"} onClick={() => setModo("dibujarCaja")}>
                + Caja / NAP
              </BotonModo>
              <BotonModo activo={modo === "dibujarTendido"} onClick={() => setModo("dibujarTendido")}>
                Trazar tendido
              </BotonModo>
              {puedeVerNodos && (
                <BotonModo activo={modo === "ubicarNodo"} onClick={() => setModo("ubicarNodo")}>
                  Ubicar nodo
                </BotonModo>
              )}
            </div>
            {puedeVerNodos && (
              <>
                {modo === "ubicarNodo" && (
                  <select
                    value={nodoAUbicarId}
                    onChange={(e) => setNodoAUbicarId(e.target.value)}
                    className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-xs"
                  >
                    <option value="">Elegí el nodo a ubicar...</option>
                    {(nodos ?? []).map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.nombre}
                      </option>
                    ))}
                  </select>
                )}
                {modo === "ubicarNodo" && nodoAUbicarId && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">Hacé clic en el mapa para ubicarlo</span>
                )}
              </>
            )}
            <span className="w-px h-5 bg-stone-300 dark:bg-gray-600 mx-1" aria-hidden="true" />
            <input ref={inputArchivoRef} type="file" accept=".kml,.kmz" onChange={manejarArchivoSeleccionado} className="hidden" />
            <button
              onClick={() => inputArchivoRef.current?.click()}
              disabled={importarKml.isPending}
              className="text-xs font-semibold px-3 py-1.5 rounded-sm border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-stone-100 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              {importarKml.isPending ? "Leyendo..." : "Importar KML/KMZ"}
            </button>
          </>
        )}

        <div className="flex-1" />

        <button
          onClick={() => exportarArchivo("kml")}
          disabled={exportando !== null}
          className="text-xs font-semibold px-3 py-1.5 rounded-sm border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-stone-100 dark:hover:bg-gray-700 disabled:opacity-50"
        >
          {exportando === "kml" ? "Exportando..." : "Exportar KML"}
        </button>
        <button
          onClick={() => exportarArchivo("kmz")}
          disabled={exportando !== null}
          className="text-xs font-semibold px-3 py-1.5 rounded-sm border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-stone-100 dark:hover:bg-gray-700 disabled:opacity-50"
        >
          {exportando === "kmz" ? "Exportando..." : "Exportar KMZ"}
        </button>

      </div>

      <BarraBuscadorDocumentos
        filtros={filtros}
        etiquetaBusqueda="Buscar en el mapa · código, tipo, nombre o nodo"
        placeholder="Ej: NAP-012, troncal..."
        mostrarPago={false}
        mostrarFechas={false}
        extras={
          puedeVerNodos && (nodos?.length ?? 0) > 0 ? (
            <label className="flex flex-col gap-1 w-44">
              <span className={CLASE_ETIQUETA}>Nodo</span>
              <select value={filtroNodoId} onChange={(e) => setFiltroNodoId(e.target.value)} className={CLASE_CAMPO}>
                <option value="">Todos los nodos</option>
                {(nodos ?? []).map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.nombre}
                  </option>
                ))}
              </select>
            </label>
          ) : undefined
        }
      />

      {errorImportacion && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
          <p className="text-xs text-red-700 dark:text-red-400">No se pudo leer ese archivo: {errorImportacion}</p>
          <button
            onClick={() => setErrorImportacion(null)}
            className="shrink-0 text-xs font-medium text-red-700 dark:text-red-400 hover:underline"
          >
            Descartar
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 overflow-hidden">
          <MapaRedFisica
            cajas={cajasFiltradas}
            tendidos={tendidosFiltrados}
            nodosUbicados={nodosUbicados}
            modo={modo}
            onCajaDibujada={(punto) => {
              setModo("ver");
              setPanel({ tipo: "nuevaCaja", punto });
            }}
            onTendidoDibujado={(puntos) => {
              setModo("ver");
              setPanel({ tipo: "nuevoTendido", puntos });
            }}
            onNodoUbicado={manejarNodoUbicado}
            onSeleccionarCaja={puedeEditar && modo !== "editarTrazado" ? (caja) => setPanel({ tipo: "editarCaja", caja }) : undefined}
            onSeleccionarTendido={puedeEditar && modo !== "editarTrazado" ? (tendido) => setPanel({ tipo: "editarTendido", tendido }) : undefined}
            previaCajas={previaCajasParaMapa}
            previaTendidos={previaTendidosParaMapa}
            tendidoEnEdicion={panel.tipo === "editarTrazado" ? { id: panel.tendido.id, trazado: panel.tendido.trazado } : null}
            onTrazadoEditado={(puntos) => setPanel((p) => (p.tipo === "editarTrazado" ? { ...p, trazadoActual: puntos } : p))}
          />
        </div>

        <div className="w-80 shrink-0 bg-white dark:bg-gray-800 border-l border-stone-300 dark:border-gray-700 overflow-y-auto p-3">
          {panel.tipo === "nuevaCaja" && (
            <FormularioCaja
              titulo="Nueva caja / NAP"
              nodos={nodos ?? []}
              guardando={crearCaja.isPending}
              onGuardar={(datos) => crearCaja.mutate({ ...datos, latitud: panel.punto.lat, longitud: panel.punto.lng })}
              onCancelar={() => setPanel({ tipo: "lista" })}
            />
          )}
          {panel.tipo === "editarCaja" && (
            <FormularioCaja
              titulo="Editar caja / NAP"
              nodos={nodos ?? []}
              inicial={panel.caja}
              guardando={editarCaja.isPending}
              onGuardar={(datos) => editarCaja.mutate({ id: panel.caja.id, datos: { ...datos, latitud: panel.caja.latitud, longitud: panel.caja.longitud } })}
              onCancelar={() => setPanel({ tipo: "lista" })}
            />
          )}
          {panel.tipo === "nuevoTendido" && (
            <FormularioTendido
              titulo={`Nuevo tendido (${formatearLargo(largoTendidoMetros(panel.puntos))})`}
              nodos={nodos ?? []}
              cajas={cajas ?? []}
              guardando={crearTendido.isPending}
              onGuardar={(datos) => crearTendido.mutate({ ...datos, trazado: panel.puntos })}
              onCancelar={() => setPanel({ tipo: "lista" })}
            />
          )}
          {panel.tipo === "editarTendido" && (
            <FormularioTendido
              titulo={`Editar tendido (${formatearLargo(largoTendidoMetros(panel.tendido.trazado))})`}
              nodos={nodos ?? []}
              cajas={cajas ?? []}
              inicial={panel.tendido}
              guardando={editarTendido.isPending}
              onGuardar={(datos) => editarTendido.mutate({ id: panel.tendido.id, datos })}
              onCancelar={() => setPanel({ tipo: "lista" })}
              onEditarTrazado={() => {
                setModo("editarTrazado");
                setPanel({ tipo: "editarTrazado", tendido: panel.tendido, trazadoActual: panel.tendido.trazado });
              }}
            />
          )}

          {panel.tipo === "editarTrazado" && (
            <PanelEditarTrazado
              tendido={panel.tendido}
              trazadoActual={panel.trazadoActual}
              guardando={editarTendido.isPending}
              onGuardar={() =>
                editarTendido.mutate({
                  id: panel.tendido.id,
                  datos: {
                    nombre: panel.tendido.nombre,
                    tipo: panel.tendido.tipo,
                    origenCajaId: panel.tendido.origenCajaId,
                    destinoCajaId: panel.tendido.destinoCajaId,
                    nodoId: panel.tendido.nodoId,
                    colorHex: panel.tendido.colorHex,
                    estado: panel.tendido.estado,
                    trazado: panel.trazadoActual,
                  },
                })
              }
              onCancelar={() => {
                setModo("ver");
                setPanel({ tipo: "lista" });
              }}
            />
          )}

          {panel.tipo === "importarKml" && (
            <PanelImportarKml
              cajas={panel.cajas}
              tendidos={panel.tendidos}
              omitidos={panel.omitidos}
              onCambiarCajas={(cajasNuevas) => setPanel({ ...panel, cajas: cajasNuevas })}
              onCambiarTendidos={(tendidosNuevos) => setPanel({ ...panel, tendidos: tendidosNuevos })}
              guardando={confirmarImportacion.isPending}
              onConfirmar={() =>
                confirmarImportacion.mutate({
                  cajas: panel.cajas
                    .filter((c) => c.incluir)
                    .map((c) => ({ codigo: c.codigo, tipo: c.tipo, latitud: c.latitud, longitud: c.longitud, descripcion: c.descripcion })),
                  tendidos: panel.tendidos
                    .filter((t) => t.incluir)
                    .map((t) => ({ nombre: t.nombre, tipo: t.tipo, trazado: t.trazado })),
                })
              }
              onCancelar={() => setPanel({ tipo: "lista" })}
            />
          )}

          {panel.tipo === "lista" && (
            <>
              <h3 className="font-mono text-[11px] uppercase tracking-[0.15em] text-gray-600 dark:text-gray-300 mb-2">
                Cajas / NAP ({cajasFiltradas.length})
              </h3>
              {cargandoCajas && <p className="text-xs text-gray-400 dark:text-gray-500">Cargando...</p>}
              {!cargandoCajas && cajasFiltradas.length === 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">{filtros.hayFiltros ? "Ninguna coincide con la búsqueda." : "Ninguna todavía."}</p>
              )}
              <ul className="space-y-1 mb-4">
                {cajasFiltradas.map((c) => (
                  <li key={c.id} className="px-2 py-1.5 rounded-md border border-gray-100 dark:border-gray-700">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <p className="text-sm font-mono text-gray-800 dark:text-gray-100"><Resaltar texto={c.codigo} termino={filtros.busquedaAplicada} /></p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {c.tipo}
                          {c.nodo && ` · ${c.nodo.nombre}`}
                        </p>
                      </div>
                      {puedeEditar && (
                        <FilaAcciones
                          confirmando={confirmandoBorrado?.tipo === "caja" && confirmandoBorrado.id === c.id}
                          onEditar={() => setPanel({ tipo: "editarCaja", caja: c })}
                          onPedirBorrar={() => setConfirmandoBorrado({ tipo: "caja", id: c.id })}
                          onCancelarBorrar={() => setConfirmandoBorrado(null)}
                          onConfirmarBorrar={() => desactivarCaja.mutate(c.id)}
                          borrando={desactivarCaja.isPending && desactivarCaja.variables === c.id}
                        />
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              <h3 className="font-mono text-[11px] uppercase tracking-[0.15em] text-gray-600 dark:text-gray-300 mb-2">
                Tendidos ({tendidosFiltrados.length})
              </h3>
              {cargandoTendidos && <p className="text-xs text-gray-400 dark:text-gray-500">Cargando...</p>}
              {!cargandoTendidos && tendidosFiltrados.length === 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500">{filtros.hayFiltros ? "Ninguno coincide con la búsqueda." : "Ninguno todavía."}</p>
              )}
              <ul className="space-y-1">
                {tendidosFiltrados.map((t) => (
                  <li key={t.id} className="px-2 py-1.5 rounded-md border border-gray-100 dark:border-gray-700">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <p className="text-sm text-gray-800 dark:text-gray-100"><Resaltar texto={t.nombre || t.tipo} termino={filtros.busquedaAplicada} /></p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {t.tipo} · {formatearLargo(largoTendidoMetros(t.trazado))}
                          {t.estado !== "ACTIVO" && ` · ${t.estado}`}
                        </p>
                      </div>
                      {puedeEditar && (
                        <FilaAcciones
                          confirmando={confirmandoBorrado?.tipo === "tendido" && confirmandoBorrado.id === t.id}
                          onEditar={() => setPanel({ tipo: "editarTendido", tendido: t })}
                          onPedirBorrar={() => setConfirmandoBorrado({ tipo: "tendido", id: t.id })}
                          onCancelarBorrar={() => setConfirmandoBorrado(null)}
                          onConfirmarBorrar={() => desactivarTendido.mutate(t.id)}
                          borrando={desactivarTendido.isPending && desactivarTendido.variables === t.id}
                        />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function BotonModo({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs font-semibold px-3 py-1.5 border-l first:border-l-0 border-stone-300 dark:border-gray-600 ${
        activo ? "bg-brand-700 text-white" : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-stone-50 dark:hover:bg-gray-700"
      }`}
    >
      {children}
    </button>
  );
}

// Confirmación de borrado EN FLUJO (dos pasos: "Desactivar" -> "¿Seguro? Sí/Cancelar"
// en el mismo lugar) — a propósito no usa useConfirm() (mismo motivo que el
// Modal, ver memoria del proyecto: ConfirmProvider también renderiza vía
// Modal.tsx y en esta máquina puede no pintar).
function FilaAcciones({
  confirmando,
  onEditar,
  onPedirBorrar,
  onCancelarBorrar,
  onConfirmarBorrar,
  borrando,
}: {
  confirmando: boolean;
  onEditar: () => void;
  onPedirBorrar: () => void;
  onCancelarBorrar: () => void;
  onConfirmarBorrar: () => void;
  borrando: boolean;
}) {
  if (confirmando) {
    return (
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-[11px] text-gray-500 dark:text-gray-400">¿Desactivar?</span>
        <div className="flex gap-2">
          <button onClick={onConfirmarBorrar} disabled={borrando} className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline disabled:opacity-50">
            {borrando ? "..." : "Sí"}
          </button>
          <button onClick={onCancelarBorrar} className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:underline">
            Cancelar
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-2 shrink-0">
      <button onClick={onEditar} className="text-xs font-medium text-brand-700 dark:text-brand-300 hover:underline">
        Editar
      </button>
      <button onClick={onPedirBorrar} className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline">
        Desactivar
      </button>
    </div>
  );
}

const CAMPO = "border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm w-full";

function FormularioCaja({
  titulo,
  nodos,
  inicial,
  guardando,
  onGuardar,
  onCancelar,
}: {
  titulo: string;
  nodos: NodoRed[];
  inicial?: CajaFibra;
  guardando: boolean;
  onGuardar: (datos: { codigo: string; tipo: string; capacidadPuertos: string; descripcion: string; nodoId: string }) => void;
  onCancelar: () => void;
}) {
  const [codigo, setCodigo] = useState(inicial?.codigo ?? "");
  const [tipo, setTipo] = useState(inicial?.tipo ?? "");
  const [capacidadPuertos, setCapacidadPuertos] = useState(inicial?.capacidadPuertos ? String(inicial.capacidadPuertos) : "");
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? "");
  const [nodoId, setNodoId] = useState(inicial?.nodoId ? String(inicial.nodoId) : "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!codigo.trim() || !tipo.trim()) return;
        onGuardar({ codigo, tipo, capacidadPuertos, descripcion, nodoId });
      }}
      className="space-y-2"
    >
      <h3 className="font-mono text-[11px] uppercase tracking-[0.15em] text-gray-600 dark:text-gray-300 mb-1">{titulo}</h3>
      <input autoFocus required placeholder="Código (ej. NAP-045)" value={codigo} onChange={(e) => setCodigo(e.target.value)} className={CAMPO} />
      <input required list="tipos-caja" placeholder="Tipo (ej. NAP)" value={tipo} onChange={(e) => setTipo(e.target.value)} className={CAMPO} />
      <datalist id="tipos-caja">
        {TIPOS_CAJA_SUGERIDOS.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <input
        type="number"
        min={0}
        placeholder="Capacidad de puertos (opcional)"
        value={capacidadPuertos}
        onChange={(e) => setCapacidadPuertos(e.target.value)}
        className={CAMPO}
      />
      <textarea placeholder="Descripción (opcional)" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className={CAMPO} rows={2} />
      {nodos.length > 0 && (
        <select value={nodoId} onChange={(e) => setNodoId(e.target.value)} className={CAMPO}>
          <option value="">Sin nodo asignado</option>
          {nodos.map((n) => (
            <option key={n.id} value={n.id}>
              {n.nombre}
            </option>
          ))}
        </select>
      )}
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={guardando} className="flex-1 bg-brand-700 text-white py-1.5 rounded-md text-sm font-semibold hover:bg-brand-800 disabled:opacity-50">
          {guardando ? "Guardando..." : "Guardar"}
        </button>
        <button type="button" onClick={onCancelar} className="flex-1 bg-stone-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 py-1.5 rounded-md text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-500">
          Cancelar
        </button>
      </div>
    </form>
  );
}

function FormularioTendido({
  titulo,
  nodos,
  cajas,
  inicial,
  guardando,
  onGuardar,
  onCancelar,
  onEditarTrazado,
}: {
  titulo: string;
  nodos: NodoRed[];
  cajas: CajaFibra[];
  inicial?: TendidoFibra;
  guardando: boolean;
  onGuardar: (datos: {
    nombre: string;
    tipo: string;
    origenCajaId: string;
    destinoCajaId: string;
    nodoId: string;
    colorHex: string;
    estado?: string;
  }) => void;
  onCancelar: () => void;
  // Solo tiene sentido editando un tendido YA guardado (no al crear uno
  // nuevo, donde el trazo recién se dibujó) — cambia a PanelEditarTrazado.
  onEditarTrazado?: () => void;
}) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [tipo, setTipo] = useState(inicial?.tipo ?? "");
  const [origenCajaId, setOrigenCajaId] = useState(inicial?.origenCajaId ? String(inicial.origenCajaId) : "");
  const [destinoCajaId, setDestinoCajaId] = useState(inicial?.destinoCajaId ? String(inicial.destinoCajaId) : "");
  const [nodoId, setNodoId] = useState(inicial?.nodoId ? String(inicial.nodoId) : "");
  const [colorHex, setColorHex] = useState(inicial?.colorHex ?? "");
  const [estado, setEstado] = useState(inicial?.estado ?? "ACTIVO");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!tipo.trim()) return;
        onGuardar({ nombre, tipo, origenCajaId, destinoCajaId, nodoId, colorHex, ...(inicial ? { estado } : {}) });
      }}
      className="space-y-2"
    >
      <h3 className="font-mono text-[11px] uppercase tracking-[0.15em] text-gray-600 dark:text-gray-300 mb-1">{titulo}</h3>
      <input autoFocus placeholder="Nombre (opcional)" value={nombre} onChange={(e) => setNombre(e.target.value)} className={CAMPO} />
      <input required list="tipos-tendido" placeholder="Tipo (ej. Troncal)" value={tipo} onChange={(e) => setTipo(e.target.value)} className={CAMPO} />
      <datalist id="tipos-tendido">
        {TIPOS_TENDIDO_SUGERIDOS.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      {cajas.length > 0 && (
        <>
          <select value={origenCajaId} onChange={(e) => setOrigenCajaId(e.target.value)} className={CAMPO}>
            <option value="">Caja de origen (opcional)</option>
            {cajas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo}
              </option>
            ))}
          </select>
          <select value={destinoCajaId} onChange={(e) => setDestinoCajaId(e.target.value)} className={CAMPO}>
            <option value="">Caja de destino (opcional)</option>
            {cajas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo}
              </option>
            ))}
          </select>
        </>
      )}
      {nodos.length > 0 && (
        <select value={nodoId} onChange={(e) => setNodoId(e.target.value)} className={CAMPO}>
          <option value="">Sin nodo asignado</option>
          {nodos.map((n) => (
            <option key={n.id} value={n.id}>
              {n.nombre}
            </option>
          ))}
        </select>
      )}
      {inicial && (
        <select value={estado} onChange={(e) => setEstado(e.target.value)} className={CAMPO}>
          {ESTADOS_TENDIDO.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      )}
      <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        Color propio (opcional)
        <input type="color" value={colorHex || "#6366f1"} onChange={(e) => setColorHex(e.target.value)} className="h-7 w-10 rounded border border-stone-300 dark:border-gray-600" />
        {colorHex && (
          <button type="button" onClick={() => setColorHex("")} className="text-[11px] text-gray-400 hover:underline">
            quitar
          </button>
        )}
      </label>
      {onEditarTrazado && (
        <button
          type="button"
          onClick={onEditarTrazado}
          className="w-full text-xs font-medium py-1.5 rounded-md border border-dashed border-stone-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-stone-50 dark:hover:bg-gray-700"
        >
          Editar trazado en el mapa
        </button>
      )}
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={guardando} className="flex-1 bg-brand-700 text-white py-1.5 rounded-md text-sm font-semibold hover:bg-brand-800 disabled:opacity-50">
          {guardando ? "Guardando..." : "Guardar"}
        </button>
        <button type="button" onClick={onCancelar} className="flex-1 bg-stone-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 py-1.5 rounded-md text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-500">
          Cancelar
        </button>
      </div>
    </form>
  );
}

// Modo edición de vértices en el mapa: arrastrar/agregar/quitar puntos de un
// tendido ya guardado — la capa editable la dibuja MapaRedFisica.tsx
// (tendidoEnEdicion), acá solo se muestran las instrucciones, el largo en
// vivo y el botón para confirmar. "Cancelar" descarta los cambios de trazo
// sin tocar la base — el trazo guardado solo cambia al guardar.
function PanelEditarTrazado({
  tendido,
  trazadoActual,
  guardando,
  onGuardar,
  onCancelar,
}: {
  tendido: TendidoFibra;
  trazadoActual: PuntoRuta[];
  guardando: boolean;
  onGuardar: () => void;
  onCancelar: () => void;
}) {
  return (
    <div>
      <h3 className="font-mono text-[11px] uppercase tracking-[0.15em] text-gray-600 dark:text-gray-300 mb-1">Editar trazado — {tendido.nombre || tendido.tipo}</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Arrastrá un punto para moverlo, hacé clic sobre un punto para borrarlo, arrastrá el rombo de un punto medio para agregar uno nuevo ahí.
      </p>
      <p className="text-xs text-gray-600 dark:text-gray-300 mb-3">
        {trazadoActual.length} punto(s) · {formatearLargo(largoTendidoMetros(trazadoActual))}
      </p>
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onGuardar}
          disabled={guardando || trazadoActual.length < 2}
          className="flex-1 bg-brand-700 text-white py-1.5 rounded-md text-sm font-semibold hover:bg-brand-800 disabled:opacity-50"
        >
          {guardando ? "Guardando..." : "Guardar trazado"}
        </button>
        <button type="button" onClick={onCancelar} className="flex-1 bg-stone-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 py-1.5 rounded-md text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-500">
          Cancelar
        </button>
      </div>
    </div>
  );
}

const CAMPO_CHICO =
  "border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-1.5 py-1 text-xs w-full";

// Revisión de una vista previa de importación KML/KMZ, ANTES de guardar nada
// — cada fila viene con "incluir" tildado por defecto y "tipo" vacío a
// propósito (obliga a elegirlo, con "Aplicar a todas/os" para hacerlo rápido
// cuando son muchos). Se pinta en el mapa en naranja punteado (ver
// previaCajas/previaTendidos en MapaRedFisica.tsx) para que el usuario vea
// dónde va a caer cada cosa antes de confirmar.
function PanelImportarKml({
  cajas,
  tendidos,
  omitidos,
  onCambiarCajas,
  onCambiarTendidos,
  guardando,
  onConfirmar,
  onCancelar,
}: {
  cajas: CajaRevision[];
  tendidos: TendidoRevision[];
  omitidos: number;
  onCambiarCajas: (cajas: CajaRevision[]) => void;
  onCambiarTendidos: (tendidos: TendidoRevision[]) => void;
  guardando: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  const { mostrarToast } = useToast();
  const [tipoCajaMasivo, setTipoCajaMasivo] = useState("");
  const [tipoTendidoMasivo, setTipoTendidoMasivo] = useState("");

  const cajasIncluidas = cajas.filter((c) => c.incluir).length;
  const tendidosIncluidos = tendidos.filter((t) => t.incluir).length;
  // Contados por separado (no solo un booleano) para poder decir CUÁNTOS
  // faltan — con listas largas y scrolleables (ver max-h-52 más abajo) un
  // aviso vago de "falta alguno" es fácil de pasar por alto si los que
  // faltan quedaron scrolleados fuera de vista.
  const cajasSinTipo = cajas.filter((c) => c.incluir && !c.tipo.trim()).length;
  const tendidosSinTipo = tendidos.filter((t) => t.incluir && !t.tipo.trim()).length;
  const faltaTipo = cajasSinTipo > 0 || tendidosSinTipo > 0;

  // El botón NUNCA queda deshabilitado por "falta tipo" en silencio — eso es
  // justo lo confuso: un botón gris sin decir por qué. Al hacer clic, si
  // falta algo, se avisa explícito con el conteo exacto (mismo texto que el
  // aviso de abajo) y no se manda nada; si está todo, importa directo.
  function manejarClickImportar() {
    if (cajasIncluidas === 0 && tendidosIncluidos === 0) {
      mostrarToast("Marcá al menos un elemento para importar");
      return;
    }
    if (faltaTipo) {
      const partes = [cajasSinTipo > 0 ? `${cajasSinTipo} caja(s)` : "", tendidosSinTipo > 0 ? `${tendidosSinTipo} tendido(s)` : ""].filter(Boolean);
      mostrarToast(`Falta elegir el tipo de ${partes.join(" y ")} antes de importar`);
      return;
    }
    onConfirmar();
  }

  function actualizarCaja(indice: number, cambios: Partial<CajaRevision>) {
    onCambiarCajas(cajas.map((c, i) => (i === indice ? { ...c, ...cambios } : c)));
  }
  function actualizarTendido(indice: number, cambios: Partial<TendidoRevision>) {
    onCambiarTendidos(tendidos.map((t, i) => (i === indice ? { ...t, ...cambios } : t)));
  }

  return (
    <div>
      <h3 className="font-mono text-[11px] uppercase tracking-[0.15em] text-gray-600 dark:text-gray-300 mb-1">Revisar importación</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        {cajas.length} caja(s) y {tendidos.length} tendido(s) encontrados
        {omitidos > 0 && ` (${omitidos} omitido(s) sin geometría aprovechable)`}. Elegí el tipo de cada uno antes de guardar — se ven en naranja
        punteado en el mapa.
      </p>

      {cajas.length > 0 && (
        <div className="mb-4">
          <h4 className="font-mono text-[11px] uppercase tracking-[0.15em] text-gray-600 dark:text-gray-300 mb-1.5">
            Cajas / NAP ({cajasIncluidas}/{cajas.length})
            {cajasSinTipo > 0 && <span className="text-amber-600 dark:text-amber-400 font-normal"> — {cajasSinTipo} sin tipo</span>}
          </h4>
          <div className="flex gap-1 mb-2">
            <input
              list="tipos-caja-masivo"
              placeholder="Tipo para todas..."
              value={tipoCajaMasivo}
              onChange={(e) => setTipoCajaMasivo(e.target.value)}
              className={CAMPO_CHICO}
            />
            <datalist id="tipos-caja-masivo">
              {TIPOS_CAJA_SUGERIDOS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <button
              type="button"
              onClick={() => tipoCajaMasivo.trim() && onCambiarCajas(cajas.map((c) => ({ ...c, tipo: tipoCajaMasivo.trim() })))}
              className="shrink-0 text-xs font-medium px-2 py-1 rounded-md bg-stone-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-stone-200 dark:hover:bg-gray-600"
            >
              Aplicar a todas
            </button>
          </div>
          <ul className="space-y-1 max-h-52 overflow-y-auto">
            {cajas.map((c, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <input type="checkbox" checked={c.incluir} onChange={(e) => actualizarCaja(i, { incluir: e.target.checked })} className="shrink-0" />
                <input
                  value={c.codigo}
                  onChange={(e) => actualizarCaja(i, { codigo: e.target.value })}
                  disabled={!c.incluir}
                  className={`${CAMPO_CHICO} disabled:opacity-40`}
                />
                <input
                  list="tipos-caja-masivo"
                  placeholder="Tipo"
                  value={c.tipo}
                  onChange={(e) => actualizarCaja(i, { tipo: e.target.value })}
                  disabled={!c.incluir}
                  className={`${CAMPO_CHICO} disabled:opacity-40 ${c.incluir && !c.tipo.trim() ? "border-amber-400 dark:border-amber-500" : ""}`}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {tendidos.length > 0 && (
        <div className="mb-4">
          <h4 className="font-mono text-[11px] uppercase tracking-[0.15em] text-gray-600 dark:text-gray-300 mb-1.5">
            Tendidos ({tendidosIncluidos}/{tendidos.length})
            {tendidosSinTipo > 0 && <span className="text-amber-600 dark:text-amber-400 font-normal"> — {tendidosSinTipo} sin tipo</span>}
          </h4>
          <div className="flex gap-1 mb-2">
            <input
              list="tipos-tendido-masivo"
              placeholder="Tipo para todos..."
              value={tipoTendidoMasivo}
              onChange={(e) => setTipoTendidoMasivo(e.target.value)}
              className={CAMPO_CHICO}
            />
            <datalist id="tipos-tendido-masivo">
              {TIPOS_TENDIDO_SUGERIDOS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <button
              type="button"
              onClick={() => tipoTendidoMasivo.trim() && onCambiarTendidos(tendidos.map((t) => ({ ...t, tipo: tipoTendidoMasivo.trim() })))}
              className="shrink-0 text-xs font-medium px-2 py-1 rounded-md bg-stone-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-stone-200 dark:hover:bg-gray-600"
            >
              Aplicar a todos
            </button>
          </div>
          <ul className="space-y-1 max-h-52 overflow-y-auto">
            {tendidos.map((t, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <input type="checkbox" checked={t.incluir} onChange={(e) => actualizarTendido(i, { incluir: e.target.checked })} className="shrink-0" />
                <input
                  value={t.nombre}
                  onChange={(e) => actualizarTendido(i, { nombre: e.target.value })}
                  disabled={!t.incluir}
                  className={`${CAMPO_CHICO} disabled:opacity-40`}
                />
                <input
                  list="tipos-tendido-masivo"
                  placeholder="Tipo"
                  value={t.tipo}
                  onChange={(e) => actualizarTendido(i, { tipo: e.target.value })}
                  disabled={!t.incluir}
                  className={`${CAMPO_CHICO} disabled:opacity-40 ${t.incluir && !t.tipo.trim() ? "border-amber-400 dark:border-amber-500" : ""}`}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {faltaTipo && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400 mb-2">
          Falta elegir el tipo de {cajasSinTipo > 0 && `${cajasSinTipo} caja(s)`}
          {cajasSinTipo > 0 && tendidosSinTipo > 0 && " y "}
          {tendidosSinTipo > 0 && `${tendidosSinTipo} tendido(s)`} — resaltado en naranja en la lista de arriba (puede estar más abajo del scroll).
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={manejarClickImportar}
          disabled={guardando}
          className="flex-1 bg-brand-700 text-white py-1.5 rounded-md text-sm font-semibold hover:bg-brand-800 disabled:opacity-50"
        >
          {guardando ? "Importando..." : `Importar ${cajasIncluidas + tendidosIncluidos} elemento(s)`}
        </button>
        <button type="button" onClick={onCancelar} className="flex-1 bg-stone-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 py-1.5 rounded-md text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-500">
          Cancelar
        </button>
      </div>
    </div>
  );
}
