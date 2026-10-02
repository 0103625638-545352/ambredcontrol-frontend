import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Proveedor } from "../api/client";

interface Props {
  identificacionInicial?: string;
  onCerrar: () => void;
  onCreado: (proveedor: Proveedor) => void;
}

// Igual que ModalNuevoCliente, pero para proveedores — se abre desde el
// buscador de Compras cuando el proveedor todavía no existe en el catálogo.
export function ModalNuevoProveedor({ identificacionInicial = "", onCerrar, onCreado }: Props) {
  const queryClient = useQueryClient();
  const pareceRuc = /^\d{13}$/.test(identificacionInicial);
  const [form, setForm] = useState({
    tipoIdentificacion: pareceRuc ? "RUC" : "CEDULA",
    identificacion: /^\d+$/.test(identificacionInicial) ? identificacionInicial : "",
    razonSocial: /^\d+$/.test(identificacionInicial) ? "" : identificacionInicial,
    direccion: "",
    telefono: "",
    email: "",
  });

  useEffect(() => {
    function manejarEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    document.addEventListener("keydown", manejarEscape);
    return () => document.removeEventListener("keydown", manejarEscape);
  }, [onCerrar]);

  const crearProveedor = useMutation({
    mutationFn: async () => (await api.post<Proveedor>("/proveedores", form)).data,
    onSuccess: (proveedor) => {
      queryClient.invalidateQueries({ queryKey: ["proveedores"] });
      onCreado(proveedor);
    },
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onCerrar}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-gray-800 rounded-sm border border-stone-300 dark:border-gray-700 shadow-xl w-full max-w-md p-5">
        <div className="flex justify-between items-center -mx-5 -mt-5 mb-4 px-5 py-3 border-b border-stone-300 dark:border-gray-700 bg-stone-50 dark:bg-gray-900/40">
          <h3 className="text-base font-bold text-gray-900 dark:text-gray-50">Nuevo proveedor</h3>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            crearProveedor.mutate();
          }}
          className="grid grid-cols-2 gap-3"
        >
          <select
            value={form.tipoIdentificacion}
            onChange={(e) => setForm({ ...form, tipoIdentificacion: e.target.value })}
            className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
          >
            <option value="RUC">RUC</option>
            <option value="CEDULA">Cédula</option>
            <option value="PASAPORTE">Pasaporte</option>
          </select>
          <input
            placeholder={form.tipoIdentificacion === "RUC" ? "RUC (13 dígitos)" : "Identificación"}
            required
            autoFocus={!form.identificacion}
            value={form.identificacion}
            onChange={(e) => setForm({ ...form, identificacion: e.target.value })}
            className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
          />
          <input
            placeholder="Razón social / Nombres"
            required
            autoFocus={!!form.identificacion}
            value={form.razonSocial}
            onChange={(e) => setForm({ ...form, razonSocial: e.target.value })}
            className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm col-span-2"
          />
          <input
            type="email"
            placeholder="Correo electrónico"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
          />
          <input
            placeholder="Teléfono"
            value={form.telefono}
            onChange={(e) => setForm({ ...form, telefono: e.target.value })}
            className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
          />
          <input
            placeholder="Dirección"
            value={form.direccion}
            onChange={(e) => setForm({ ...form, direccion: e.target.value })}
            className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm col-span-2"
          />
          <button
            type="submit"
            disabled={crearProveedor.isPending}
            className="col-span-2 bg-brand-700 text-white py-2 rounded-md text-sm font-semibold hover:bg-brand-800 disabled:opacity-50"
          >
            {crearProveedor.isPending ? "Guardando..." : "Guardar y seleccionar"}
          </button>
          {crearProveedor.isError && (
            <p className="col-span-2 text-red-600 dark:text-red-400 text-sm">
              {(crearProveedor.error as any)?.response?.data?.error ?? "Error al guardar el proveedor"}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
