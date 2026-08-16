import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type PlanInternet } from "../api/client";
import { useConfirm } from "../components/ConfirmProvider";
import { useToast } from "../components/ToastProvider";
import { formatearVelocidadMikrotik } from "./MikrotikPage";

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

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">Planes de Internet</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Catálogo de planes contratables por los clientes del ISP. El "código Mikrotik" debe ser el nombre exacto de la address-list en el router (ej. "PLAN550", ya con su Queue de velocidad configurado ahí) — al asignar el plan desde Clientes, el sistema agrega la IP del cliente a esa lista.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (formNuevo.nombre.trim() && formNuevo.velocidadSubida.trim() && formNuevo.velocidadBajada.trim() && formNuevo.precio !== "") {
            crear.mutate();
          }
        }}
        className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm mb-4 flex flex-wrap gap-3 max-w-3xl"
      >
        <input
          placeholder="Nombre del plan (ej. Plan Hogar 10 Mbps)"
          required
          value={formNuevo.nombre}
          onChange={(e) => setFormNuevo({ ...formNuevo, nombre: e.target.value })}
          className="flex-1 min-w-[200px] border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
        />
        <input
          placeholder="Subida (ej. 5M)"
          required
          value={formNuevo.velocidadSubida}
          onChange={(e) => setFormNuevo({ ...formNuevo, velocidadSubida: e.target.value })}
          className="w-28 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
        />
        <input
          placeholder="Bajada (ej. 10M)"
          required
          value={formNuevo.velocidadBajada}
          onChange={(e) => setFormNuevo({ ...formNuevo, velocidadBajada: e.target.value })}
          className="w-28 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
        />
        <input
          type="number"
          step="0.01"
          min="0"
          placeholder="Precio mensual"
          required
          value={formNuevo.precio}
          onChange={(e) => setFormNuevo({ ...formNuevo, precio: e.target.value })}
          className="w-32 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
        />
        <input
          placeholder="Código Mikrotik (ej. PLAN550)"
          value={formNuevo.codigoMikrotik}
          onChange={(e) => setFormNuevo({ ...formNuevo, codigoMikrotik: e.target.value })}
          className="w-44 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={crear.isPending}
          className="bg-brand-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-brand-700 disabled:opacity-50 whitespace-nowrap"
        >
          {crear.isPending ? "Guardando..." : "+ Agregar"}
        </button>
      </form>

      <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden max-w-3xl">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
            <tr>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2">Subida</th>
              <th className="px-4 py-2">Bajada</th>
              <th className="px-4 py-2">Precio</th>
              <th className="px-4 py-2">Código Mikrotik</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">Cargando...</td>
              </tr>
            )}
            {!isLoading && planes?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">Todavía no hay planes de internet</td>
              </tr>
            )}
            {planes?.map((p) => (
              <tr key={p.id} className="border-t border-gray-100 dark:border-gray-700">
                {planEditandoId === p.id ? (
                  <td colSpan={6} className="px-4 py-2">
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
                        className="flex-1 min-w-[160px] border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1 text-sm"
                      />
                      <input
                        required
                        value={editForm.velocidadSubida}
                        onChange={(e) => setEditForm({ ...editForm, velocidadSubida: e.target.value })}
                        className="w-24 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1 text-sm"
                      />
                      <input
                        required
                        value={editForm.velocidadBajada}
                        onChange={(e) => setEditForm({ ...editForm, velocidadBajada: e.target.value })}
                        className="w-24 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1 text-sm"
                      />
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        value={editForm.precio}
                        onChange={(e) => setEditForm({ ...editForm, precio: e.target.value })}
                        className="w-28 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1 text-sm"
                      />
                      <input
                        placeholder="Código Mikrotik"
                        value={editForm.codigoMikrotik}
                        onChange={(e) => setEditForm({ ...editForm, codigoMikrotik: e.target.value })}
                        className="w-36 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1 text-sm"
                      />
                      <button
                        type="submit"
                        disabled={editar.isPending}
                        className="bg-slate-800 text-white px-3 py-1 rounded-md text-xs font-medium hover:bg-slate-700 disabled:opacity-50"
                      >
                        Guardar
                      </button>
                      <button
                        type="button"
                        onClick={() => setPlanEditandoId(null)}
                        className="bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 px-3 py-1 rounded-md text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-500"
                      >
                        Cancelar
                      </button>
                    </form>
                  </td>
                ) : (
                  <>
                    <td className="px-4 py-2 font-semibold text-gray-800 dark:text-gray-100">{p.nombre}</td>
                    <td className="px-4 py-2">{formatearVelocidadMikrotik(velocidadAbits(p.velocidadSubida))}</td>
                    <td className="px-4 py-2">{formatearVelocidadMikrotik(velocidadAbits(p.velocidadBajada))}</td>
                    <td className="px-4 py-2">${Number(p.precio).toFixed(2)}</td>
                    <td className="px-4 py-2">
                      {p.codigoMikrotik ?? <span className="text-amber-600 dark:text-amber-400 text-xs italic">sin configurar</span>}
                    </td>
                    <td className="px-4 py-2 text-right space-x-3">
                      <button
                        onClick={() => abrirEdicion(p)}
                        className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => confirmarDesactivar(p)}
                        className="text-red-600 dark:text-red-400 hover:underline text-xs font-medium"
                      >
                        Desactivar
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
