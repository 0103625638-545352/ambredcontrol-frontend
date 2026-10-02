import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type PlanInternet } from "../api/client";
import { useConfirm } from "../components/ConfirmProvider";
import { useToast } from "../components/ToastProvider";
import { formatearVelocidadMikrotik } from "./MikrotikPage";
import { useFiltrosListado, BarraBuscadorDocumentos, filtrarLocal, sinPaginacion } from "../components/BuscadorDocumentos";
import {
  CLASE_CAMPO,
  CLASE_ETIQUETA,
  CLASE_THEAD,
  CLASE_CAMPO_CELDA,
  CLASE_ACCION,
  CLASE_ACCION_PELIGRO,
  PanelListado,
  FilaSinResultados,
  Resaltar,
} from "../components/FormatoDocumento";

// Catálogo de planes de internet (nombre + velocidad + precio + código de
// Mikrotik) que un Cliente del ISP puede contratar (ver
// Cliente.planInternetId). "codigoMikrotik" tiene que ser el nombre EXACTO
// de una address-list ya configurada en el router (ej. "PLAN550") — este
// sistema solo agrega/quita la IP del cliente de esa lista al asignarle el
// plan (ver routes/clientes.ts). velocidadSubida/velocidadBajada son solo
// informativas acá: el límite real se aprovisiona en la OLT por ONU, no en
// el Mikrotik (la empresa evita saturar el router con Queues de todos los
// clientes).
export function PlanesInternetPage() {
  const queryClient = useQueryClient();
  const confirmar = useConfirm();
  const { mostrarToast } = useToast();
  const FORM_VACIO = { nombre: "", velocidadSubida: "", velocidadBajada: "", precio: "", codigoMikrotik: "" };
  const [formNuevo, setFormNuevo] = useState(FORM_VACIO);
  const [planEditandoId, setPlanEditandoId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState(FORM_VACIO);

  const { data: planes, isLoading } = useQuery({
    queryKey: ["planes-internet"],
    queryFn: async () => (await api.get<PlanInternet[]>("/planes-internet")).data,
  });

  const crear = useMutation({
    mutationFn: async () =>
      api.post("/planes-internet", { ...formNuevo, precio: parseFloat(formNuevo.precio) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planes-internet"] });
      setFormNuevo(FORM_VACIO);
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al crear el plan de internet"),
  });

  const editar = useMutation({
    mutationFn: async (id: number) => api.put(`/planes-internet/${id}`, { ...editForm, precio: parseFloat(editForm.precio) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planes-internet"] });
      queryClient.invalidateQueries({ queryKey: ["clientes"] }); // el nombre/velocidad puede aparecer en la tabla de clientes
      setPlanEditandoId(null);
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al editar el plan de internet"),
  });

  const desactivar = useMutation({
    mutationFn: async (id: number) => api.delete(`/planes-internet/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["planes-internet"] }),
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al desactivar el plan de internet"),
  });

  function abrirEdicion(p: PlanInternet) {
    setEditForm({
      nombre: p.nombre,
      velocidadSubida: p.velocidadSubida,
      velocidadBajada: p.velocidadBajada,
      precio: p.precio,
      codigoMikrotik: p.codigoMikrotik ?? "",
    });
    setPlanEditandoId(planEditandoId === p.id ? null : p.id);
  }

  async function confirmarDesactivar(p: PlanInternet) {
    const ok = await confirmar(`¿Desactivar "${p.nombre}"? Los clientes que ya lo tienen asignado lo conservan.`);
    if (ok) desactivar.mutate(p.id);
  }

  // Buscador del catálogo (en el navegador: la lista ya viene completa).
  const filtros = useFiltrosListado(sinPaginacion);
  const planesFiltrados = filtrarLocal(planes, filtros, {
    textos: (p) => [p.nombre, p.codigoMikrotik, p.velocidadSubida, p.velocidadBajada, p.precio],
  });

  return (
    <div className="max-w-5xl">
      <PanelListado titulo="Planes de internet" conteo={planes?.length} singular="plan" plural="planes" aviso={<>Catálogo de planes contratables por los clientes del ISP. El "código Mikrotik" debe ser el nombre exacto de la address-list en el router (ej. "PLAN550", ya con su Queue de velocidad configurado ahí) — al asignar el plan desde Clientes, el sistema agrega la IP del cliente a esa lista.</>}>
        {/* Línea de ingreso: nuevo plan */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (formNuevo.nombre.trim() && formNuevo.velocidadSubida.trim() && formNuevo.velocidadBajada.trim() && formNuevo.precio !== "") {
              crear.mutate();
            }
          }}
          className="flex flex-wrap items-end gap-2 p-3 border-b border-stone-300 dark:border-gray-700"
        >
          <label className="flex flex-col gap-1 flex-[2_1_220px] min-w-0">
            <span className={CLASE_ETIQUETA}>Nuevo plan</span>
            <input
              placeholder="Ej: Plan Hogar 10 Mbps"
              required
              value={formNuevo.nombre}
              onChange={(e) => setFormNuevo({ ...formNuevo, nombre: e.target.value })}
              className={CLASE_CAMPO}
            />
          </label>
          <label className="flex flex-col gap-1 w-24">
            <span className={CLASE_ETIQUETA}>Subida</span>
            <input
              placeholder="5M"
              required
              value={formNuevo.velocidadSubida}
              onChange={(e) => setFormNuevo({ ...formNuevo, velocidadSubida: e.target.value })}
              className={`${CLASE_CAMPO} font-mono`}
            />
          </label>
          <label className="flex flex-col gap-1 w-24">
            <span className={CLASE_ETIQUETA}>Bajada</span>
            <input
              placeholder="10M"
              required
              value={formNuevo.velocidadBajada}
              onChange={(e) => setFormNuevo({ ...formNuevo, velocidadBajada: e.target.value })}
              className={`${CLASE_CAMPO} font-mono`}
            />
          </label>
          <label className="flex flex-col gap-1 w-28">
            <span className={CLASE_ETIQUETA}>Precio mensual</span>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              required
              value={formNuevo.precio}
              onChange={(e) => setFormNuevo({ ...formNuevo, precio: e.target.value })}
              className={`${CLASE_CAMPO} text-right font-mono`}
            />
          </label>
          <label className="flex flex-col gap-1 w-40">
            <span className={CLASE_ETIQUETA}>Código Mikrotik</span>
            <input
              placeholder="PLAN550"
              value={formNuevo.codigoMikrotik}
              onChange={(e) => setFormNuevo({ ...formNuevo, codigoMikrotik: e.target.value })}
              className={`${CLASE_CAMPO} font-mono`}
            />
          </label>
          <button
            type="submit"
            disabled={crear.isPending}
            className="bg-brand-700 text-white px-4 py-1.5 rounded-sm text-sm font-semibold hover:bg-brand-800 disabled:opacity-50 whitespace-nowrap"
          >
            {crear.isPending ? "Guardando..." : "Agregar ↵"}
          </button>
        </form>

        <BarraBuscadorDocumentos
          filtros={filtros}
          etiquetaBusqueda="Buscar · nombre, velocidad, precio o código Mikrotik"
          placeholder="Ej: Hogar, 10M, PLAN550..."
          mostrarPago={false}
          mostrarFechas={false}
        />

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className={CLASE_THEAD}>
              <tr>
                <th className="px-4 py-2 w-10">#</th>
                <th className="px-4 py-2">Nombre</th>
                <th className="px-4 py-2">Subida</th>
                <th className="px-4 py-2">Bajada</th>
                <th className="px-4 py-2 text-right">Precio / mes</th>
                <th className="px-4 py-2">Código Mikrotik</th>
                <th className="px-4 py-2 w-40"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-gray-400 dark:text-gray-500">
                    Cargando...
                  </td>
                </tr>
              )}
              {!isLoading && planesFiltrados?.length === 0 && (
                <FilaSinResultados columnas={7} hayFiltros={filtros.hayFiltros} vacio="Todavía no hay planes de internet." />
              )}
              {planesFiltrados?.map((p, indice) => (
                <tr key={p.id} className="border-t border-stone-100 dark:border-gray-700 hover:bg-stone-50 dark:hover:bg-gray-700/30">
                  {planEditandoId === p.id ? (
                    <td colSpan={7} className="px-4 py-2">
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          editar.mutate(p.id);
                        }}
                        className="flex flex-wrap gap-2"
                      >
                        <input
                          autoFocus
                          required
                          value={editForm.nombre}
                          onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") setPlanEditandoId(null);
                          }}
                          className={`${CLASE_CAMPO_CELDA} flex-1 min-w-40 text-left font-sans`}
                        />
                        <input
                          required
                          value={editForm.velocidadSubida}
                          onChange={(e) => setEditForm({ ...editForm, velocidadSubida: e.target.value })}
                          className={`${CLASE_CAMPO_CELDA} w-20 text-left`}
                        />
                        <input
                          required
                          value={editForm.velocidadBajada}
                          onChange={(e) => setEditForm({ ...editForm, velocidadBajada: e.target.value })}
                          className={`${CLASE_CAMPO_CELDA} w-20 text-left`}
                        />
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          value={editForm.precio}
                          onChange={(e) => setEditForm({ ...editForm, precio: e.target.value })}
                          className={`${CLASE_CAMPO_CELDA} w-24`}
                        />
                        <input
                          placeholder="Código Mikrotik"
                          value={editForm.codigoMikrotik}
                          onChange={(e) => setEditForm({ ...editForm, codigoMikrotik: e.target.value })}
                          className={`${CLASE_CAMPO_CELDA} w-32 text-left`}
                        />
                        <button
                          type="submit"
                          disabled={editar.isPending}
                          className="bg-brand-700 text-white px-3 py-1 rounded-sm text-xs font-semibold hover:bg-brand-800 disabled:opacity-50"
                        >
                          Guardar
                        </button>
                        <button type="button" onClick={() => setPlanEditandoId(null)} className={CLASE_ACCION}>
                          Cancelar
                        </button>
                      </form>
                    </td>
                  ) : (
                    <>
                      <td className="px-4 py-2 font-mono text-xs text-gray-400">{indice + 1}</td>
                      <td className="px-4 py-2 font-semibold text-gray-800 dark:text-gray-100">
                        <Resaltar texto={p.nombre} termino={filtros.busquedaAplicada} />
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">{formatearVelocidadMikrotik(velocidadAbits(p.velocidadSubida))}</td>
                      <td className="px-4 py-2 font-mono text-xs">{formatearVelocidadMikrotik(velocidadAbits(p.velocidadBajada))}</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums font-semibold text-gray-900 dark:text-gray-50">
                        {Number(p.precio).toFixed(2)}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">
                        {p.codigoMikrotik ? (
                          <Resaltar texto={p.codigoMikrotik} termino={filtros.busquedaAplicada} />
                        ) : (
                          <span className="font-mono text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400">Sin configurar</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-3">
                          <button onClick={() => abrirEdicion(p)} className={CLASE_ACCION}>
                            Editar
                          </button>
                          <button onClick={() => confirmarDesactivar(p)} className={CLASE_ACCION_PELIGRO}>
                            Desactivar
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PanelListado>
    </div>
  );
}

// Los planes se guardan en notación Mikrotik ("5M", "10M") tal cual las
// escribe el admin — formatearVelocidadMikrotik espera bits/segundo crudos
// (como los devuelve el router), así que esto convierte "5M"/"512K" al
// mismo formato antes de reusar esa función para mostrarlo consistente.
function velocidadAbits(valor: string): string {
  const match = valor.trim().match(/^([\d.]+)\s*([KMG]?)$/i);
  if (!match) return valor;
  const numero = parseFloat(match[1]);
  const unidad = match[2].toUpperCase();
  const multiplicador = unidad === "G" ? 1_000_000_000 : unidad === "M" ? 1_000_000 : unidad === "K" ? 1_000 : 1;
  return String(numero * multiplicador);
}
