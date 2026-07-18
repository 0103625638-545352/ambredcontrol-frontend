import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type CuentaBancaria } from "../api/client";
import { useConfirm } from "../components/ConfirmProvider";
import { useToast } from "../components/ToastProvider";

const TIPOS_CUENTA = ["AHORROS", "CORRIENTE"];

// Catálogo de cuentas bancarias de la empresa (global, no por sucursal) — se
// elige al registrar un Pago con formaPago TRANSFERENCIA/TARJETA/CHEQUE (ver
// ModalRegistrarPago.tsx y PuntoDeVentaPage.tsx), para poder conciliar el
// dinero real contra lo registrado en el sistema. Mirror de
// TiposPrecioPage.tsx, con más campos por fila. Solo ADMIN puede crear/
// editar/desactivar.
export function CuentasBancariasPage() {
  const queryClient = useQueryClient();
  const confirmar = useConfirm();
  const { mostrarToast } = useToast();
  const FORM_VACIO = { nombre: "", banco: "", numeroCuenta: "", tipoCuenta: "AHORROS" };
  const [formNuevo, setFormNuevo] = useState(FORM_VACIO);
  const [cuentaEditandoId, setCuentaEditandoId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState(FORM_VACIO);

  const { data: cuentasBancarias, isLoading } = useQuery({
    queryKey: ["cuentas-bancarias"],
    queryFn: async () => (await api.get<CuentaBancaria[]>("/cuentas-bancarias")).data,
  });

  const crearCuentaBancaria = useMutation({
    mutationFn: async () => api.post("/cuentas-bancarias", formNuevo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cuentas-bancarias"] });
      setFormNuevo(FORM_VACIO);
    },
    onError: (error: any) => {
      mostrarToast(error.response?.data?.error ?? "Error al crear la cuenta bancaria");
    },
  });

  const editarCuentaBancaria = useMutation({
    mutationFn: async (id: number) => api.put(`/cuentas-bancarias/${id}`, editForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cuentas-bancarias"] });
      setCuentaEditandoId(null);
    },
    onError: (error: any) => {
      mostrarToast(error.response?.data?.error ?? "Error al editar la cuenta bancaria");
    },
  });

  const desactivarCuentaBancaria = useMutation({
    mutationFn: async (id: number) => api.delete(`/cuentas-bancarias/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cuentas-bancarias"] });
    },
    onError: (error: any) => {
      mostrarToast(error.response?.data?.error ?? "Error al desactivar la cuenta bancaria");
    },
  });

  function abrirEdicion(cb: CuentaBancaria) {
    setEditForm({ nombre: cb.nombre, banco: cb.banco, numeroCuenta: cb.numeroCuenta, tipoCuenta: cb.tipoCuenta });
    setCuentaEditandoId(cuentaEditandoId === cb.id ? null : cb.id);
  }

  async function confirmarDesactivar(cb: CuentaBancaria) {
    const ok = await confirmar(`¿Desactivar "${cb.nombre}"? Los pagos ya registrados con esta cuenta la conservan.`);
    if (ok) desactivarCuentaBancaria.mutate(cb.id);
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Cuentas Bancarias</h2>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (formNuevo.nombre.trim() && formNuevo.banco.trim() && formNuevo.numeroCuenta.trim()) {
            crearCuentaBancaria.mutate();
          }
        }}
        className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm mb-4 flex flex-wrap gap-3 max-w-3xl"
      >
        <input
          placeholder="Nombre (ej. Pichincha Corriente Principal)"
          required
          value={formNuevo.nombre}
          onChange={(e) => setFormNuevo({ ...formNuevo, nombre: e.target.value })}
          className="flex-1 min-w-[200px] border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
        />
        <input
          placeholder="Banco"
          required
          value={formNuevo.banco}
          onChange={(e) => setFormNuevo({ ...formNuevo, banco: e.target.value })}
          className="flex-1 min-w-[140px] border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
        />
        <input
          placeholder="Número de cuenta"
          required
          value={formNuevo.numeroCuenta}
          onChange={(e) => setFormNuevo({ ...formNuevo, numeroCuenta: e.target.value })}
          className="flex-1 min-w-[140px] border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
        />
        <select
          value={formNuevo.tipoCuenta}
          onChange={(e) => setFormNuevo({ ...formNuevo, tipoCuenta: e.target.value })}
          className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
        >
          {TIPOS_CUENTA.map((tipo) => (
            <option key={tipo} value={tipo}>
              {tipo === "AHORROS" ? "Ahorros" : "Corriente"}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={crearCuentaBancaria.isPending}
          className="bg-emerald-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap"
        >
          {crearCuentaBancaria.isPending ? "Guardando..." : "+ Agregar"}
        </button>
      </form>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden max-w-3xl">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
            <tr>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2">Banco</th>
              <th className="px-4 py-2">Número de cuenta</th>
              <th className="px-4 py-2">Tipo</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">Cargando...</td>
              </tr>
            )}
            {!isLoading && cuentasBancarias?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">Todavía no hay cuentas bancarias</td>
              </tr>
            )}
            {cuentasBancarias?.map((cb) => (
              <tr key={cb.id} className="border-t border-gray-100 dark:border-gray-700">
                {cuentaEditandoId === cb.id ? (
                  <td colSpan={5} className="px-4 py-2">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        editarCuentaBancaria.mutate(cb.id);
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
                        value={editForm.banco}
                        onChange={(e) => setEditForm({ ...editForm, banco: e.target.value })}
                        className="flex-1 min-w-[120px] border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1 text-sm"
                      />
                      <input
                        required
                        value={editForm.numeroCuenta}
                        onChange={(e) => setEditForm({ ...editForm, numeroCuenta: e.target.value })}
                        className="flex-1 min-w-[120px] border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1 text-sm"
                      />
                      <select
                        value={editForm.tipoCuenta}
                        onChange={(e) => setEditForm({ ...editForm, tipoCuenta: e.target.value })}
                        className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1 text-sm"
                      >
                        {TIPOS_CUENTA.map((tipo) => (
                          <option key={tipo} value={tipo}>
                            {tipo === "AHORROS" ? "Ahorros" : "Corriente"}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        disabled={editarCuentaBancaria.isPending}
                        className="bg-slate-800 text-white px-3 py-1 rounded-md text-xs font-medium hover:bg-slate-700 disabled:opacity-50"
                      >
                        Guardar
                      </button>
                      <button
                        type="button"
                        onClick={() => setCuentaEditandoId(null)}
                        className="bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 px-3 py-1 rounded-md text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-500"
                      >
                        Cancelar
                      </button>
                    </form>
                  </td>
                ) : (
                  <>
                    <td className="px-4 py-2 font-semibold text-gray-800 dark:text-gray-100">{cb.nombre}</td>
                    <td className="px-4 py-2">{cb.banco}</td>
                    <td className="px-4 py-2">{cb.numeroCuenta}</td>
                    <td className="px-4 py-2">{cb.tipoCuenta === "AHORROS" ? "Ahorros" : "Corriente"}</td>
                    <td className="px-4 py-2 text-right space-x-3">
                      <button
                        onClick={() => abrirEdicion(cb)}
                        className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => confirmarDesactivar(cb)}
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
