import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Banco } from "../api/client";
import { useConfirm } from "../components/ConfirmProvider";
import { useToast } from "../components/ToastProvider";

// Catálogo de bancos EXTERNOS (Pichincha, Guayaquil, Produbanco, etc.) — de
// dónde vino/salió el dinero de un cobro/pago (banco de procedencia en
// TRANSFERENCIA, banco emisor en TARJETA/CHEQUE), NO las cuentas PROPIAS de
// la empresa (eso es CuentasBancariasPage.tsx). Existe para que el vendedor
// elija de una lista en ModalRegistrarPago.tsx/PuntoDeVentaPage.tsx en vez
// de escribir el nombre a mano. Mirror de TiposPrecioPage.tsx. Solo ADMIN
// puede crear/editar/desactivar — cualquier usuario que cobre puede elegir uno.
export function BancosPage() {
  const queryClient = useQueryClient();
  const confirmar = useConfirm();
  const { mostrarToast } = useToast();
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [bancoEditandoId, setBancoEditandoId] = useState<number | null>(null);
  const [nombreEdit, setNombreEdit] = useState("");

  const { data: bancos, isLoading } = useQuery({
    queryKey: ["bancos"],
    queryFn: async () => (await api.get<Banco[]>("/bancos")).data,
  });

  const crearBanco = useMutation({
    mutationFn: async () => api.post("/bancos", { nombre: nombreNuevo }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bancos"] });
      setNombreNuevo("");
    },
    onError: (error: any) => {
      mostrarToast(error.response?.data?.error ?? "Error al crear el banco");
    },
  });

  const editarBanco = useMutation({
    mutationFn: async (id: number) => api.put(`/bancos/${id}`, { nombre: nombreEdit }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bancos"] });
      setBancoEditandoId(null);
    },
    onError: (error: any) => {
      mostrarToast(error.response?.data?.error ?? "Error al editar el banco");
    },
  });

  const desactivarBanco = useMutation({
    mutationFn: async (id: number) => api.delete(`/bancos/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bancos"] });
    },
    onError: (error: any) => {
      mostrarToast(error.response?.data?.error ?? "Error al desactivar el banco");
    },
  });

  function abrirEdicion(b: Banco) {
    setNombreEdit(b.nombre);
    setBancoEditandoId(bancoEditandoId === b.id ? null : b.id);
  }

  async function confirmarDesactivar(b: Banco) {
    const ok = await confirmar(`¿Desactivar "${b.nombre}"? Los pagos ya registrados con este banco lo conservan.`);
    if (ok) desactivarBanco.mutate(b.id);
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Bancos</h2>
      <p className="text-sm text-gray-400 dark:text-gray-500 mb-4 max-w-2xl">
        Catálogo de bancos externos (de dónde viene el dinero de un cobro) — se elige al registrar un pago por
        transferencia, tarjeta o cheque, para evitar que cada vendedor escriba el nombre del banco a mano.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (nombreNuevo.trim()) crearBanco.mutate();
        }}
        className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm mb-4 flex gap-3 max-w-lg"
      >
        <input
          placeholder="Nombre del banco (ej. Banco Pichincha)"
          required
          value={nombreNuevo}
          onChange={(e) => setNombreNuevo(e.target.value)}
          className="flex-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={crearBanco.isPending}
          className="bg-brand-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-brand-700 disabled:opacity-50 whitespace-nowrap"
        >
          {crearBanco.isPending ? "Guardando..." : "+ Agregar"}
        </button>
      </form>

      <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden max-w-lg">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
            <tr>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={2} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">Cargando...</td>
              </tr>
            )}
            {!isLoading && bancos?.length === 0 && (
              <tr>
                <td colSpan={2} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">Todavía no hay bancos</td>
              </tr>
            )}
            {bancos?.map((b) => (
              <tr key={b.id} className="border-t border-gray-100 dark:border-gray-700">
                {bancoEditandoId === b.id ? (
                  <td colSpan={2} className="px-4 py-2">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        editarBanco.mutate(b.id);
                      }}
                      className="flex gap-2"
                    >
                      <input
                        autoFocus
                        required
                        value={nombreEdit}
                        onChange={(e) => setNombreEdit(e.target.value)}
                        className="flex-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1 text-sm"
                      />
                      <button
                        type="submit"
                        disabled={editarBanco.isPending}
                        className="bg-slate-800 text-white px-3 py-1 rounded-md text-xs font-medium hover:bg-slate-700 disabled:opacity-50"
                      >
                        Guardar
                      </button>
                      <button
                        type="button"
                        onClick={() => setBancoEditandoId(null)}
                        className="bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 px-3 py-1 rounded-md text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-500"
                      >
                        Cancelar
                      </button>
                    </form>
                  </td>
                ) : (
                  <>
                    <td className="px-4 py-2 font-semibold text-gray-800 dark:text-gray-100">{b.nombre}</td>
                    <td className="px-4 py-2 text-right space-x-3">
                      <button
                        onClick={() => abrirEdicion(b)}
                        className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => confirmarDesactivar(b)}
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
