import { useState, useEffect, Fragment } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import {
  api,
  urlArchivoSubido,
  ETIQUETAS_MANTENIMIENTO_VEHICULO,
  type Vehiculo,
  type Sucursal,
  type CargaCombustible,
  type MantenimientoVehiculo,
  type TipoMantenimientoVehiculo,
  type MarcaVehiculo,
  type ModeloVehiculo,
  type UsoVehiculo,
  type PlanMantenimientoVehiculo,
  type AlertaMantenimientoVehiculo,
  type ReporteVehiculo,
  type RespuestaPaginada,
} from "../api/client";
import { CAMPOS_CHECKLIST_ENTREGA } from "../constants/checklistVehiculo";
import { Camera, TriangleAlert } from "lucide-react";
import { Paginacion } from "../components/Paginacion";
import { usePermiso } from "../context/AuthContext";
import { useFiltrosListado, BarraBuscadorDocumentos } from "../components/BuscadorDocumentos";
import { CLASE_CAMPO as CLASE_CAMPO_FORMATO, CLASE_ETIQUETA, Resaltar } from "../components/FormatoDocumento";

const TAMANO_PAGINA = 20;

const TIPOS_MANTENIMIENTO: TipoMantenimientoVehiculo[] = [
  "CAMBIO_ACEITE",
  "CAMBIO_FILTRO_ACEITE",
  "CAMBIO_FILTRO_AIRE",
  "CAMBIO_PASTILLAS_FRENO",
  "CAMBIO_LLANTAS",
  "ALINEACION_BALANCEO",
  "REVISION_GENERAL",
  "OTRO",
];

const CAMPO = "border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm w-full";
const BOTON_MAS = "px-2.5 border border-stone-300 dark:border-gray-600 rounded-md text-sm text-gray-600 dark:text-gray-300 hover:bg-stone-50 dark:hover:bg-gray-700 shrink-0";

export function VehiculosPage() {
  const queryClient = useQueryClient();
  const puedeEditar = usePermiso("vehiculos_editar");

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const formVacio = { placa: "", marcaId: "", modeloId: "", anio: "", color: "", sucursalId: "" };
  const [form, setForm] = useState(formVacio);

  const [pagina, setPagina] = useState(1);
  // Buscador compartido de los listados (ver components/BuscadorDocumentos.tsx);
  // el backend ya busca por "q", y el hook vuelve solo a la página 1.
  const filtros = useFiltrosListado(setPagina);

  const [vehiculoEditandoId, setVehiculoEditandoId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ marcaId: "", modeloId: "", anio: "", color: "", sucursalId: "" });

  const [vehiculoConfirmandoBajaId, setVehiculoConfirmandoBajaId] = useState<number | null>(null);
  const [vehiculoDetalleId, setVehiculoDetalleId] = useState<number | null>(null);

  const { data: sucursales } = useQuery({
    queryKey: ["sucursales"],
    queryFn: async () => (await api.get<Sucursal[]>("/sucursales")).data,
  });

  const { data: alertas } = useQuery({
    queryKey: ["alertas-mantenimiento-vehiculos"],
    queryFn: async () => (await api.get<AlertaMantenimientoVehiculo[]>("/vehiculos/alertas-mantenimiento")).data,
    // Se recalcula solo con el kilometraje que ya está guardado (no
    // depende de que alguien tenga la pantalla abierta en vivo), pero
    // refrescar cada tanto evita que quede desactualizado en una sesión
    // larga sin recargar la página.
    refetchInterval: 5 * 60 * 1000,
  });

  const { data: respuesta, isLoading } = useQuery({
    queryKey: ["vehiculos", pagina, ...filtros.clave],
    queryFn: async () =>
      (
        await api.get<RespuestaPaginada<Vehiculo>>("/vehiculos", {
          params: { page: pagina, pageSize: TAMANO_PAGINA, ...filtros.params },
        })
      ).data,
    placeholderData: keepPreviousData,
  });
  const vehiculos = respuesta?.datos;

  const crearVehiculo = useMutation({
    mutationFn: async () =>
      api.post("/vehiculos", {
        placa: form.placa,
        marcaId: Number(form.marcaId),
        modeloId: Number(form.modeloId),
        anio: form.anio ? Number(form.anio) : undefined,
        color: form.color || undefined,
        sucursalId: form.sucursalId ? Number(form.sucursalId) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehiculos"] });
      setForm(formVacio);
      setMostrarFormulario(false);
    },
  });

  const editarVehiculo = useMutation({
    mutationFn: async (id: number) =>
      api.put(`/vehiculos/${id}`, {
        marcaId: Number(editForm.marcaId),
        modeloId: Number(editForm.modeloId),
        anio: editForm.anio ? Number(editForm.anio) : undefined,
        color: editForm.color || undefined,
        sucursalId: editForm.sucursalId ? Number(editForm.sucursalId) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehiculos"] });
      setVehiculoEditandoId(null);
    },
  });

  const desactivarVehiculo = useMutation({
    mutationFn: async (id: number) => api.patch(`/vehiculos/${id}/desactivar`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehiculos"] });
      setVehiculoConfirmandoBajaId(null);
    },
  });

  const reactivarVehiculo = useMutation({
    mutationFn: async (id: number) => api.patch(`/vehiculos/${id}/reactivar`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["vehiculos"] }),
  });

  function abrirEdicion(v: Vehiculo) {
    setEditForm({
      marcaId: String(v.marcaId),
      modeloId: String(v.modeloId),
      anio: v.anio ? String(v.anio) : "",
      color: v.color ?? "",
      sucursalId: v.sucursalId ? String(v.sucursalId) : "",
    });
    setVehiculoEditandoId(vehiculoEditandoId === v.id ? null : v.id);
  }

  return (
    <div>

      {alertas && alertas.length > 0 && (
        <div className="mb-4 rounded-sm border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/15 p-3">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.15em] font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5 mb-2">
            <TriangleAlert className="w-3.5 h-3.5" /> Mantenimientos por atender
          </p>
          <div className="space-y-1">
            {alertas.map((a) => (
              <button
                key={`${a.vehiculoId}-${a.tipo}`}
                onClick={() => setVehiculoDetalleId(a.vehiculoId)}
                className="w-full text-left flex items-center justify-between gap-2 text-xs rounded-md px-2 py-1.5 hover:bg-amber-100 dark:hover:bg-amber-900/30"
              >
                <span className="text-gray-700 dark:text-gray-200">
                  <span className="font-semibold font-mono">{a.placa}</span> — {a.marca} {a.modelo} · {ETIQUETAS_MANTENIMIENTO_VEHICULO[a.tipo]}
                </span>
                <span className={`font-medium shrink-0 ${a.estado === "VENCIDO" ? "text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}`}>
                  {a.estado === "VENCIDO" ? `Vencido hace ${Math.abs(a.kmRestantes).toLocaleString("es-EC")} km` : `Faltan ${a.kmRestantes.toLocaleString("es-EC")} km`}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}


      <div className="bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700 overflow-hidden">
        {/* Flota de vehículos: barra de título con conteo y alta */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-stone-300 dark:border-gray-700">
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-50">Vehículos</h2>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-gray-400 dark:text-gray-500">
              {respuesta ? `${respuesta.paginacion.total} vehículo${respuesta.paginacion.total === 1 ? "" : "s"}` : ""}
            </span>
            {puedeEditar && (
              <button
                onClick={() => setMostrarFormulario(!mostrarFormulario)}
                className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 px-3 py-1.5 rounded-sm text-sm font-semibold hover:bg-stone-50 dark:hover:bg-gray-700"
              >
                {mostrarFormulario ? "Cancelar" : "+ Nuevo vehículo"}
              </button>
            )}
          </div>
        </div>
        {mostrarFormulario && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              crearVehiculo.mutate();
            }}
            className="p-4 bg-stone-50 dark:bg-gray-900/40 border-b border-stone-300 dark:border-gray-700 grid grid-cols-2 gap-3"
          >
            <p className="col-span-2 font-mono text-[10.5px] uppercase tracking-[0.15em] text-gray-600 dark:text-gray-300">Nuevo vehículo</p>
            <input
              placeholder="Placa"
              required
              value={form.placa}
              onChange={(e) => setForm({ ...form, placa: e.target.value.toUpperCase() })}
              className={CAMPO}
            />
            <input
              type="number"
              placeholder="Año (opcional)"
              value={form.anio}
              onChange={(e) => setForm({ ...form, anio: e.target.value })}
              className={CAMPO}
            />
            <SelectorMarcaModelo
              marcaId={form.marcaId}
              modeloId={form.modeloId}
              onCambiarMarca={(marcaId) => setForm({ ...form, marcaId, modeloId: "" })}
              onCambiarModelo={(modeloId) => setForm({ ...form, modeloId })}
            />
            <input
              placeholder="Color (opcional)"
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
              className={CAMPO}
            />
            <select
              value={form.sucursalId}
              onChange={(e) => setForm({ ...form, sucursalId: e.target.value })}
              className={CAMPO}
            >
              <option value="">Sucursal (opcional)...</option>
              {sucursales?.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>

            <button
              type="submit"
              disabled={crearVehiculo.isPending}
              className="col-span-2 bg-brand-700 text-white py-2 rounded-sm text-sm font-semibold hover:bg-brand-800 disabled:opacity-50"
            >
              {crearVehiculo.isPending ? "Guardando..." : "Guardar vehículo"}
            </button>
            {crearVehiculo.isError && (
              <p className="col-span-2 text-red-600 dark:text-red-400 text-sm">
                {(crearVehiculo.error as any)?.response?.data?.error ?? "Error al guardar el vehículo"}
              </p>
            )}
          </form>
        )}
        <BarraBuscadorDocumentos
          filtros={filtros}
          etiquetaBusqueda="Buscar · placa, marca o modelo"
          placeholder="Ej: ABC-1234, Toyota, Hilux..."
          opcionesEstado={[
            { valor: "ACTIVO", etiqueta: "Activo" },
            { valor: "BAJA", etiqueta: "De baja" },
          ]}
          mostrarPago={false}
          mostrarFechas={false}
          extras={
            <label className="flex flex-col gap-1 w-44">
              <span className={CLASE_ETIQUETA}>Sucursal</span>
              <select
                value={filtros.extra.sucursalId ?? ""}
                onChange={(e) => filtros.setExtra("sucursalId", e.target.value)}
                className={CLASE_CAMPO_FORMATO}
              >
                <option value="">Todas</option>
                <option value="sin">Sin asignar</option>
                {sucursales?.map((suc) => (
                  <option key={suc.id} value={suc.id}>
                    {suc.nombre}
                  </option>
                ))}
              </select>
            </label>
          }
        />
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700 text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 [&_th]:font-medium">
            <tr>
              <th className="px-4 py-2">Placa</th>
              <th className="px-4 py-2">Marca / Modelo</th>
              <th className="px-4 py-2">Uso hoy</th>
              <th className="px-4 py-2 text-right">Km actual</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">Cargando...</td>
              </tr>
            )}
            {!isLoading && vehiculos?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">
                  {filtros.hayFiltros ? "Ningún vehículo coincide con la búsqueda." : "No hay vehículos registrados"}
                </td>
              </tr>
            )}
            {vehiculos?.map((v) => {
              const usoActual = v.usos[0];
              return (
                <Fragment key={v.id}>
                  <tr className={`border-t border-stone-100 dark:border-gray-700 hover:bg-stone-50 dark:hover:bg-gray-700/30 ${v.activo ? "" : "text-gray-400 dark:text-gray-500"}`}>
                    <td className="px-4 py-2 font-mono text-xs font-semibold"><Resaltar texto={v.placa} termino={filtros.busquedaAplicada} /></td>
                    <td className="px-4 py-2">
                      <Resaltar texto={`${v.marca.nombre} ${v.modelo.nombre}`} termino={filtros.busquedaAplicada} />
                      {v.anio && <span className="text-gray-400 dark:text-gray-500"> ({v.anio})</span>}
                    </td>
                    <td className="px-4 py-2">
                      {usoActual ? (
                        <span className="font-mono text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-sm bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                          {usoActual.empleado.nombres} {usoActual.empleado.apellidos}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-gray-500 italic">Libre</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums">{v.kilometrajeActual != null ? v.kilometrajeActual.toLocaleString("es-EC") : "—"}</td>
                    <td className="px-4 py-2">
                      <span className={`font-mono text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-sm ${v.activo ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" : "bg-stone-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"}`}>
                        {v.activo ? "Activo" : "De baja"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right space-x-3 whitespace-nowrap">
                      <button
                        onClick={() => setVehiculoDetalleId(vehiculoDetalleId === v.id ? null : v.id)}
                        className="text-brand-700 dark:text-brand-300 hover:underline text-xs font-medium"
                      >
                        {vehiculoDetalleId === v.id ? "Ocultar detalle" : "Ver detalle"}
                      </button>
                      {puedeEditar && (
                        <>
                          <button
                            onClick={() => abrirEdicion(v)}
                            className="text-brand-700 dark:text-brand-300 hover:underline text-xs font-medium"
                          >
                            {vehiculoEditandoId === v.id ? "Cancelar" : "Editar"}
                          </button>
                          {v.activo ? (
                            vehiculoConfirmandoBajaId === v.id ? (
                              <>
                                <span className="text-xs text-red-600 dark:text-red-400">¿Seguro?</span>
                                <button
                                  onClick={() => desactivarVehiculo.mutate(v.id)}
                                  disabled={desactivarVehiculo.isPending}
                                  className="text-red-600 dark:text-red-400 hover:underline text-xs font-medium disabled:opacity-50"
                                >
                                  Sí, dar de baja
                                </button>
                                <button
                                  onClick={() => setVehiculoConfirmandoBajaId(null)}
                                  className="text-gray-500 dark:text-gray-400 hover:underline text-xs font-medium"
                                >
                                  Cancelar
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => setVehiculoConfirmandoBajaId(v.id)}
                                disabled={!!usoActual}
                                title={usoActual ? "Está en uso ahora mismo — hay que cerrar el uso primero" : undefined}
                                className="text-red-600 dark:text-red-400 hover:underline text-xs font-medium disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
                              >
                                Dar de baja
                              </button>
                            )
                          ) : (
                            <button
                              onClick={() => reactivarVehiculo.mutate(v.id)}
                              disabled={reactivarVehiculo.isPending}
                              className="text-emerald-600 dark:text-emerald-400 hover:underline text-xs font-medium disabled:opacity-50"
                            >
                              Reactivar
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>

                  {vehiculoEditandoId === v.id && (
                    <tr className="bg-stone-50 dark:bg-gray-700/40">
                      <td colSpan={6} className="px-4 py-3">
                        <form
                          onSubmit={(ev) => {
                            ev.preventDefault();
                            editarVehiculo.mutate(v.id);
                          }}
                          className="grid grid-cols-2 gap-2"
                        >
                          <SelectorMarcaModelo
                            marcaId={editForm.marcaId}
                            modeloId={editForm.modeloId}
                            onCambiarMarca={(marcaId) => setEditForm({ ...editForm, marcaId, modeloId: "" })}
                            onCambiarModelo={(modeloId) => setEditForm({ ...editForm, modeloId })}
                          />
                          <input
                            type="number"
                            placeholder="Año"
                            value={editForm.anio}
                            onChange={(ev) => setEditForm({ ...editForm, anio: ev.target.value })}
                            className={CAMPO}
                          />
                          <input
                            placeholder="Color"
                            value={editForm.color}
                            onChange={(ev) => setEditForm({ ...editForm, color: ev.target.value })}
                            className={CAMPO}
                          />
                          <select
                            value={editForm.sucursalId}
                            onChange={(ev) => setEditForm({ ...editForm, sucursalId: ev.target.value })}
                            className={CAMPO}
                          >
                            <option value="">Sucursal (opcional)...</option>
                            {sucursales?.map((s) => (
                              <option key={s.id} value={s.id}>{s.nombre}</option>
                            ))}
                          </select>
                          <div className="col-span-2 flex gap-2">
                            <button
                              type="submit"
                              disabled={editarVehiculo.isPending}
                              className="flex-1 bg-brand-700 text-white py-1.5 rounded-md text-sm font-semibold hover:bg-brand-800 disabled:opacity-50"
                            >
                              {editarVehiculo.isPending ? "Guardando..." : "Guardar cambios"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setVehiculoEditandoId(null)}
                              className="flex-1 bg-stone-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 py-1.5 rounded-md text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-500"
                            >
                              Cancelar
                            </button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        </div>
        {respuesta && (
          <Paginacion
            page={respuesta.paginacion.page}
            totalPaginas={respuesta.paginacion.totalPaginas}
            total={respuesta.paginacion.total}
            onCambiarPagina={setPagina}
          />
        )}
      </div>

      {vehiculoDetalleId !== null &&
        (() => {
          const vehiculo = vehiculos?.find((x) => x.id === vehiculoDetalleId);
          if (!vehiculo) return null;
          return <DetalleVehiculo vehiculo={vehiculo} puedeEditar={puedeEditar} onCerrar={() => setVehiculoDetalleId(null)} />;
        })()}
    </div>
  );
}

// Selector de marca + modelo desde catálogo (ver MarcaVehiculo/ModeloVehiculo
// en backend/prisma/schema.prisma) — con un "+" al lado de cada select para
// agregar una marca/modelo nueva sin salir del formulario, en vez de tener
// que ir a otra pantalla. El modelo depende de la marca elegida (se limpia
// solo al cambiar de marca, ver onCambiarMarca en el llamador). Devuelve dos
// <div> hermanos (Fragment) para poder usarse directo como dos celdas más
// de la grilla del formulario que lo contiene.
function SelectorMarcaModelo({
  marcaId,
  modeloId,
  onCambiarMarca,
  onCambiarModelo,
}: {
  marcaId: string;
  modeloId: string;
  onCambiarMarca: (marcaId: string) => void;
  onCambiarModelo: (modeloId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [agregandoMarca, setAgregandoMarca] = useState(false);
  const [nombreNuevaMarca, setNombreNuevaMarca] = useState("");
  const [agregandoModelo, setAgregandoModelo] = useState(false);
  const [nombreNuevoModelo, setNombreNuevoModelo] = useState("");

  const { data: marcas } = useQuery({
    queryKey: ["marcas-vehiculo"],
    queryFn: async () => (await api.get<MarcaVehiculo[]>("/vehiculos/marcas")).data,
  });

  const { data: modelos } = useQuery({
    queryKey: ["modelos-vehiculo", marcaId],
    queryFn: async () => (await api.get<ModeloVehiculo[]>("/vehiculos/modelos", { params: { marcaId } })).data,
    enabled: !!marcaId,
  });

  const crearMarca = useMutation({
    mutationFn: async () => (await api.post<MarcaVehiculo>("/vehiculos/marcas", { nombre: nombreNuevaMarca })).data,
    onSuccess: (nueva) => {
      queryClient.invalidateQueries({ queryKey: ["marcas-vehiculo"] });
      setNombreNuevaMarca("");
      setAgregandoMarca(false);
      onCambiarMarca(String(nueva.id));
    },
  });

  const crearModelo = useMutation({
    mutationFn: async () =>
      (await api.post<ModeloVehiculo>("/vehiculos/modelos", { marcaId: Number(marcaId), nombre: nombreNuevoModelo })).data,
    onSuccess: (nuevo) => {
      queryClient.invalidateQueries({ queryKey: ["modelos-vehiculo", marcaId] });
      setNombreNuevoModelo("");
      setAgregandoModelo(false);
      onCambiarModelo(String(nuevo.id));
    },
  });

  return (
    <>
      <div>
        <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Marca</label>
        {!agregandoMarca ? (
          <div className="flex gap-1">
            <select
              required
              value={marcaId}
              onChange={(e) => onCambiarMarca(e.target.value)}
              className={CAMPO}
            >
              <option value="">Marca...</option>
              {marcas?.map((m) => (
                <option key={m.id} value={m.id}>{m.nombre}</option>
              ))}
            </select>
            <button type="button" onClick={() => setAgregandoMarca(true)} title="Agregar marca nueva" className={BOTON_MAS}>
              +
            </button>
          </div>
        ) : (
          <div className="flex gap-1">
            <input
              autoFocus
              placeholder="Nombre de la marca"
              value={nombreNuevaMarca}
              onChange={(e) => setNombreNuevaMarca(e.target.value)}
              className={CAMPO}
            />
            <button
              type="button"
              onClick={() => crearMarca.mutate()}
              disabled={!nombreNuevaMarca.trim() || crearMarca.isPending}
              className="px-2.5 bg-brand-700 text-white rounded-md text-sm hover:bg-brand-800 disabled:opacity-50 shrink-0"
            >
              OK
            </button>
            <button type="button" onClick={() => setAgregandoMarca(false)} className={BOTON_MAS}>
              ×
            </button>
          </div>
        )}
        {crearMarca.isError && (
          <p className="text-red-600 dark:text-red-400 text-xs mt-0.5">
            {(crearMarca.error as any)?.response?.data?.error ?? "Error al crear la marca"}
          </p>
        )}
      </div>
      <div>
        <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Modelo</label>
        {!agregandoModelo ? (
          <div className="flex gap-1">
            <select
              required
              disabled={!marcaId}
              value={modeloId}
              onChange={(e) => onCambiarModelo(e.target.value)}
              className={CAMPO}
            >
              <option value="">{marcaId ? "Modelo..." : "Elegí una marca primero"}</option>
              {modelos?.map((m) => (
                <option key={m.id} value={m.id}>{m.nombre}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={!marcaId}
              onClick={() => setAgregandoModelo(true)}
              title="Agregar modelo nuevo"
              className={`${BOTON_MAS} disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              +
            </button>
          </div>
        ) : (
          <div className="flex gap-1">
            <input
              autoFocus
              placeholder="Nombre del modelo"
              value={nombreNuevoModelo}
              onChange={(e) => setNombreNuevoModelo(e.target.value)}
              className={CAMPO}
            />
            <button
              type="button"
              onClick={() => crearModelo.mutate()}
              disabled={!nombreNuevoModelo.trim() || crearModelo.isPending}
              className="px-2.5 bg-brand-700 text-white rounded-md text-sm hover:bg-brand-800 disabled:opacity-50 shrink-0"
            >
              OK
            </button>
            <button type="button" onClick={() => setAgregandoModelo(false)} className={BOTON_MAS}>
              ×
            </button>
          </div>
        )}
        {crearModelo.isError && (
          <p className="text-red-600 dark:text-red-400 text-xs mt-0.5">
            {(crearModelo.error as any)?.response?.data?.error ?? "Error al crear el modelo"}
          </p>
        )}
      </div>
    </>
  );
}

// Historial de un vehículo puntual: uso diario, cargas de combustible y
// mantenimientos, cada uno con su propia tabla/formulario. Se muestra como
// sección normal debajo de la tabla (no como ventana flotante) — mismo
// criterio que ModalDetalleRuta en VisitasPage.tsx: en este equipo, los
// overlays "fixed" a veces no se pintan hasta forzar un repintado ajeno.
function DetalleVehiculo({ vehiculo, puedeEditar, onCerrar }: { vehiculo: Vehiculo; puedeEditar: boolean; onCerrar: () => void }) {
  return (
    <div className="border border-stone-300 dark:border-gray-700 rounded-sm p-4 mt-4 bg-white dark:bg-gray-800">
      <div className="flex justify-between items-center mb-3">
        <h4 className="font-mono text-[11px] uppercase tracking-[0.15em] text-gray-600 dark:text-gray-300">
          {vehiculo.placa} — {vehiculo.marca.nombre} {vehiculo.modelo.nombre}
        </h4>
        <button
          onClick={onCerrar}
          aria-label="Cerrar"
          className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none"
        >
          ×
        </button>
      </div>

      <div className="mb-6">
        <SeccionReporteVehiculo vehiculo={vehiculo} />
      </div>

      <div className="mb-6">
        <SeccionHistorialUso vehiculo={vehiculo} puedeEditar={puedeEditar} />
      </div>

      <div className="mb-6">
        <SeccionPlanesMantenimiento vehiculo={vehiculo} puedeEditar={puedeEditar} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SeccionCargasCombustible vehiculo={vehiculo} puedeEditar={puedeEditar} />
        <SeccionMantenimientos vehiculo={vehiculo} puedeEditar={puedeEditar} />
      </div>
    </div>
  );
}

function aInputDate(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

// Resumen del período: cuánto se gastó en combustible y mantenimiento, cuántos
// km recorrió el vehículo y qué técnicos lo tuvieron a cargo — pensado para
// responder de un vistazo "¿qué se hizo con esta camioneta este mes y quién
// la usó?", sin tener que sumar a mano las tablas de abajo.
//
// "Imprimir" usa el diálogo nativo del navegador (Guardar como PDF), pero
// ACOTADO: solo se imprime el bloque marcado ".imprimir-en-blanco" (tarjetas
// + tabla de técnicos), nunca el menú lateral, el encabezado, ni el resto
// del detalle del vehículo (uso diario, planes, cargas, mantenimientos) —
// ver la regla @media print en index.css. La clase "imprimiendo" se agrega
// a <body> justo antes de window.print() y se saca sola al cerrar el
// diálogo (evento "afterprint"), para no dejarla pegada si el usuario
// cancela.
//
// "Exportar Excel" arma un .xlsx en el navegador (librería "xlsx", mismo
// patrón que ReportesPage.tsx) con más detalle del que entra en una
// impresión: además del resumen y los técnicos, una hoja por cada uso
// diario, carga de combustible y mantenimiento del período.
function SeccionReporteVehiculo({ vehiculo }: { vehiculo: Vehiculo }) {
  const hoy = new Date();
  const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const [desde, setDesde] = useState(aInputDate(primerDiaMes));
  const [hasta, setHasta] = useState(aInputDate(hoy));

  const { data: reporte, isLoading } = useQuery({
    queryKey: ["reporte-vehiculo", vehiculo.id, desde, hasta],
    queryFn: async () => (await api.get<ReporteVehiculo>(`/vehiculos/${vehiculo.id}/reporte`, { params: { desde, hasta } })).data,
  });

  // Saca la clase "imprimiendo" de <body> apenas se cierra el diálogo de
  // impresión (se haya impreso o cancelado) — así nunca queda pegada.
  useEffect(() => {
    const quitarClase = () => document.body.classList.remove("imprimiendo");
    window.addEventListener("afterprint", quitarClase);
    return () => window.removeEventListener("afterprint", quitarClase);
  }, []);

  function imprimir() {
    document.body.classList.add("imprimiendo");
    window.print();
  }

  function exportarExcel() {
    if (!reporte) return;
    const libro = XLSX.utils.book_new();

    const hojaResumen = XLSX.utils.json_to_sheet([
      {
        Vehículo: `${reporte.vehiculo.placa} — ${reporte.vehiculo.marca.nombre} ${reporte.vehiculo.modelo.nombre}`,
        "Período desde": desde,
        "Período hasta": hasta,
        "Km recorridos": reporte.resumen.kmRecorridos,
        "Cargas de combustible": reporte.resumen.cantidadCargas,
        "Total combustible ($)": reporte.resumen.totalCombustible,
        "Total galones": reporte.resumen.totalGalones,
        Mantenimientos: reporte.resumen.cantidadMantenimientos,
        "Total mantenimiento ($)": reporte.resumen.totalMantenimiento,
        "Días de uso": reporte.resumen.diasUso,
      },
    ]);
    XLSX.utils.book_append_sheet(libro, hojaResumen, "Resumen");

    const hojaTecnicos = XLSX.utils.json_to_sheet(
      reporte.tecnicos.map((t) => ({ Técnico: t.nombre, "Días de uso": t.diasUso, "Km recorridos": t.kmRecorridos }))
    );
    XLSX.utils.book_append_sheet(libro, hojaTecnicos, "Técnicos");

    if (reporte.usos.length > 0) {
      const hojaUsos = XLSX.utils.json_to_sheet(
        reporte.usos.map((u) => ({
          Técnico: `${u.empleado.nombres} ${u.empleado.apellidos}`,
          Inicio: new Date(u.fechaInicio).toLocaleString("es-EC"),
          "Km inicial": u.kilometrajeInicial,
          Fin: u.fechaFin ? new Date(u.fechaFin).toLocaleString("es-EC") : "",
          "Km final": u.kilometrajeFinal ?? "",
          "Km recorridos": u.kilometrajeFinal != null ? u.kilometrajeFinal - u.kilometrajeInicial : "",
          ...Object.fromEntries(CAMPOS_CHECKLIST_ENTREGA.map((c) => [c.etiqueta, u[c.clave] ?? ""])),
          Observaciones: u.observaciones ?? "",
        }))
      );
      XLSX.utils.book_append_sheet(libro, hojaUsos, "Uso diario");
    }

    if (reporte.cargasCombustible.length > 0) {
      const hojaCargas = XLSX.utils.json_to_sheet(
        reporte.cargasCombustible.map((c) => ({
          Fecha: new Date(c.fecha).toLocaleDateString("es-EC"),
          Km: c.kilometraje,
          Combustible: c.tipoCombustible,
          Galones: c.galones,
          "Costo ($)": c.costoTotal,
          Gasolinera: c.gasolinera ?? "",
          "Registrado por": c.usuario?.nombre ?? "",
        }))
      );
      XLSX.utils.book_append_sheet(libro, hojaCargas, "Cargas combustible");
    }

    if (reporte.mantenimientos.length > 0) {
      const hojaMantenimientos = XLSX.utils.json_to_sheet(
        reporte.mantenimientos.map((m) => ({
          Fecha: new Date(m.fecha).toLocaleDateString("es-EC"),
          Tipo: ETIQUETAS_MANTENIMIENTO_VEHICULO[m.tipo],
          Km: m.kilometraje,
          "Costo ($)": m.costo ?? "",
          Taller: m.taller ?? "",
          "N° factura": m.numeroFactura ?? "",
          Descripción: m.descripcion ?? "",
          "Registrado por": m.usuario?.nombre ?? "",
        }))
      );
      XLSX.utils.book_append_sheet(libro, hojaMantenimientos, "Mantenimientos");
    }

    XLSX.writeFile(libro, `reporte-${reporte.vehiculo.placa}_${desde}_a_${hasta}.xlsx`);
  }

  return (
    <div>
      <div className="flex justify-between items-end flex-wrap gap-2 mb-2">
        <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Reporte del período</h5>
        <div className="flex items-end gap-2">
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Desde</label>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={`${CAMPO} py-1`} />
          </div>
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Hasta</label>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={`${CAMPO} py-1`} />
          </div>
          <button
            onClick={exportarExcel}
            disabled={!reporte}
            className="px-3 py-1.5 border border-stone-300 dark:border-gray-600 rounded-md text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-stone-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            Exportar Excel
          </button>
          <button
            onClick={imprimir}
            disabled={!reporte}
            className="px-3 py-1.5 border border-stone-300 dark:border-gray-600 rounded-md text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-stone-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            Imprimir
          </button>
        </div>
      </div>

      {isLoading && <p className="text-xs text-gray-400 dark:text-gray-500">Calculando...</p>}

      {reporte && (
        <div className="imprimir-en-blanco space-y-3">
          {/* Solo aparece impreso (ver print:block) — en pantalla ya está
              claro de qué vehículo/período se trata por el resto del panel. */}
          <p className="hidden print:block text-sm font-semibold text-gray-800 mb-1">
            {reporte.vehiculo.placa} — {reporte.vehiculo.marca.nombre} {reporte.vehiculo.modelo.nombre} · {desde} a {hasta}
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <TarjetaResumen etiqueta="Km recorridos" valor={reporte.resumen.kmRecorridos.toLocaleString("es-EC")} />
            <TarjetaResumen
              etiqueta="Combustible"
              valor={`$${reporte.resumen.totalCombustible}`}
              detalle={`${reporte.resumen.cantidadCargas} carga(s) · ${reporte.resumen.totalGalones} gal`}
            />
            <TarjetaResumen
              etiqueta="Mantenimiento"
              valor={`$${reporte.resumen.totalMantenimiento}`}
              detalle={`${reporte.resumen.cantidadMantenimientos} registro(s)`}
            />
            <TarjetaResumen etiqueta="Días de uso" valor={String(reporte.resumen.diasUso)} detalle={`${reporte.resumen.cantidadTecnicos} técnico(s)`} />
          </div>

          <div className="border border-stone-300 dark:border-gray-700 rounded-md overflow-hidden overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700 text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 [&_th]:font-medium">
                <tr>
                  <th className="px-2 py-1.5">Técnico encargado</th>
                  <th className="px-2 py-1.5 text-right">Días de uso</th>
                  <th className="px-2 py-1.5 text-right">Km recorridos</th>
                </tr>
              </thead>
              <tbody>
                {reporte.tecnicos.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-2 py-2 text-center text-gray-400 dark:text-gray-500">
                      Nadie tuvo este vehículo en uso en el período elegido
                    </td>
                  </tr>
                )}
                {reporte.tecnicos.map((t) => (
                  <tr key={t.empleadoId} className="border-t border-stone-100 dark:border-gray-700">
                    <td className="px-2 py-1.5">{t.nombre}</td>
                    <td className="px-2 py-1.5 text-right">{t.diasUso}</td>
                    <td className="px-2 py-1.5 text-right">{t.kmRecorridos.toLocaleString("es-EC")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {reporte.usos.some((u) => CAMPOS_CHECKLIST_ENTREGA.some((c) => u[c.clave])) && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                Control de entrega por día
              </p>
              <div className="space-y-2">
                {reporte.usos
                  .filter((u) => CAMPOS_CHECKLIST_ENTREGA.some((c) => u[c.clave]))
                  .map((u) => (
                    <div key={u.id} className="border border-stone-300 dark:border-gray-700 rounded-md p-2 text-xs">
                      <p className="font-semibold text-gray-700 dark:text-gray-200 mb-1">
                        {u.empleado.nombres} {u.empleado.apellidos} · {u.fechaInicio.slice(0, 10)}
                      </p>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-gray-600 dark:text-gray-300">
                        {CAMPOS_CHECKLIST_ENTREGA.filter((c) => u[c.clave]).map((c) => (
                          <p key={c.clave}>
                            <span className="text-gray-400 dark:text-gray-500">{c.etiqueta}:</span> {u[c.clave]}
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
              Cargas de combustible del período
            </p>
            <div className="border border-stone-300 dark:border-gray-700 rounded-md overflow-hidden overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700 text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 [&_th]:font-medium">
                  <tr>
                    <th className="px-2 py-1.5">Fecha</th>
                    <th className="px-2 py-1.5 text-right">Km</th>
                    <th className="px-2 py-1.5 text-right">Gal.</th>
                    <th className="px-2 py-1.5 text-right">Costo</th>
                    <th className="px-2 py-1.5">Gasolinera</th>
                    <th className="px-2 py-1.5">Registrado por</th>
                  </tr>
                </thead>
                <tbody>
                  {reporte.cargasCombustible.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-2 py-2 text-center text-gray-400 dark:text-gray-500">
                        Sin cargas de combustible en el período elegido
                      </td>
                    </tr>
                  )}
                  {reporte.cargasCombustible.map((c) => (
                    <tr key={c.id} className="border-t border-stone-100 dark:border-gray-700">
                      <td className="px-2 py-1.5 whitespace-nowrap">{c.fecha.slice(0, 10)}</td>
                      <td className="px-2 py-1.5 text-right">{c.kilometraje.toLocaleString("es-EC")}</td>
                      <td className="px-2 py-1.5 text-right">{c.galones}</td>
                      <td className="px-2 py-1.5 text-right">${c.costoTotal}</td>
                      <td className="px-2 py-1.5">{c.gasolinera || "—"}</td>
                      <td className="px-2 py-1.5">{c.usuario?.nombre ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
              Mantenimientos del período
            </p>
            <div className="border border-stone-300 dark:border-gray-700 rounded-md overflow-hidden overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700 text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 [&_th]:font-medium">
                  <tr>
                    <th className="px-2 py-1.5">Fecha</th>
                    <th className="px-2 py-1.5">Tipo</th>
                    <th className="px-2 py-1.5 text-right">Km</th>
                    <th className="px-2 py-1.5 text-right">Costo</th>
                    <th className="px-2 py-1.5">Taller</th>
                    <th className="px-2 py-1.5">N° factura</th>
                    <th className="px-2 py-1.5">Registrado por</th>
                  </tr>
                </thead>
                <tbody>
                  {reporte.mantenimientos.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-2 py-2 text-center text-gray-400 dark:text-gray-500">
                        Sin mantenimientos en el período elegido
                      </td>
                    </tr>
                  )}
                  {reporte.mantenimientos.map((m) => (
                    <tr key={m.id} className="border-t border-stone-100 dark:border-gray-700">
                      <td className="px-2 py-1.5 whitespace-nowrap">{m.fecha.slice(0, 10)}</td>
                      <td className="px-2 py-1.5">
                        {ETIQUETAS_MANTENIMIENTO_VEHICULO[m.tipo]}
                        {m.descripcion && <p className="text-[10px] text-gray-400 dark:text-gray-500">{m.descripcion}</p>}
                      </td>
                      <td className="px-2 py-1.5 text-right">{m.kilometraje.toLocaleString("es-EC")}</td>
                      <td className="px-2 py-1.5 text-right">{m.costo != null ? `$${m.costo}` : "—"}</td>
                      <td className="px-2 py-1.5">{m.taller || "—"}</td>
                      <td className="px-2 py-1.5">{m.numeroFactura || "—"}</td>
                      <td className="px-2 py-1.5">{m.usuario?.nombre ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TarjetaResumen({ etiqueta, valor, detalle }: { etiqueta: string; valor: string; detalle?: string }) {
  return (
    <div className="rounded-md border border-stone-300 dark:border-gray-700 px-3 py-2">
      <p className="text-[10px] text-gray-500 dark:text-gray-400">{etiqueta}</p>
      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{valor}</p>
      {detalle && <p className="text-[10px] text-gray-400 dark:text-gray-500">{detalle}</p>}
    </div>
  );
}

// Configuración de "cada cuántos km toca cada tipo de mantenimiento" para
// ESTE vehículo puntual (ver PlanMantenimientoVehiculo en schema.prisma) —
// es lo que hace que el próximo kilometraje se calcule solo al registrar un
// mantenimiento nuevo de ese tipo, y lo que alimenta el banner de avisos de
// arriba de la página.
function SeccionPlanesMantenimiento({ vehiculo, puedeEditar }: { vehiculo: Vehiculo; puedeEditar: boolean }) {
  const queryClient = useQueryClient();
  const [editandoTipo, setEditandoTipo] = useState<TipoMantenimientoVehiculo | null>(null);
  const [intervaloKm, setIntervaloKm] = useState("");
  const [kmAvisoPrevio, setKmAvisoPrevio] = useState("500");

  const { data: planes, isLoading } = useQuery({
    queryKey: ["planes-mantenimiento", vehiculo.id],
    queryFn: async () => (await api.get<PlanMantenimientoVehiculo[]>(`/vehiculos/${vehiculo.id}/planes-mantenimiento`)).data,
  });

  const guardar = useMutation({
    mutationFn: async (tipo: TipoMantenimientoVehiculo) =>
      api.post(`/vehiculos/${vehiculo.id}/planes-mantenimiento`, {
        tipo,
        intervaloKm: Number(intervaloKm),
        kmAvisoPrevio: Number(kmAvisoPrevio),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planes-mantenimiento", vehiculo.id] });
      queryClient.invalidateQueries({ queryKey: ["alertas-mantenimiento-vehiculos"] });
      setEditandoTipo(null);
    },
  });

  const eliminar = useMutation({
    mutationFn: async (planId: number) => api.delete(`/vehiculos/planes-mantenimiento/${planId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planes-mantenimiento", vehiculo.id] });
      queryClient.invalidateQueries({ queryKey: ["alertas-mantenimiento-vehiculos"] });
    },
  });

  function abrirEdicion(tipo: TipoMantenimientoVehiculo, planExistente: PlanMantenimientoVehiculo | undefined) {
    setIntervaloKm(planExistente ? String(planExistente.intervaloKm) : "");
    setKmAvisoPrevio(planExistente ? String(planExistente.kmAvisoPrevio) : "500");
    setEditandoTipo(editandoTipo === tipo ? null : tipo);
  }

  if (!puedeEditar && (!planes || planes.length === 0)) return null; // nada configurado y no puede configurar: no hay nada que mostrar

  return (
    <div>
      <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
        Cada cuánto toca cada mantenimiento
      </h5>
      <div className="border border-stone-300 dark:border-gray-700 rounded-md overflow-hidden overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700 text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 [&_th]:font-medium">
            <tr>
              <th className="px-2 py-1.5">Tipo</th>
              <th className="px-2 py-1.5 text-right">Cada (km)</th>
              <th className="px-2 py-1.5 text-right">Avisar a (km)</th>
              <th className="px-2 py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={4} className="px-2 py-2 text-center text-gray-400 dark:text-gray-500">Cargando...</td>
              </tr>
            )}
            {!isLoading &&
              TIPOS_MANTENIMIENTO.filter((t) => t !== "OTRO").map((tipo) => {
                const plan = planes?.find((p) => p.tipo === tipo);
                if (!plan && !puedeEditar) return null;
                return (
                  <Fragment key={tipo}>
                    <tr className="border-t border-stone-100 dark:border-gray-700">
                      <td className="px-2 py-1.5">{ETIQUETAS_MANTENIMIENTO_VEHICULO[tipo]}</td>
                      <td className="px-2 py-1.5 text-right">{plan ? plan.intervaloKm.toLocaleString("es-EC") : "—"}</td>
                      <td className="px-2 py-1.5 text-right">{plan ? plan.kmAvisoPrevio.toLocaleString("es-EC") : "—"}</td>
                      <td className="px-2 py-1.5 text-right whitespace-nowrap">
                        {puedeEditar && (
                          <>
                            <button
                              onClick={() => abrirEdicion(tipo, plan)}
                              className="text-brand-700 dark:text-brand-300 hover:underline font-medium"
                            >
                              {editandoTipo === tipo ? "Cancelar" : plan ? "Editar" : "Configurar"}
                            </button>
                            {plan && (
                              <>
                                {" · "}
                                <button
                                  onClick={() => eliminar.mutate(plan.id)}
                                  disabled={eliminar.isPending}
                                  className="text-red-600 dark:text-red-400 hover:underline font-medium disabled:opacity-50"
                                >
                                  Quitar
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                    {editandoTipo === tipo && (
                      <tr className="bg-stone-50 dark:bg-gray-700/40">
                        <td colSpan={4} className="px-2 py-2">
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              guardar.mutate(tipo);
                            }}
                            className="flex items-end gap-2"
                          >
                            <div>
                              <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Cada cuántos km</label>
                              <input
                                type="number"
                                min="1"
                                required
                                autoFocus
                                value={intervaloKm}
                                onChange={(e) => setIntervaloKm(e.target.value)}
                                className={`${CAMPO} w-28`}
                              />
                            </div>
                            <div>
                              <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Avisar cuando falten (km)</label>
                              <input
                                type="number"
                                min="0"
                                required
                                value={kmAvisoPrevio}
                                onChange={(e) => setKmAvisoPrevio(e.target.value)}
                                className={`${CAMPO} w-28`}
                              />
                            </div>
                            <button
                              type="submit"
                              disabled={guardar.isPending}
                              className="bg-brand-700 text-white px-3 py-1.5 rounded-md text-xs font-semibold hover:bg-brand-800 disabled:opacity-50"
                            >
                              {guardar.isPending ? "Guardando..." : "Guardar"}
                            </button>
                          </form>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Historial de uso diario (abrir/cerrar) — el técnico lo hace normalmente
// desde su celular (ver AppMovil); acá es solo de CONSULTA, salvo el botón
// "Cerrar" sobre la fila EN_USO (si hay una), pensado como salvavidas si un
// técnico se olvidó de cerrar su día (perdió el celular, se le acabó la
// batería, etc.) — mismo criterio de permiso que el backend: cualquier
// admin/"vehiculos_editar" puede cerrarlo, no hace falta ser el técnico.
function SeccionHistorialUso({ vehiculo, puedeEditar }: { vehiculo: Vehiculo; puedeEditar: boolean }) {
  const queryClient = useQueryClient();
  const [cerrandoId, setCerrandoId] = useState<number | null>(null);
  const [kmFinalForm, setKmFinalForm] = useState("");

  const { data: usos, isLoading } = useQuery({
    queryKey: ["historial-uso-vehiculo", vehiculo.id],
    queryFn: async () => (await api.get<UsoVehiculo[]>("/vehiculos/uso/historial", { params: { vehiculoId: vehiculo.id } })).data,
  });

  const cerrar = useMutation({
    mutationFn: async (id: number) => api.patch(`/vehiculos/uso/${id}/cerrar`, { kilometrajeFinal: Number(kmFinalForm) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["historial-uso-vehiculo", vehiculo.id] });
      queryClient.invalidateQueries({ queryKey: ["vehiculos"] });
      setCerrandoId(null);
      setKmFinalForm("");
    },
  });

  return (
    <div>
      <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Uso diario</h5>
      <div className="border border-stone-300 dark:border-gray-700 rounded-md overflow-hidden overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700 text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 [&_th]:font-medium">
            <tr>
              <th className="px-2 py-1.5">Técnico</th>
              <th className="px-2 py-1.5">Inicio</th>
              <th className="px-2 py-1.5 text-right">Km inicial</th>
              <th className="px-2 py-1.5">Fin</th>
              <th className="px-2 py-1.5 text-right">Km final</th>
              <th className="px-2 py-1.5 text-right">Km recorridos</th>
              <th className="px-2 py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-2 py-2 text-center text-gray-400 dark:text-gray-500">Cargando...</td>
              </tr>
            )}
            {!isLoading && usos?.length === 0 && (
              <tr>
                <td colSpan={7} className="px-2 py-2 text-center text-gray-400 dark:text-gray-500">Sin usos registrados todavía</td>
              </tr>
            )}
            {usos?.map((u) => (
              <Fragment key={u.id}>
                <tr className="border-t border-stone-100 dark:border-gray-700">
                  <td className="px-2 py-1.5">{u.empleado.nombres} {u.empleado.apellidos}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{u.fechaInicio.slice(0, 16).replace("T", " ")}</td>
                  <td className="px-2 py-1.5 text-right">{u.kilometrajeInicial.toLocaleString("es-EC")}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {u.estado === "EN_USO" ? (
                      <span className="text-amber-600 dark:text-amber-400 font-medium">En uso</span>
                    ) : (
                      u.fechaFin?.slice(0, 16).replace("T", " ")
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right">{u.kilometrajeFinal != null ? u.kilometrajeFinal.toLocaleString("es-EC") : "—"}</td>
                  <td className="px-2 py-1.5 text-right">
                    {u.kilometrajeFinal != null ? (u.kilometrajeFinal - u.kilometrajeInicial).toLocaleString("es-EC") : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    {puedeEditar && u.estado === "EN_USO" && (
                      <button
                        onClick={() => {
                          setCerrandoId(u.id);
                          setKmFinalForm(String(u.kilometrajeInicial));
                        }}
                        className="text-brand-700 dark:text-brand-300 hover:underline font-medium"
                      >
                        Cerrar
                      </button>
                    )}
                  </td>
                </tr>
                {cerrandoId === u.id && (
                  <tr className="bg-stone-50 dark:bg-gray-700/40">
                    <td colSpan={7} className="px-2 py-2">
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          cerrar.mutate(u.id);
                        }}
                        className="flex items-end gap-2"
                      >
                        <div>
                          <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Kilometraje final</label>
                          <input
                            type="number"
                            min={u.kilometrajeInicial}
                            required
                            autoFocus
                            value={kmFinalForm}
                            onChange={(e) => setKmFinalForm(e.target.value)}
                            className={`${CAMPO} w-32`}
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={cerrar.isPending}
                          className="bg-brand-700 text-white px-3 py-1.5 rounded-md text-xs font-semibold hover:bg-brand-800 disabled:opacity-50"
                        >
                          {cerrar.isPending ? "Guardando..." : "Confirmar cierre"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setCerrandoId(null)}
                          className="text-gray-500 dark:text-gray-400 hover:underline text-xs font-medium"
                        >
                          Cancelar
                        </button>
                        {cerrar.isError && (
                          <p className="text-red-600 dark:text-red-400 text-xs">
                            {(cerrar.error as any)?.response?.data?.error ?? "Error al cerrar el uso"}
                          </p>
                        )}
                      </form>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const cargaFormVacio = { fecha: "", kilometraje: "", tipoCombustible: "Extra", galones: "", costoTotal: "", gasolinera: "", observaciones: "" };

// Calcula el rendimiento (km recorridos / galones) de cada carga contra la
// carga ANTERIOR del mismo vehículo por kilometraje — no hay "kilometraje
// inicial/final" guardado, cada carga es solo un punto en el tiempo (ver
// comentario del modelo CargaCombustible en schema.prisma), así que el
// consumo entre dos cargas se calcula acá, nunca en el backend.
function calcularRendimientos(cargas: CargaCombustible[]): Map<number, number | null> {
  const ordenadas = [...cargas].sort((a, b) => a.kilometraje - b.kilometraje);
  const mapa = new Map<number, number | null>();
  for (let i = 0; i < ordenadas.length; i++) {
    if (i === 0) {
      mapa.set(ordenadas[i].id, null);
      continue;
    }
    const kmRecorridos = ordenadas[i].kilometraje - ordenadas[i - 1].kilometraje;
    const galones = parseFloat(ordenadas[i].galones);
    mapa.set(ordenadas[i].id, kmRecorridos > 0 && galones > 0 ? kmRecorridos / galones : null);
  }
  return mapa;
}

function SeccionCargasCombustible({ vehiculo, puedeEditar }: { vehiculo: Vehiculo; puedeEditar: boolean }) {
  const queryClient = useQueryClient();
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState(cargaFormVacio);
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [eliminandoId, setEliminandoId] = useState<number | null>(null);

  const { data: cargas, isLoading } = useQuery({
    queryKey: ["cargas-combustible", vehiculo.id],
    queryFn: async () => (await api.get<CargaCombustible[]>(`/vehiculos/${vehiculo.id}/cargas-combustible`)).data,
  });

  const rendimientos = cargas ? calcularRendimientos(cargas) : new Map<number, number | null>();

  const crear = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      if (form.fecha) formData.append("fecha", form.fecha);
      formData.append("kilometraje", form.kilometraje);
      if (form.tipoCombustible) formData.append("tipoCombustible", form.tipoCombustible);
      formData.append("galones", form.galones);
      formData.append("costoTotal", form.costoTotal);
      if (form.gasolinera) formData.append("gasolinera", form.gasolinera);
      if (form.observaciones) formData.append("observaciones", form.observaciones);
      if (comprobante) formData.append("comprobante", comprobante);
      return api.post(`/vehiculos/${vehiculo.id}/cargas-combustible`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cargas-combustible", vehiculo.id] });
      queryClient.invalidateQueries({ queryKey: ["vehiculos"] });
      setForm(cargaFormVacio);
      setComprobante(null);
      setMostrarForm(false);
    },
  });

  const eliminar = useMutation({
    mutationFn: async (id: number) => api.delete(`/vehiculos/cargas-combustible/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cargas-combustible", vehiculo.id] });
      queryClient.invalidateQueries({ queryKey: ["vehiculos"] });
      setEliminandoId(null);
    },
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Cargas de combustible</h5>
        <button onClick={() => setMostrarForm(!mostrarForm)} className="text-brand-700 dark:text-brand-300 hover:underline text-xs font-medium">
          {mostrarForm ? "Cancelar" : "+ Registrar carga"}
        </button>
      </div>

      {mostrarForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            crear.mutate();
          }}
          className="grid grid-cols-2 gap-2 mb-3 p-2 rounded-md bg-stone-50 dark:bg-gray-900/40 border border-stone-300 dark:border-gray-700"
        >
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Fecha</label>
            <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} className={CAMPO} />
          </div>
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Kilometraje</label>
            <input
              type="number"
              min="0"
              required
              autoFocus
              value={form.kilometraje}
              onChange={(e) => setForm({ ...form, kilometraje: e.target.value })}
              className={CAMPO}
            />
          </div>
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Combustible</label>
            <input
              list="tipos-combustible"
              value={form.tipoCombustible}
              onChange={(e) => setForm({ ...form, tipoCombustible: e.target.value })}
              className={CAMPO}
            />
            <datalist id="tipos-combustible">
              <option value="Extra" />
              <option value="Súper" />
              <option value="Ecopaís" />
              <option value="Diésel Premium" />
              <option value="Diésel 2" />
            </datalist>
          </div>
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Galones</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={form.galones}
              onChange={(e) => setForm({ ...form, galones: e.target.value })}
              className={CAMPO}
            />
          </div>
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Costo total ($)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={form.costoTotal}
              onChange={(e) => setForm({ ...form, costoTotal: e.target.value })}
              className={CAMPO}
            />
          </div>
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Gasolinera (opcional)</label>
            <input value={form.gasolinera} onChange={(e) => setForm({ ...form, gasolinera: e.target.value })} className={CAMPO} />
          </div>
          <div className="col-span-2">
            <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Observaciones (opcional)</label>
            <input value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} className={CAMPO} />
          </div>
          <div className="col-span-2">
            <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">
              Foto del comprobante (opcional) — en el celular abre la cámara directo
            </label>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setComprobante(e.target.files?.[0] ?? null)}
              className="text-xs w-full"
            />
          </div>
          <button
            type="submit"
            disabled={crear.isPending}
            className="col-span-2 bg-brand-700 text-white py-1.5 rounded-md text-sm font-semibold hover:bg-brand-800 disabled:opacity-50"
          >
            {crear.isPending ? "Guardando..." : "Guardar carga"}
          </button>
          {crear.isError && (
            <p className="col-span-2 text-red-600 dark:text-red-400 text-xs">
              {(crear.error as any)?.response?.data?.error ?? "Error al registrar la carga"}
            </p>
          )}
        </form>
      )}

      <div className="border border-stone-300 dark:border-gray-700 rounded-md overflow-hidden overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700 text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 [&_th]:font-medium">
            <tr>
              <th className="px-2 py-1.5">Fecha</th>
              <th className="px-2 py-1.5 text-right">Km</th>
              <th className="px-2 py-1.5 text-right">Gal.</th>
              <th className="px-2 py-1.5 text-right">Costo</th>
              <th className="px-2 py-1.5 text-right">Rend.</th>
              <th className="px-2 py-1.5"></th>
              <th className="px-2 py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-2 py-2 text-center text-gray-400 dark:text-gray-500">Cargando...</td>
              </tr>
            )}
            {!isLoading && cargas?.length === 0 && (
              <tr>
                <td colSpan={7} className="px-2 py-2 text-center text-gray-400 dark:text-gray-500">Sin cargas registradas</td>
              </tr>
            )}
            {cargas?.map((c) => {
              const rendimiento = rendimientos.get(c.id);
              return (
                <tr key={c.id} className="border-t border-stone-100 dark:border-gray-700">
                  <td className="px-2 py-1.5 whitespace-nowrap">{c.fecha.slice(0, 10)}</td>
                  <td className="px-2 py-1.5 text-right">{c.kilometraje.toLocaleString("es-EC")}</td>
                  <td className="px-2 py-1.5 text-right">{c.galones}</td>
                  <td className="px-2 py-1.5 text-right">${c.costoTotal}</td>
                  <td className="px-2 py-1.5 text-right text-gray-500 dark:text-gray-400">
                    {rendimiento != null ? `${rendimiento.toFixed(1)} km/gal` : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {c.comprobanteUrl && (
                      <a
                        href={urlArchivoSubido(c.comprobanteUrl)!}
                        target="_blank"
                        rel="noreferrer"
                        title="Ver comprobante"
                        className="inline-flex text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                      >
                        <Camera className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    {puedeEditar && (
                      eliminandoId === c.id ? (
                        <>
                          <button
                            onClick={() => eliminar.mutate(c.id)}
                            disabled={eliminar.isPending}
                            className="text-red-600 dark:text-red-400 hover:underline font-medium disabled:opacity-50"
                          >
                            Confirmar
                          </button>{" "}
                          <button onClick={() => setEliminandoId(null)} className="text-gray-500 dark:text-gray-400 hover:underline font-medium">
                            No
                          </button>
                        </>
                      ) : (
                        <button onClick={() => setEliminandoId(c.id)} className="text-red-600 dark:text-red-400 hover:underline font-medium">
                          Eliminar
                        </button>
                      )
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const mantenimientoFormVacio = {
  tipo: "CAMBIO_ACEITE" as TipoMantenimientoVehiculo,
  fecha: "",
  kilometraje: "",
  costo: "",
  taller: "",
  descripcion: "",
  proximoKilometraje: "",
  numeroFactura: "",
};

function SeccionMantenimientos({ vehiculo, puedeEditar }: { vehiculo: Vehiculo; puedeEditar: boolean }) {
  const queryClient = useQueryClient();
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState(mantenimientoFormVacio);
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [eliminandoId, setEliminandoId] = useState<number | null>(null);

  const { data: mantenimientos, isLoading } = useQuery({
    queryKey: ["mantenimientos-vehiculo", vehiculo.id],
    queryFn: async () => (await api.get<MantenimientoVehiculo[]>(`/vehiculos/${vehiculo.id}/mantenimientos`)).data,
  });

  // Mismo catálogo que consume SeccionPlanesMantenimiento — react-query
  // dedupe por queryKey, así que no duplica el pedido si ambas secciones
  // están montadas a la vez.
  const { data: planes } = useQuery({
    queryKey: ["planes-mantenimiento", vehiculo.id],
    queryFn: async () => (await api.get<PlanMantenimientoVehiculo[]>(`/vehiculos/${vehiculo.id}/planes-mantenimiento`)).data,
  });
  const planDelTipo = planes?.find((p) => p.tipo === form.tipo);

  const crear = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append("tipo", form.tipo);
      if (form.fecha) formData.append("fecha", form.fecha);
      formData.append("kilometraje", form.kilometraje);
      if (form.costo) formData.append("costo", form.costo);
      if (form.taller) formData.append("taller", form.taller);
      if (form.descripcion) formData.append("descripcion", form.descripcion);
      // Si hay un plan configurado para este tipo, el backend calcula el
      // próximo solo (ver PlanMantenimientoVehiculo) e ignora este campo —
      // solo se manda cuando no hay plan, como respaldo del comportamiento
      // manual de siempre.
      if (!planDelTipo && form.proximoKilometraje) formData.append("proximoKilometraje", form.proximoKilometraje);
      if (form.numeroFactura) formData.append("numeroFactura", form.numeroFactura);
      if (comprobante) formData.append("comprobante", comprobante);
      return api.post(`/vehiculos/${vehiculo.id}/mantenimientos`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mantenimientos-vehiculo", vehiculo.id] });
      queryClient.invalidateQueries({ queryKey: ["vehiculos"] });
      queryClient.invalidateQueries({ queryKey: ["alertas-mantenimiento-vehiculos"] });
      setForm(mantenimientoFormVacio);
      setComprobante(null);
      setMostrarForm(false);
    },
  });

  const eliminar = useMutation({
    mutationFn: async (id: number) => api.delete(`/vehiculos/mantenimientos/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mantenimientos-vehiculo", vehiculo.id] });
      queryClient.invalidateQueries({ queryKey: ["vehiculos"] });
      setEliminandoId(null);
    },
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Mantenimientos</h5>
        {puedeEditar && (
          <button onClick={() => setMostrarForm(!mostrarForm)} className="text-brand-700 dark:text-brand-300 hover:underline text-xs font-medium">
            {mostrarForm ? "Cancelar" : "+ Registrar mantenimiento"}
          </button>
        )}
      </div>

      {mostrarForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            crear.mutate();
          }}
          className="grid grid-cols-2 gap-2 mb-3 p-2 rounded-md bg-stone-50 dark:bg-gray-900/40 border border-stone-300 dark:border-gray-700"
        >
          <div className="col-span-2">
            <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Tipo</label>
            <select
              autoFocus
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoMantenimientoVehiculo })}
              className={CAMPO}
            >
              {TIPOS_MANTENIMIENTO.map((t) => (
                <option key={t} value={t}>{ETIQUETAS_MANTENIMIENTO_VEHICULO[t]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Fecha</label>
            <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} className={CAMPO} />
          </div>
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Kilometraje</label>
            <input
              type="number"
              min="0"
              required
              value={form.kilometraje}
              onChange={(e) => setForm({ ...form, kilometraje: e.target.value })}
              className={CAMPO}
            />
          </div>
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Costo (opcional)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.costo}
              onChange={(e) => setForm({ ...form, costo: e.target.value })}
              className={CAMPO}
            />
          </div>
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Taller (opcional)</label>
            <input value={form.taller} onChange={(e) => setForm({ ...form, taller: e.target.value })} className={CAMPO} />
          </div>
          <div className="col-span-2">
            <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">
              Descripción {form.tipo === "OTRO" && <span className="text-red-500">(obligatoria para "Otro")</span>}
            </label>
            <input
              required={form.tipo === "OTRO"}
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              className={CAMPO}
            />
          </div>
          <div className="col-span-2">
            {planDelTipo ? (
              <p className="text-[11px] text-gray-500 dark:text-gray-400 bg-stone-100 dark:bg-gray-800 rounded-md px-2 py-1.5">
                Próximo cambio calculado a los{" "}
                <strong className="text-gray-700 dark:text-gray-200">
                  {(Number(form.kilometraje || 0) + planDelTipo.intervaloKm).toLocaleString("es-EC")} km
                </strong>{" "}
                (cada {planDelTipo.intervaloKm.toLocaleString("es-EC")} km — configurado en "Cada cuánto toca cada mantenimiento")
              </p>
            ) : (
              <>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Próximo a los (km, opcional)</label>
                <input
                  type="number"
                  min="0"
                  value={form.proximoKilometraje}
                  onChange={(e) => setForm({ ...form, proximoKilometraje: e.target.value })}
                  className={CAMPO}
                />
              </>
            )}
          </div>
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">N° de factura (opcional)</label>
            <input value={form.numeroFactura} onChange={(e) => setForm({ ...form, numeroFactura: e.target.value })} className={CAMPO} />
          </div>
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Foto del comprobante (opcional)</label>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setComprobante(e.target.files?.[0] ?? null)}
              className="text-xs w-full"
            />
          </div>
          <button
            type="submit"
            disabled={crear.isPending}
            className="col-span-2 bg-brand-700 text-white py-1.5 rounded-md text-sm font-semibold hover:bg-brand-800 disabled:opacity-50"
          >
            {crear.isPending ? "Guardando..." : "Guardar mantenimiento"}
          </button>
          {crear.isError && (
            <p className="col-span-2 text-red-600 dark:text-red-400 text-xs">
              {(crear.error as any)?.response?.data?.error ?? "Error al registrar el mantenimiento"}
            </p>
          )}
        </form>
      )}

      <div className="border border-stone-300 dark:border-gray-700 rounded-md overflow-hidden overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700 text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 [&_th]:font-medium">
            <tr>
              <th className="px-2 py-1.5">Fecha</th>
              <th className="px-2 py-1.5">Tipo</th>
              <th className="px-2 py-1.5 text-right">Km</th>
              <th className="px-2 py-1.5 text-right">Costo</th>
              <th className="px-2 py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-2 py-2 text-center text-gray-400 dark:text-gray-500">Cargando...</td>
              </tr>
            )}
            {!isLoading && mantenimientos?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-2 py-2 text-center text-gray-400 dark:text-gray-500">Sin mantenimientos registrados</td>
              </tr>
            )}
            {mantenimientos?.map((m) => {
              // Se acerca o ya pasó el kilometraje planificado para el próximo
              // de este mismo tipo — solo un aviso visual, no bloquea nada.
              const vencido = m.proximoKilometraje != null && vehiculo.kilometrajeActual != null && vehiculo.kilometrajeActual >= m.proximoKilometraje;
              return (
                <Fragment key={m.id}>
                  <tr className="border-t border-stone-100 dark:border-gray-700">
                    <td className="px-2 py-1.5 whitespace-nowrap">{m.fecha.slice(0, 10)}</td>
                    <td className="px-2 py-1.5">
                      {ETIQUETAS_MANTENIMIENTO_VEHICULO[m.tipo]}
                      {m.descripcion && <p className="text-[10px] text-gray-400 dark:text-gray-500">{m.descripcion}</p>}
                      {(m.numeroFactura || m.comprobanteUrl) && (
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 flex items-center gap-1">
                          {m.numeroFactura && <span>Fact. {m.numeroFactura}</span>}
                          {m.comprobanteUrl && (
                            <a
                              href={urlArchivoSubido(m.comprobanteUrl)!}
                              target="_blank"
                              rel="noreferrer"
                              title="Ver comprobante"
                              className="inline-flex text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                            >
                              <Camera className="w-3 h-3" />
                            </a>
                          )}
                        </p>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right">{m.kilometraje.toLocaleString("es-EC")}</td>
                    <td className="px-2 py-1.5 text-right">{m.costo != null ? `$${m.costo}` : "—"}</td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">
                      {puedeEditar && (
                        eliminandoId === m.id ? (
                          <>
                            <button
                              onClick={() => eliminar.mutate(m.id)}
                              disabled={eliminar.isPending}
                              className="text-red-600 dark:text-red-400 hover:underline font-medium disabled:opacity-50"
                            >
                              Confirmar
                            </button>{" "}
                            <button onClick={() => setEliminandoId(null)} className="text-gray-500 dark:text-gray-400 hover:underline font-medium">
                              No
                            </button>
                          </>
                        ) : (
                          <button onClick={() => setEliminandoId(m.id)} className="text-red-600 dark:text-red-400 hover:underline font-medium">
                            Eliminar
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                  {m.proximoKilometraje != null && (
                    <tr className="border-t border-gray-50 dark:border-gray-800">
                      <td></td>
                      <td colSpan={4} className={`px-2 pb-1.5 text-[10px] ${vencido ? "text-amber-600 dark:text-amber-400 font-medium" : "text-gray-400 dark:text-gray-500"}`}>
                        Próximo a los {m.proximoKilometraje.toLocaleString("es-EC")} km{vencido ? " — ya alcanzado" : ""}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
