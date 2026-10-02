import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type AsignacionMetraje, type Producto, type Empleado, type Bodega } from "../api/client";
import { useToast } from "../components/ToastProvider";
import { useFiltrosListado, BarraBuscadorDocumentos, filtrarLocal, sinPaginacion } from "../components/BuscadorDocumentos";
import { CLASE_CAMPO, CLASE_ETIQUETA, Resaltar } from "../components/FormatoDocumento";

const FORM_VACIO = { productoId: "", empleadoId: "", metros: "", bodegaId: "" };

// Rollos de cable (UTP, fibra, etc.) entregados a un técnico — el rollo
// entero sale de bodega como una SALIDA real de inventario al asignarlo (ver
// comentario "Módulo de METRAJE DE CABLE" en schema.prisma); lo que el
// técnico reporta usar en cada visita (ver DetalleTrabajoVisita.tsx) solo
// descuenta metrosRestantes, sin volver a tocar el stock de bodega.
export function MetrajePage() {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const [soloActivas, setSoloActivas] = useState(true);
  const [form, setForm] = useState(FORM_VACIO);
  const [cerrandoId, setCerrandoId] = useState<number | null>(null);
  const [devolverSobrante, setDevolverSobrante] = useState(true);
  // Metros MEDIDOS en bodega al recibir el rollo de vuelta — si se llena,
  // eso es lo que entra al stock y la diferencia con lo que decía el
  // sistema queda como faltante del técnico (ver Centro de Control → Cuadre).
  const [metrosContados, setMetrosContados] = useState("");
  // Confirmación EN FLUJO para cerrar sin devolver el sobrante (se pierde
  // del stock) — a propósito no usa useConfirm()/ConfirmProvider: ese
  // también renderiza vía el Modal.tsx compartido, y en esta máquina esos
  // overlays position:fixed a veces no pintan hasta forzar un repintado
  // ajeno (ver memoria del proyecto).
  const [confirmandoSinDevolverId, setConfirmandoSinDevolverId] = useState<number | null>(null);

  const { data: asignaciones, isLoading } = useQuery({
    queryKey: ["metraje-asignaciones", soloActivas],
    queryFn: async () => (await api.get<AsignacionMetraje[]>("/metraje/asignaciones", { params: { activo: soloActivas ? "true" : undefined } })).data,
  });
  const { data: productos } = useQuery({
    queryKey: ["productos"],
    queryFn: async () => (await api.get<Producto[]>("/productos")).data,
  });
  const { data: empleados } = useQuery({
    queryKey: ["empleados-activos"],
    queryFn: async () => (await api.get<Empleado[]>("/empleados")).data.filter((e) => e.activo),
  });
  const { data: bodegas } = useQuery({
    queryKey: ["bodegas"],
    queryFn: async () => (await api.get<Bodega[]>("/bodegas")).data,
  });

  const asignar = useMutation({
    mutationFn: async () =>
      api.post("/metraje/asignaciones", {
        productoId: Number(form.productoId),
        empleadoId: Number(form.empleadoId),
        metros: Number(form.metros),
        bodegaId: Number(form.bodegaId),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["metraje-asignaciones"] });
      queryClient.invalidateQueries({ queryKey: ["productos"] });
      setForm(FORM_VACIO);
      mostrarToast("Rollo asignado", "success");
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "No se pudo asignar el rollo"),
  });

  const cerrar = useMutation({
    mutationFn: async ({ id, devolver }: { id: number; devolver: boolean }) =>
      (
        await api.patch<AsignacionMetraje & { metrosFaltantes: number | null }>(`/metraje/asignaciones/${id}/cerrar`, {
          devolverSobrante: devolver,
          metrosFisicos: devolver && metrosContados.trim() !== "" ? Number(metrosContados) : undefined,
        })
      ).data,
    onSuccess: (cerrada) => {
      queryClient.invalidateQueries({ queryKey: ["metraje-asignaciones"] });
      queryClient.invalidateQueries({ queryKey: ["productos"] });
      setCerrandoId(null);
      setMetrosContados("");
      if (cerrada.metrosFaltantes != null && cerrada.metrosFaltantes > 0) {
        mostrarToast(`Asignación cerrada — faltan ${cerrada.metrosFaltantes} m que no aparecen en ninguna acta`, "info");
      } else {
        mostrarToast("Asignación cerrada", "success");
      }
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "No se pudo cerrar la asignación"),
  });

  // Buscador del listado (en el navegador: la lista ya viene completa).
  const filtros = useFiltrosListado(sinPaginacion);
  const asignacionesFiltradas = filtrarLocal(asignaciones, filtros, {
    textos: (a) => [a.producto.nombre, a.producto.codigo, `${a.empleado.nombres} ${a.empleado.apellidos}`, a.bodega.nombre],
    fecha: (a) => a.createdAt,
  });

  const metrosEnManos = (asignacionesFiltradas ?? []).filter((x) => x.activo).reduce((acumulado, x) => acumulado + x.metrosRestantes, 0);

  return (
    <div>
      <div className="bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-stone-300 dark:border-gray-700">
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-50">Metraje de cable</h2>
          <span className="font-mono text-[11px] text-gray-400 dark:text-gray-500">
            {asignaciones ? `${asignaciones.length} asignaci${asignaciones.length === 1 ? "ón" : "ones"}${soloActivas ? " activas" : ""}` : ""}
          </span>
        </div>
        <div className="px-4 py-2 bg-stone-50 dark:bg-gray-900/40 border-b border-stone-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
          Rollos de cable (UTP, fibra) entregados a un técnico — el rollo entero sale de bodega al asignarlo; lo que reporta usar en cada visita
          solo descuenta de lo que le queda a él, no vuelve a tocar el stock.
        </div>

        {/* Línea de ingreso: asignar un rollo a un técnico */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (form.productoId && form.empleadoId && form.metros && Number(form.metros) > 0 && form.bodegaId) asignar.mutate();
          }}
          className="flex flex-wrap items-end gap-2 p-3 border-b border-stone-300 dark:border-gray-700"
        >
          <label className="flex flex-col gap-1 flex-[2_1_240px] min-w-0">
            <span className={CLASE_ETIQUETA}>Asignar rollo · cable</span>
            <select required value={form.productoId} onChange={(e) => setForm({ ...form, productoId: e.target.value })} className={CLASE_CAMPO}>
              <option value="">Producto (tipo de cable)...</option>
              {(productos ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} ({p.codigo}) — stock: {p.stockActual}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 flex-[1_1_180px] min-w-0">
            <span className={CLASE_ETIQUETA}>Técnico</span>
            <select required value={form.empleadoId} onChange={(e) => setForm({ ...form, empleadoId: e.target.value })} className={CLASE_CAMPO}>
              <option value="">Elegir técnico...</option>
              {(empleados ?? []).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombres} {e.apellidos}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 flex-[1_1_160px] min-w-0">
            <span className={CLASE_ETIQUETA}>Bodega de origen</span>
            <select required value={form.bodegaId} onChange={(e) => setForm({ ...form, bodegaId: e.target.value })} className={CLASE_CAMPO}>
              <option value="">Elegir bodega...</option>
              {(bodegas ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 w-28">
            <span className={CLASE_ETIQUETA}>Metros</span>
            <input
              type="number"
              min={1}
              required
              placeholder="305"
              value={form.metros}
              onChange={(e) => setForm({ ...form, metros: e.target.value })}
              className={`${CLASE_CAMPO} text-right font-mono`}
            />
          </label>
          <button
            type="submit"
            disabled={asignar.isPending}
            className="bg-brand-700 text-white px-4 py-1.5 rounded-sm text-sm font-semibold hover:bg-brand-800 disabled:opacity-50 whitespace-nowrap"
          >
            {asignar.isPending ? "Asignando..." : "Asignar rollo ↵"}
          </button>
        </form>

        <BarraBuscadorDocumentos
          filtros={filtros}
          etiquetaBusqueda="Buscar · cable, código, técnico o bodega"
          placeholder="Ej: UTP, Pérez, Bodega principal..."
          mostrarPago={false}
          extras={
            <label className="flex items-center gap-2 h-[34px] text-xs text-gray-600 dark:text-gray-300">
              <input type="checkbox" checked={soloActivas} onChange={(e) => setSoloActivas(e.target.checked)} />
              Solo activas
            </label>
          }
        />
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700 text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 [&_th]:font-medium">
            <tr>
              <th className="px-4 py-2">Producto</th>
              <th className="px-4 py-2">Técnico</th>
              <th className="px-4 py-2">Bodega</th>
              <th className="px-4 py-2 w-56">Metros (restan / rollo)</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">Cargando...</td>
              </tr>
            )}
            {!isLoading && asignacionesFiltradas?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">{filtros.hayFiltros ? "Ninguna asignación coincide con la búsqueda." : `Sin asignaciones${soloActivas ? " activas" : ""}`}</td>
              </tr>
            )}
            {asignacionesFiltradas?.map((a) => (
              <tr key={a.id} className={`border-t border-stone-100 dark:border-gray-700 hover:bg-stone-50 dark:hover:bg-gray-700/30 ${a.activo ? "" : "text-gray-400 dark:text-gray-500"}`}>
                <td className="px-4 py-2">
                  <Resaltar texto={a.producto.nombre} termino={filtros.busquedaAplicada} /> <span className="font-mono text-xs text-gray-400 dark:text-gray-500">(<Resaltar texto={a.producto.codigo} termino={filtros.busquedaAplicada} />)</span>
                </td>
                <td className="px-4 py-2"><Resaltar texto={`${a.empleado.nombres} ${a.empleado.apellidos}`} termino={filtros.busquedaAplicada} /></td>
                <td className="px-4 py-2 text-gray-600 dark:text-gray-300"><Resaltar texto={a.bodega.nombre} termino={filtros.busquedaAplicada} /></td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono tabular-nums whitespace-nowrap">
                      <span className={a.metrosRestantes === 0 ? "text-red-600 dark:text-red-400 font-semibold" : "font-semibold"}>{a.metrosRestantes}</span>
                      <span className="text-gray-400 dark:text-gray-500"> / {a.metrosIniciales} m</span>
                    </span>
                    {/* barra: lo que le queda del rollo al técnico */}
                    <span className="flex-1 h-1.5 bg-stone-200 dark:bg-gray-700 min-w-12">
                      <span
                        className={`block h-full ${a.metrosRestantes === 0 ? "bg-red-500" : "bg-brand-600"}`}
                        style={{ width: `${a.metrosIniciales > 0 ? Math.min(100, (a.metrosRestantes / a.metrosIniciales) * 100) : 0}%` }}
                      />
                    </span>
                    {!a.activo && <span className="font-mono text-[10px] uppercase tracking-wider border border-current px-1 rounded-sm">Cerrada</span>}
                  </div>
                </td>
                <td className="px-4 py-2 text-right">
                  {a.activo && confirmandoSinDevolverId === a.id ? (
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-[11px] text-red-600 dark:text-red-400">¿Perder {a.metrosRestantes}m sin devolver a bodega?</span>
                      <button
                        onClick={() => cerrar.mutate({ id: a.id, devolver: false })}
                        disabled={cerrar.isPending}
                        className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                      >
                        {cerrar.isPending ? "..." : "Sí, cerrar"}
                      </button>
                      <button onClick={() => setConfirmandoSinDevolverId(null)} className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:underline">
                        Cancelar
                      </button>
                    </div>
                  ) : a.activo && cerrandoId === a.id ? (
                    <div className="flex items-center justify-end gap-2">
                      <label className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                        <input type="checkbox" checked={devolverSobrante} onChange={(e) => setDevolverSobrante(e.target.checked)} />
                        Devolver {a.metrosRestantes}m a bodega
                      </label>
                      {devolverSobrante && (
                        <input
                          type="number"
                          min={0}
                          max={a.metrosIniciales}
                          value={metrosContados}
                          onChange={(e) => setMetrosContados(e.target.value)}
                          placeholder="m contados"
                          title="Metros medidos al recibir el rollo (opcional) — si no coinciden con lo que dice el sistema, la diferencia queda como faltante del técnico"
                          className="w-24 border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 rounded-sm px-1.5 py-0.5 text-xs font-mono"
                        />
                      )}
                      <button
                        onClick={() => (devolverSobrante ? cerrar.mutate({ id: a.id, devolver: true }) : setConfirmandoSinDevolverId(a.id))}
                        disabled={cerrar.isPending}
                        className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline disabled:opacity-50"
                      >
                        Confirmar
                      </button>
                      <button onClick={() => { setCerrandoId(null); setMetrosContados(""); }} className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:underline">
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    a.activo && (
                      <button onClick={() => setCerrandoId(a.id)} className="text-red-600 dark:text-red-400 hover:underline text-xs font-semibold">
                        Cerrar
                      </button>
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {(asignacionesFiltradas?.length ?? 0) > 0 && (
          <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 px-4 py-2.5 border-t-2 border-gray-900 dark:border-gray-200">
            <span className="font-mono text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {asignacionesFiltradas?.length} asignaci{asignacionesFiltradas?.length === 1 ? "ón" : "ones"}
              {filtros.hayFiltros ? " · según filtro" : ""}
            </span>
            <span className="text-sm font-bold text-gray-900 dark:text-gray-50">
              METROS EN MANOS DE TÉCNICOS <span className="font-mono tabular-nums ml-2">{metrosEnManos.toLocaleString("es-EC")}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
