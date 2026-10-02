import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type PromocionPlan, type PlanInternet, type AlcancePromocion } from "../api/client";
import { useToast } from "../components/ToastProvider";
import { useFiltrosListado, BarraBuscadorDocumentos, filtrarLocal, sinPaginacion } from "../components/BuscadorDocumentos";
import { Resaltar } from "../components/FormatoDocumento";

const campoClase =
  "border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm";

const FORM_VACIO = {
  nombre: "",
  porcentajeDescuento: "",
  fechaInicio: "",
  fechaFin: "",
  alcance: "TODOS_LOS_CLIENTES" as AlcancePromocion,
  mesesDesdeContrato: "",
  planInternetId: "",
};

function formatearFecha(fechaIso: string): string {
  return new Date(fechaIso).toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" });
}

// Definido a nivel de MÓDULO a propósito, no dentro de PromocionesPage: un
// componente declarado dentro de otro componente cambia de identidad en
// cada render (nueva función = nuevo tipo para React), lo que hace que
// React destruya y vuelva a crear estos <input> en cada tecla — el síntoma
// es justo perder el foco/cursor al escribir (muy notorio con la barra
// espaciadora, que además hace scroll de la página si el input ya perdió el
// foco). "planes" se recibe como prop en vez de por closure, precisamente
// para poder vivir afuera de PromocionesPage.
function CamposPromocion({
  form,
  set,
  planes,
}: {
  form: typeof FORM_VACIO;
  set: (f: typeof FORM_VACIO) => void;
  planes: PlanInternet[] | undefined;
}) {
  return (
    <>
      <input
        placeholder="Nombre (ej. Promo Octubre 2026)"
        required
        value={form.nombre}
        onChange={(e) => set({ ...form, nombre: e.target.value })}
        className={`${campoClase} flex-1 min-w-[200px]`}
      />
      <input
        type="number"
        step="0.01"
        min="0.01"
        max="100"
        placeholder="% descuento"
        required
        value={form.porcentajeDescuento}
        onChange={(e) => set({ ...form, porcentajeDescuento: e.target.value })}
        className={`${campoClase} w-28`}
      />
      <select value={form.alcance} onChange={(e) => set({ ...form, alcance: e.target.value as AlcancePromocion })} className={campoClase}>
        <option value="TODOS_LOS_CLIENTES">Todos los clientes</option>
        <option value="CLIENTES_NUEVOS">Solo clientes nuevos</option>
      </select>
      {form.alcance === "CLIENTES_NUEVOS" && (
        <input
          type="number"
          min="1"
          placeholder="Meses desde contrato"
          required
          value={form.mesesDesdeContrato}
          onChange={(e) => set({ ...form, mesesDesdeContrato: e.target.value })}
          className={`${campoClase} w-36`}
        />
      )}
      <select value={form.planInternetId} onChange={(e) => set({ ...form, planInternetId: e.target.value })} className={campoClase}>
        <option value="">Todos los planes</option>
        {planes?.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500 dark:text-gray-400">Desde</label>
        <input type="date" required value={form.fechaInicio} onChange={(e) => set({ ...form, fechaInicio: e.target.value })} className={campoClase} />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500 dark:text-gray-400">Hasta (opcional)</label>
        <input type="date" value={form.fechaFin} onChange={(e) => set({ ...form, fechaFin: e.target.value })} className={campoClase} />
      </div>
    </>
  );
}

// Descuentos temporales sobre la facturación de internet (ver PromocionPlan
// en schema.prisma) — dos casos reales: una campaña por fecha calendario
// ("todo octubre, 50% para todos") o un incentivo atado a la antigüedad del
// contrato ("60% los primeros 3 meses de clientes nuevos"). Nunca toca
// PlanInternet.precio: la promo se resta como descuento en la factura
// puntual del momento (ver routes/facturasInternet.ts) — las facturas ya
// emitidas nunca cambian si se edita o desactiva la promoción después.
//
// Mismo patrón de formulario en línea que PlanesInternetPage.tsx/
// OltsPage.tsx (sin Modal.tsx ni useConfirm() — ver memoria del proyecto
// sobre overlays position:fixed que a veces no pintan en esta máquina): el
// "Desactivar" se confirma con un paso extra en la misma fila, no con un
// diálogo flotante.
export function PromocionesPage() {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const [formNuevo, setFormNuevo] = useState(FORM_VACIO);
  const [promoEditandoId, setPromoEditandoId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState(FORM_VACIO);
  const [confirmandoDesactivarId, setConfirmandoDesactivarId] = useState<number | null>(null);

  const { data: promociones, isLoading } = useQuery({
    queryKey: ["promociones"],
    queryFn: async () => (await api.get<PromocionPlan[]>("/promociones")).data,
  });

  const { data: planes } = useQuery({
    queryKey: ["planes-internet"],
    queryFn: async () => (await api.get<PlanInternet[]>("/planes-internet")).data,
  });

  function cuerpoDesde(form: typeof FORM_VACIO) {
    return {
      nombre: form.nombre,
      porcentajeDescuento: parseFloat(form.porcentajeDescuento),
      fechaInicio: form.fechaInicio,
      fechaFin: form.fechaFin || null,
      alcance: form.alcance,
      mesesDesdeContrato: form.alcance === "CLIENTES_NUEVOS" ? Number(form.mesesDesdeContrato) : null,
      planInternetId: form.planInternetId ? Number(form.planInternetId) : null,
    };
  }

  const crear = useMutation({
    mutationFn: async () => api.post("/promociones", cuerpoDesde(formNuevo)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["promociones"] });
      setFormNuevo(FORM_VACIO);
      mostrarToast("Promoción creada", "success");
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al crear la promoción"),
  });

  const editar = useMutation({
    mutationFn: async (id: number) => api.put(`/promociones/${id}`, cuerpoDesde(editForm)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["promociones"] });
      setPromoEditandoId(null);
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al editar la promoción"),
  });

  const desactivar = useMutation({
    mutationFn: async (id: number) => api.delete(`/promociones/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["promociones"] });
      setConfirmandoDesactivarId(null);
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al desactivar la promoción"),
  });

  function abrirEdicion(p: PromocionPlan) {
    setEditForm({
      nombre: p.nombre,
      porcentajeDescuento: p.porcentajeDescuento,
      fechaInicio: p.fechaInicio.slice(0, 10),
      fechaFin: p.fechaFin ? p.fechaFin.slice(0, 10) : "",
      alcance: p.alcance,
      mesesDesdeContrato: p.mesesDesdeContrato != null ? String(p.mesesDesdeContrato) : "",
      planInternetId: p.planInternetId != null ? String(p.planInternetId) : "",
    });
    setPromoEditandoId(promoEditandoId === p.id ? null : p.id);
  }

  // Buscador del listado (en el navegador: la lista ya viene completa).
  const filtros = useFiltrosListado(sinPaginacion);
  const promocionesFiltradas = filtrarLocal(promociones, filtros, {
    textos: (p) => [p.nombre, p.planInternet?.nombre ?? "Todos", p.porcentajeDescuento],
    fecha: (p) => p.fechaInicio,
    estado: (p) => p.alcance,
  });

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900 dark:text-gray-50 mb-1">Promociones</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 max-w-3xl">
        Descuentos temporales sobre la facturación de internet — por fecha calendario ("todo octubre, 50% para todos") o por antigüedad del
        contrato ("60% los primeros N meses de clientes nuevos"). Nunca cambia el precio de lista del plan: se aplica solo al facturar, y las
        facturas ya emitidas no se ven afectadas si la promoción se edita o desactiva después. Si más de una promoción calzara al mismo tiempo,
        gana la más específica de un plan puntual sobre una general, y entre iguales, la de mayor %.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (formNuevo.nombre.trim() && formNuevo.porcentajeDescuento !== "" && formNuevo.fechaInicio) crear.mutate();
        }}
        className="bg-white dark:bg-gray-800 p-4 rounded-sm border border-stone-300 dark:border-gray-700 mb-4 flex flex-wrap items-end gap-3"
      >
        <CamposPromocion form={formNuevo} set={setFormNuevo} planes={planes} />
        <button
          type="submit"
          disabled={crear.isPending}
          className="bg-brand-700 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-brand-800 disabled:opacity-50 whitespace-nowrap"
        >
          {crear.isPending ? "Guardando..." : "+ Agregar"}
        </button>
      </form>

      <div className="bg-white dark:bg-gray-800 rounded-sm border border-stone-300 dark:border-gray-700 overflow-hidden overflow-x-auto">
        <BarraBuscadorDocumentos
          filtros={filtros}
          etiquetaBusqueda="Buscar · nombre, plan o % de descuento"
          placeholder="Ej: Navidad, Hogar 10..."
          etiquetaEstado="Alcance"
          opcionesEstado={[
            { valor: "TODOS_LOS_CLIENTES", etiqueta: "Todos los clientes" },
            { valor: "CLIENTES_NUEVOS", etiqueta: "Clientes nuevos" },
          ]}
          mostrarPago={false}
        />
        <table className="w-full text-sm">
          <thead className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700 text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 [&_th]:font-medium">
            <tr>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2">%</th>
              <th className="px-4 py-2">Alcance</th>
              <th className="px-4 py-2">Plan</th>
              <th className="px-4 py-2">Vigencia</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">
                  Cargando...
                </td>
              </tr>
            )}
            {!isLoading && promocionesFiltradas?.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">
                  {filtros.hayFiltros ? "Ninguna promoción coincide con la búsqueda." : "Todavía no hay ninguna promoción creada"}
                </td>
              </tr>
            )}
            {promocionesFiltradas?.map((p) => {
              const hoy = new Date();
              const vigente = p.activo && new Date(p.fechaInicio) <= hoy && (!p.fechaFin || new Date(p.fechaFin) >= hoy);
              return (
                <tr key={p.id} className="border-t border-stone-100 dark:border-gray-700">
                  {promoEditandoId === p.id ? (
                    <td colSpan={7} className="px-4 py-2">
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          editar.mutate(p.id);
                        }}
                        className="flex flex-wrap items-end gap-2"
                      >
                        <CamposPromocion form={editForm} set={setEditForm} planes={planes} />
                        <button
                          type="submit"
                          disabled={editar.isPending}
                          className="bg-brand-700 text-white px-3 py-2 rounded-md text-xs font-semibold hover:bg-brand-800 disabled:opacity-50"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          onClick={() => setPromoEditandoId(null)}
                          className="bg-stone-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 px-3 py-2 rounded-md text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-500"
                        >
                          Cancelar
                        </button>
                      </form>
                    </td>
                  ) : (
                    <>
                      <td className="px-4 py-2 font-semibold text-gray-800 dark:text-gray-100"><Resaltar texto={p.nombre} termino={filtros.busquedaAplicada} /></td>
                      <td className="px-4 py-2 text-gray-800 dark:text-gray-100">{Number(p.porcentajeDescuento)}%</td>
                      <td className="px-4 py-2 text-gray-600 dark:text-gray-300">
                        {p.alcance === "CLIENTES_NUEVOS" ? `Nuevos (${p.mesesDesdeContrato} meses)` : "Todos"}
                      </td>
                      <td className="px-4 py-2 text-gray-600 dark:text-gray-300"><Resaltar texto={p.planInternet?.nombre ?? "Todos"} termino={filtros.busquedaAplicada} /></td>
                      <td className="px-4 py-2 text-gray-600 dark:text-gray-300 text-xs">
                        {formatearFecha(p.fechaInicio)} — {p.fechaFin ? formatearFecha(p.fechaFin) : "sin fin"}
                      </td>
                      <td className="px-4 py-2">
                        {vigente ? (
                          <span className="font-mono text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-sm bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                            Vigente
                          </span>
                        ) : p.activo ? (
                          <span className="font-mono text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-sm bg-stone-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                            Fuera de fecha
                          </span>
                        ) : (
                          <span className="font-mono text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-sm bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">
                            Desactivada
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right space-x-3 whitespace-nowrap">
                        {confirmandoDesactivarId === p.id ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="text-xs text-gray-600 dark:text-gray-300">¿Desactivar?</span>
                            <button
                              onClick={() => desactivar.mutate(p.id)}
                              disabled={desactivar.isPending}
                              className="text-red-600 dark:text-red-400 hover:underline text-xs font-medium disabled:opacity-50"
                            >
                              Sí, desactivar
                            </button>
                            <button
                              onClick={() => setConfirmandoDesactivarId(null)}
                              className="text-gray-500 dark:text-gray-400 hover:underline text-xs font-medium"
                            >
                              Cancelar
                            </button>
                          </span>
                        ) : (
                          <>
                            <button onClick={() => abrirEdicion(p)} className="text-brand-700 dark:text-brand-300 hover:underline text-xs font-medium">
                              Editar
                            </button>
                            {p.activo && (
                              <button
                                onClick={() => setConfirmandoDesactivarId(p.id)}
                                className="text-red-600 dark:text-red-400 hover:underline text-xs font-medium"
                              >
                                Desactivar
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
