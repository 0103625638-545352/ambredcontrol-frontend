import { useState, useEffect, Fragment } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api, type Proveedor, type RespuestaPaginada } from "../api/client";
import { Paginacion } from "../components/Paginacion";
import { HistorialProveedorModal } from "../components/HistorialProveedorModal";
import { useDebounce } from "../hooks/useDebounce";

const TAMANO_PAGINA = 20;

export function ProveedoresPage() {
  const queryClient = useQueryClient();
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const formVacio = {
    tipoIdentificacion: "RUC",
    identificacion: "",
    razonSocial: "",
    email: "",
    telefono: "",
    direccion: "",
  };
  const [form, setForm] = useState(formVacio);
  const [pagina, setPagina] = useState(1);
  const [busqueda, setBusqueda] = useState("");
  const busquedaDebounced = useDebounce(busqueda);

  const [proveedorEditandoId, setProveedorEditandoId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ razonSocial: "", email: "", telefono: "", direccion: "" });

  // Controla para cuál proveedor se está mostrando el modal de historial
  const [proveedorHistorialId, setProveedorHistorialId] = useState<number | null>(null);

  useEffect(() => {
    setPagina(1);
  }, [busquedaDebounced]);

  const { data: respuesta, isLoading } = useQuery({
    queryKey: ["proveedores", pagina, busquedaDebounced],
    queryFn: async () =>
      (
        await api.get<RespuestaPaginada<Proveedor>>("/proveedores", {
          params: { page: pagina, pageSize: TAMANO_PAGINA, q: busquedaDebounced || undefined },
        })
      ).data,
    placeholderData: keepPreviousData,
  });
  const proveedores = respuesta?.datos;

  const crearProveedor = useMutation({
    mutationFn: async () => api.post("/proveedores", form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proveedores"] });
      setForm(formVacio);
      setMostrarFormulario(false);
    },
  });

  const editarProveedor = useMutation({
    mutationFn: async (proveedorId: number) => api.put(`/proveedores/${proveedorId}`, editForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proveedores"] });
      setProveedorEditandoId(null);
    },
  });

  function abrirEdicion(p: Proveedor) {
    setEditForm({
      razonSocial: p.razonSocial,
      email: p.email ?? "",
      telefono: p.telefono ?? "",
      direccion: p.direccion ?? "",
    });
    setProveedorEditandoId(proveedorEditandoId === p.id ? null : p.id);
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Proveedores</h2>
        <button
          onClick={() => setMostrarFormulario(!mostrarFormulario)}
          className="bg-slate-800 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-slate-700"
        >
          {mostrarFormulario ? "Cancelar" : "+ Nuevo proveedor"}
        </button>
      </div>

      <input
        type="text"
        placeholder="Buscar por identificación o razón social..."
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm w-full mb-4"
      />

      {mostrarFormulario && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            crearProveedor.mutate();
          }}
          className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm mb-4 grid grid-cols-2 gap-3"
        >
          <select
            value={form.tipoIdentificacion}
            onChange={(e) => setForm({ ...form, tipoIdentificacion: e.target.value })}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
          >
            <option value="RUC">RUC</option>
            <option value="CEDULA">Cédula</option>
            <option value="PASAPORTE">Pasaporte</option>
          </select>
          <input
            placeholder={form.tipoIdentificacion === "RUC" ? "RUC (13 dígitos)" : "Identificación"}
            required
            value={form.identificacion}
            onChange={(e) => setForm({ ...form, identificacion: e.target.value })}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
          />
          <input
            placeholder="Razón social / Nombres"
            required
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
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm col-span-2"
          />
          <button
            type="submit"
            disabled={crearProveedor.isPending}
            className="col-span-2 bg-brand-600 text-white py-2 rounded-md text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
          >
            {crearProveedor.isPending ? "Guardando..." : "Guardar proveedor"}
          </button>
          {crearProveedor.isError && (
            <p className="col-span-2 text-red-600 dark:text-red-400 text-sm">
              {(crearProveedor.error as any)?.response?.data?.error ?? "Error al guardar el proveedor"}
            </p>
          )}
        </form>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
            <tr>
              <th className="px-4 py-2">Identificación</th>
              <th className="px-4 py-2">Razón Social</th>
              <th className="px-4 py-2">Correo</th>
              <th className="px-4 py-2">Teléfono</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">Cargando...</td>
              </tr>
            )}
            {!isLoading && proveedores?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">
                  {busquedaDebounced ? `Sin resultados para "${busquedaDebounced}"` : "No hay proveedores"}
                </td>
              </tr>
            )}
            {proveedores?.map((p) => (
              <Fragment key={p.id}>
                <tr className="border-t border-gray-100 dark:border-gray-700">
                  <td className="px-4 py-2">{p.identificacion}</td>
                  <td className="px-4 py-2">{p.razonSocial}</td>
                  <td className="px-4 py-2 text-gray-600 dark:text-gray-300">
                    {p.email ?? <span className="text-gray-300 dark:text-gray-600 italic">sin correo</span>}
                  </td>
                  <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{p.telefono ?? "—"}</td>
                  <td className="px-4 py-2 text-right space-x-3">
                    <button
                      onClick={() => setProveedorHistorialId(p.id)}
                      className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium"
                    >
                      Historial
                    </button>
                    <button
                      onClick={() => abrirEdicion(p)}
                      className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium"
                    >
                      {proveedorEditandoId === p.id ? "Cancelar" : "Editar"}
                    </button>
                  </td>
                </tr>

                {proveedorEditandoId === p.id && (
                  <tr className="bg-slate-50 dark:bg-gray-700/40">
                    <td colSpan={5} className="px-4 py-3">
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          editarProveedor.mutate(p.id);
                        }}
                        className="grid grid-cols-2 gap-2"
                      >
                        <input
                          placeholder="Razón social / Nombres"
                          required
                          autoFocus
                          value={editForm.razonSocial}
                          onChange={(e) => setEditForm({ ...editForm, razonSocial: e.target.value })}
                          className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1.5 text-sm col-span-2"
                        />
                        <input
                          type="email"
                          placeholder="Correo electrónico"
                          value={editForm.email}
                          onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                          className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1.5 text-sm"
                        />
                        <input
                          placeholder="Teléfono"
                          value={editForm.telefono}
                          onChange={(e) => setEditForm({ ...editForm, telefono: e.target.value })}
                          className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1.5 text-sm"
                        />
                        <input
                          placeholder="Dirección"
                          value={editForm.direccion}
                          onChange={(e) => setEditForm({ ...editForm, direccion: e.target.value })}
                          className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1.5 text-sm col-span-2"
                        />
                        <div className="col-span-2 flex gap-2">
                          <button
                            type="submit"
                            disabled={editarProveedor.isPending}
                            className="flex-1 bg-slate-800 text-white py-1.5 rounded-md text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
                          >
                            {editarProveedor.isPending ? "Guardando..." : "Guardar cambios"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setProveedorEditandoId(null)}
                            className="flex-1 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 py-1.5 rounded-md text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-500"
                          >
                            Cancelar
                          </button>
                        </div>
                        {editarProveedor.isError && (
                          <p className="col-span-2 text-red-600 dark:text-red-400 text-xs">
                            {(editarProveedor.error as any)?.response?.data?.error ?? "Error al guardar los cambios"}
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
        {respuesta && (
          <Paginacion
            page={respuesta.paginacion.page}
            totalPaginas={respuesta.paginacion.totalPaginas}
            total={respuesta.paginacion.total}
            onCambiarPagina={setPagina}
          />
        )}
      </div>

      {proveedorHistorialId !== null && (
        <HistorialProveedorModal
          proveedorId={proveedorHistorialId}
          nombreProveedor={proveedores?.find((p) => p.id === proveedorHistorialId)?.razonSocial ?? ""}
          onCerrar={() => setProveedorHistorialId(null)}
        />
      )}
    </div>
  );
}
