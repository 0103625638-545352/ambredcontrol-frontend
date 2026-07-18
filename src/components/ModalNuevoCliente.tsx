import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Cliente, type TipoPrecio } from "../api/client";

interface Props {
  identificacionInicial?: string;
  onCerrar: () => void;
  onCreado: (cliente: Cliente) => void;
}

// Ventana flotante para crear un cliente sin salir de la pantalla que la
// abrió (hoy solo el Punto de Venta, cuando el buscador de clientes no
// encuentra a nadie). Reutiliza los mismos campos y la misma ruta POST
// /clientes que el formulario de la página de Clientes.
export function ModalNuevoCliente({ identificacionInicial = "", onCerrar, onCreado }: Props) {
  const queryClient = useQueryClient();
  // Si lo que se tecleó en el buscador son puros dígitos, lo pre-cargamos
  // como identificación — y adivinamos RUC (13 dígitos) vs cédula por longitud,
  // para ahorrarle un clic al usuario en el caso más común.
  const pareceRuc = /^\d{13}$/.test(identificacionInicial);
  const [form, setForm] = useState({
    tipoIdentificacion: pareceRuc ? "RUC" : "CEDULA",
    identificacion: /^\d+$/.test(identificacionInicial) ? identificacionInicial : "",
    razonSocial: /^\d+$/.test(identificacionInicial) ? "" : identificacionInicial,
    email: "",
    telefono: "",
    direccion: "",
    ciudad: "",
    tipoPrecioId: "",
  });

  const { data: tiposPrecio } = useQuery({
    queryKey: ["tipos-precio"],
    queryFn: async () => (await api.get<TipoPrecio[]>("/tipos-precio")).data,
  });

  useEffect(() => {
    function manejarEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    document.addEventListener("keydown", manejarEscape);
    return () => document.removeEventListener("keydown", manejarEscape);
  }, [onCerrar]);

  const crearCliente = useMutation({
    mutationFn: async () => (await api.post<Cliente>("/clientes", form)).data,
    onSuccess: (cliente) => {
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      onCreado(cliente);
    },
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onCerrar}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-5"
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">Nuevo cliente</h3>
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
            crearCliente.mutate();
          }}
          className="grid grid-cols-2 gap-3"
        >
          <select
            value={form.tipoIdentificacion}
            onChange={(e) => setForm({ ...form, tipoIdentificacion: e.target.value })}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
          >
            <option value="CEDULA">Cédula</option>
            <option value="RUC">RUC</option>
            <option value="PASAPORTE">Pasaporte</option>
          </select>
          <input
            placeholder={form.tipoIdentificacion === "RUC" ? "RUC (13 dígitos)" : "Identificación"}
            required
            autoFocus={!form.identificacion}
            value={form.identificacion}
            onChange={(e) => setForm({ ...form, identificacion: e.target.value })}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
          />
          <input
            placeholder="Razón social / Nombres"
            required
            autoFocus={!!form.identificacion}
            value={form.razonSocial}
            onChange={(e) => setForm({ ...form, razonSocial: e.target.value })}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm col-span-2"
          />
          <input
            type="email"
            placeholder="Correo electrónico"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
          />
          <input
            placeholder="Teléfono"
            value={form.telefono}
            onChange={(e) => setForm({ ...form, telefono: e.target.value })}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
          />
          <input
            placeholder="Dirección"
            value={form.direccion}
            onChange={(e) => setForm({ ...form, direccion: e.target.value })}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
          />
          <input
            placeholder="Ciudad"
            value={form.ciudad}
            onChange={(e) => setForm({ ...form, ciudad: e.target.value })}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
          />
          <select
            required
            value={form.tipoPrecioId}
            onChange={(e) => setForm({ ...form, tipoPrecioId: e.target.value })}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm col-span-2"
          >
            <option value="">Categoría de precio...</option>
            {tiposPrecio?.map((tp) => (
              <option key={tp.id} value={tp.id}>
                {tp.nombre} ({tp.porcentajeGanancia}%)
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={crearCliente.isPending}
            className="col-span-2 bg-emerald-600 text-white py-2 rounded-md text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            {crearCliente.isPending ? "Guardando..." : "Guardar y seleccionar"}
          </button>
          {crearCliente.isError && (
            <p className="col-span-2 text-red-600 dark:text-red-400 text-sm">
              {(crearCliente.error as any)?.response?.data?.error ?? "Error al guardar el cliente"}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
