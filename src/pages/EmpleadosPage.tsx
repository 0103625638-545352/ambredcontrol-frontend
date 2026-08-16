import { useState, useEffect, Fragment } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api, type Empleado, type Sucursal, type RespuestaPaginada } from "../api/client";
import { Paginacion } from "../components/Paginacion";
import { useDebounce } from "../hooks/useDebounce";
import { useConfirm } from "../components/ConfirmProvider";
import { usePermiso, useEsAdmin } from "../context/AuthContext";

const TAMANO_PAGINA = 20;

export function EmpleadosPage() {
  const queryClient = useQueryClient();
  const confirmar = useConfirm();
  const puedeEditar = usePermiso("nomina_editar");
  const esAdmin = useEsAdmin();
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const formVacio = {
    cedula: "",
    nombres: "",
    apellidos: "",
    cargo: "",
    fechaIngreso: "",
    sueldoMensual: "",
    sucursalId: "",
    cargasFamiliares: "0",
    fondoReservaMensualizado: false,
    horaEntradaEsperada: "",
    horaSalidaEsperada: "",
    // Solo un ADMIN puede crear cuentas de Usuario (ver requireAdmin en
    // index.ts) — por eso esta parte del formulario está gateada aparte de
    // "nomina_editar". Si se deja sin marcar, el empleado queda igual que
    // antes de este cambio: sin cuenta de acceso, se puede vincular una
    // después desde Usuarios.
    crearUsuario: false,
    usuario: "",
    password: "",
  };
  const [form, setForm] = useState(formVacio);
  const [pagina, setPagina] = useState(1);
  const [busqueda, setBusqueda] = useState("");
  const busquedaDebounced = useDebounce(busqueda);

  const [empleadoEditandoId, setEmpleadoEditandoId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({
    nombres: "",
    apellidos: "",
    cargo: "",
    sueldoMensual: "",
    sucursalId: "",
    cargasFamiliares: "0",
    fondoReservaMensualizado: false,
    horaEntradaEsperada: "",
    horaSalidaEsperada: "",
  });

  const [empleadoConfigurandoPinId, setEmpleadoConfigurandoPinId] = useState<number | null>(null);
  const [pinForm, setPinForm] = useState("");

  const [empleadoCreandoCuentaId, setEmpleadoCreandoCuentaId] = useState<number | null>(null);
  const cuentaFormVacio = { usuario: "", password: "", sucursalId: "" };
  const [cuentaForm, setCuentaForm] = useState(cuentaFormVacio);

  useEffect(() => {
    setPagina(1);
  }, [busquedaDebounced]);

  const { data: sucursales } = useQuery({
    queryKey: ["sucursales"],
    queryFn: async () => (await api.get<Sucursal[]>("/sucursales")).data,
  });

  const { data: respuesta, isLoading } = useQuery({
    queryKey: ["empleados", pagina, busquedaDebounced],
    queryFn: async () =>
      (
        await api.get<RespuestaPaginada<Empleado>>("/empleados", {
          params: { page: pagina, pageSize: TAMANO_PAGINA, q: busquedaDebounced || undefined },
        })
      ).data,
    placeholderData: keepPreviousData,
  });
  const empleados = respuesta?.datos;

  const crearEmpleado = useMutation({
    mutationFn: async () => {
      const respuestaEmpleado = await api.post<Empleado>("/empleados", {
        cedula: form.cedula,
        nombres: form.nombres,
        apellidos: form.apellidos,
        cargo: form.cargo,
        fechaIngreso: form.fechaIngreso,
        sueldoMensual: parseFloat(form.sueldoMensual),
        sucursalId: form.sucursalId ? Number(form.sucursalId) : undefined,
        cargasFamiliares: Number(form.cargasFamiliares),
        fondoReservaMensualizado: form.fondoReservaMensualizado,
        horaEntradaEsperada: form.horaEntradaEsperada || undefined,
        horaSalidaEsperada: form.horaSalidaEsperada || undefined,
      });
      const nuevoEmpleado = respuestaEmpleado.data;

      if (esAdmin && form.crearUsuario) {
        try {
          await api.post("/usuarios", {
            nombre: `${form.nombres} ${form.apellidos}`,
            usuario: form.usuario,
            password: form.password,
            rol: "CAJERO",
            permisos: [],
            sucursalId: form.sucursalId ? Number(form.sucursalId) : undefined,
            empleadoId: nuevoEmpleado.id,
          });
        } catch (err: any) {
          // El empleado YA quedó creado — no lo deshacemos. Se avisa aparte
          // para que el admin sepa que puede vincular la cuenta a mano desde
          // Usuarios en vez de perder lo que ya se guardó.
          throw new Error(
            `El empleado se guardó, pero no se pudo crear su cuenta de acceso: ${
              err.response?.data?.error ?? "error desconocido"
            }. Podés crearla luego desde Usuarios y vincularla ahí.`
          );
        }
      }

      return nuevoEmpleado;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["empleados"] });
      queryClient.invalidateQueries({ queryKey: ["usuarios"] });
      setForm(formVacio);
      setMostrarFormulario(false);
    },
  });

  const editarEmpleado = useMutation({
    mutationFn: async (empleadoId: number) =>
      api.put(`/empleados/${empleadoId}`, {
        ...editForm,
        sueldoMensual: parseFloat(editForm.sueldoMensual),
        sucursalId: editForm.sucursalId ? Number(editForm.sucursalId) : undefined,
        cargasFamiliares: Number(editForm.cargasFamiliares),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["empleados"] });
      setEmpleadoEditandoId(null);
    },
  });

  const desactivarEmpleado = useMutation({
    mutationFn: async (empleadoId: number) => api.patch(`/empleados/${empleadoId}/desactivar`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["empleados"] }),
  });

  const configurarPin = useMutation({
    mutationFn: async (empleadoId: number) => api.patch(`/empleados/${empleadoId}/pin`, { pin: pinForm }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["empleados"] });
      setEmpleadoConfigurandoPinId(null);
      setPinForm("");
    },
  });

  // Crea la cuenta de acceso de un empleado que YA existía antes de que esta
  // opción se agregara al formulario de creación (o al que se le canceló sin
  // querer al crearlo) — mismo POST /usuarios que usa crearEmpleado arriba,
  // pero vinculando empleadoId al empleado ya existente en vez de a uno
  // recién creado.
  const crearCuentaAcceso = useMutation({
    mutationFn: async (empleado: Empleado) =>
      api.post("/usuarios", {
        nombre: `${empleado.nombres} ${empleado.apellidos}`,
        usuario: cuentaForm.usuario,
        password: cuentaForm.password,
        rol: "CAJERO",
        permisos: [],
        sucursalId: Number(cuentaForm.sucursalId),
        empleadoId: empleado.id,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["empleados"] });
      queryClient.invalidateQueries({ queryKey: ["usuarios"] });
      setEmpleadoCreandoCuentaId(null);
      setCuentaForm(cuentaFormVacio);
    },
  });

  function abrirEdicion(e: Empleado) {
    setEditForm({
      nombres: e.nombres,
      apellidos: e.apellidos,
      cargo: e.cargo,
      sueldoMensual: e.sueldoMensual,
      sucursalId: e.sucursalId ? String(e.sucursalId) : "",
      cargasFamiliares: String(e.cargasFamiliares),
      fondoReservaMensualizado: e.fondoReservaMensualizado,
      horaEntradaEsperada: e.horaEntradaEsperada ?? "",
      horaSalidaEsperada: e.horaSalidaEsperada ?? "",
    });
    setEmpleadoEditandoId(empleadoEditandoId === e.id ? null : e.id);
  }

  function abrirConfigurarPin(e: Empleado) {
    setPinForm("");
    setEmpleadoConfigurandoPinId(empleadoConfigurandoPinId === e.id ? null : e.id);
  }

  function abrirCrearCuenta(e: Empleado) {
    setCuentaForm({ ...cuentaFormVacio, sucursalId: e.sucursalId ? String(e.sucursalId) : "" });
    setEmpleadoCreandoCuentaId(empleadoCreandoCuentaId === e.id ? null : e.id);
  }

  async function confirmarDesactivacion(e: Empleado) {
    const ok = await confirmar(`¿Marcar a ${e.nombres} ${e.apellidos} como inactivo (salida de la empresa)?`);
    if (ok) desactivarEmpleado.mutate(e.id);
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Empleados</h2>
        {puedeEditar && (
          <button
            onClick={() => setMostrarFormulario(!mostrarFormulario)}
            className="bg-slate-800 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-slate-700"
          >
            {mostrarFormulario ? "Cancelar" : "+ Nuevo empleado"}
          </button>
        )}
      </div>

      <input
        type="text"
        placeholder="Buscar por cédula, nombres o apellidos..."
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm w-full mb-4"
      />

      {mostrarFormulario && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            crearEmpleado.mutate();
          }}
          className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm mb-4 grid grid-cols-2 gap-3"
        >
          <input
            placeholder="Cédula"
            required
            value={form.cedula}
            onChange={(e) => setForm({ ...form, cedula: e.target.value })}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
          />
          <input
            placeholder="Cargo"
            required
            value={form.cargo}
            onChange={(e) => setForm({ ...form, cargo: e.target.value })}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
          />
          <input
            placeholder="Nombres"
            required
            value={form.nombres}
            onChange={(e) => setForm({ ...form, nombres: e.target.value })}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
          />
          <input
            placeholder="Apellidos"
            required
            value={form.apellidos}
            onChange={(e) => setForm({ ...form, apellidos: e.target.value })}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
          />
          <div>
            <label className="block text-[10px] text-gray-500 dark:text-gray-400">Fecha de ingreso</label>
            <input
              type="date"
              required
              value={form.fechaIngreso}
              onChange={(e) => setForm({ ...form, fechaIngreso: e.target.value })}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm w-full"
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 dark:text-gray-400">Sueldo mensual</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={form.sueldoMensual}
              onChange={(e) => setForm({ ...form, sueldoMensual: e.target.value })}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm w-full"
            />
          </div>
          <select
            required={form.crearUsuario}
            value={form.sucursalId}
            onChange={(e) => setForm({ ...form, sucursalId: e.target.value })}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
          >
            <option value="">{form.crearUsuario ? "Sucursal..." : "Sucursal (opcional)..."}</option>
            {sucursales?.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
          <div>
            <label className="block text-[10px] text-gray-500 dark:text-gray-400">Cargas familiares</label>
            <input
              type="number"
              min="0"
              value={form.cargasFamiliares}
              onChange={(e) => setForm({ ...form, cargasFamiliares: e.target.value })}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm w-full"
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 dark:text-gray-400">Hora entrada esperada (opcional)</label>
            <input
              type="time"
              value={form.horaEntradaEsperada}
              onChange={(e) => setForm({ ...form, horaEntradaEsperada: e.target.value })}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm w-full"
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 dark:text-gray-400">Hora salida esperada (opcional)</label>
            <input
              type="time"
              value={form.horaSalidaEsperada}
              onChange={(e) => setForm({ ...form, horaSalidaEsperada: e.target.value })}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm w-full"
            />
          </div>
          <label className="col-span-2 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={form.fondoReservaMensualizado}
              onChange={(e) => setForm({ ...form, fondoReservaMensualizado: e.target.checked })}
            />
            Fondo de reserva mensualizado (se paga junto al sueldo en vez de acumularse en el IESS)
          </label>

          {esAdmin && (
            <div className="col-span-2 border-t border-gray-100 dark:border-gray-700 pt-3">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={form.crearUsuario}
                  onChange={(e) => setForm({ ...form, crearUsuario: e.target.checked })}
                />
                Crear también su cuenta de acceso (para iniciar sesión y ver "Mi ruta de hoy" en Visitas Técnicas)
              </label>
              {form.crearUsuario && !form.sucursalId && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  Todo usuario necesita una sucursal fija — elegí una arriba.
                </p>
              )}
              {form.crearUsuario && (
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <input
                    placeholder="Nombre de usuario (para iniciar sesión)"
                    required
                    value={form.usuario}
                    onChange={(e) => setForm({ ...form, usuario: e.target.value })}
                    className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
                  />
                  <input
                    placeholder="Contraseña"
                    type="password"
                    required
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
                  />
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={crearEmpleado.isPending}
            className="col-span-2 bg-brand-600 text-white py-2 rounded-md text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
          >
            {crearEmpleado.isPending ? "Guardando..." : "Guardar empleado"}
          </button>
          {crearEmpleado.isError && (
            <p className="col-span-2 text-red-600 dark:text-red-400 text-sm">
              {(crearEmpleado.error as any)?.response?.data?.error ?? (crearEmpleado.error as any)?.message ?? "Error al guardar el empleado"}
            </p>
          )}
        </form>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
            <tr>
              <th className="px-4 py-2">Cédula</th>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2">Cargo</th>
              <th className="px-4 py-2 text-right">Sueldo</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2">PIN</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">Cargando...</td>
              </tr>
            )}
            {!isLoading && empleados?.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">
                  {busquedaDebounced ? `Sin resultados para "${busquedaDebounced}"` : "No hay empleados registrados"}
                </td>
              </tr>
            )}
            {empleados?.map((e) => (
              <Fragment key={e.id}>
                <tr className="border-t border-gray-100 dark:border-gray-700">
                  <td className="px-4 py-2 font-mono text-xs">{e.cedula}</td>
                  <td className="px-4 py-2">
                    {e.nombres} {e.apellidos}
                    {e.usuario && (
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">Cuenta: {e.usuario.usuario}</p>
                    )}
                  </td>
                  <td className="px-4 py-2">{e.cargo}</td>
                  <td className="px-4 py-2 text-right">${e.sueldoMensual}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${e.activo ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"}`}>
                      {e.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${e.tienePin ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" : "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"}`}>
                      {e.tienePin ? "Configurado" : "Sin PIN"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right space-x-3">
                    {puedeEditar && (
                      <>
                        <button
                          onClick={() => abrirEdicion(e)}
                          className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium"
                        >
                          {empleadoEditandoId === e.id ? "Cancelar" : "Editar"}
                        </button>
                        <button
                          onClick={() => abrirConfigurarPin(e)}
                          className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium"
                        >
                          {empleadoConfigurandoPinId === e.id ? "Cancelar" : e.tienePin ? "Cambiar PIN" : "Configurar PIN"}
                        </button>
                        {esAdmin && !e.usuario && (
                          <button
                            onClick={() => abrirCrearCuenta(e)}
                            className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium"
                          >
                            {empleadoCreandoCuentaId === e.id ? "Cancelar" : "Crear cuenta de acceso"}
                          </button>
                        )}
                        {e.activo && (
                          <button
                            onClick={() => confirmarDesactivacion(e)}
                            className="text-red-600 dark:text-red-400 hover:underline text-xs font-medium"
                          >
                            Desactivar
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>

                {empleadoConfigurandoPinId === e.id && (
                  <tr className="bg-slate-50 dark:bg-gray-700/40">
                    <td colSpan={7} className="px-4 py-3">
                      <form
                        onSubmit={(ev) => {
                          ev.preventDefault();
                          configurarPin.mutate(e.id);
                        }}
                        className="flex items-end gap-2"
                      >
                        <div>
                          <label className="block text-[10px] text-gray-500 dark:text-gray-400">PIN (4-6 dígitos)</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            autoFocus
                            required
                            value={pinForm}
                            onChange={(ev) => setPinForm(ev.target.value.replace(/\D/g, "").slice(0, 6))}
                            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1.5 text-sm w-28 tracking-widest"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={configurarPin.isPending || !/^\d{4,6}$/.test(pinForm)}
                          className="bg-slate-800 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
                        >
                          {configurarPin.isPending ? "Guardando..." : "Guardar PIN"}
                        </button>
                        {configurarPin.isError && (
                          <p className="text-red-600 dark:text-red-400 text-xs">
                            {(configurarPin.error as any)?.response?.data?.error ?? "Error al configurar el PIN"}
                          </p>
                        )}
                      </form>
                    </td>
                  </tr>
                )}

                {empleadoCreandoCuentaId === e.id && (
                  <tr className="bg-slate-50 dark:bg-gray-700/40">
                    <td colSpan={7} className="px-4 py-3">
                      <form
                        onSubmit={(ev) => {
                          ev.preventDefault();
                          crearCuentaAcceso.mutate(e);
                        }}
                        className="grid grid-cols-3 gap-2 items-end"
                      >
                        <div>
                          <label className="block text-[10px] text-gray-500 dark:text-gray-400">Nombre de usuario</label>
                          <input
                            type="text"
                            autoFocus
                            required
                            value={cuentaForm.usuario}
                            onChange={(ev) => setCuentaForm({ ...cuentaForm, usuario: ev.target.value })}
                            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1.5 text-sm w-full"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-gray-500 dark:text-gray-400">Contraseña</label>
                          <input
                            type="password"
                            required
                            value={cuentaForm.password}
                            onChange={(ev) => setCuentaForm({ ...cuentaForm, password: ev.target.value })}
                            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1.5 text-sm w-full"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-gray-500 dark:text-gray-400">Sucursal</label>
                          <select
                            required
                            value={cuentaForm.sucursalId}
                            onChange={(ev) => setCuentaForm({ ...cuentaForm, sucursalId: ev.target.value })}
                            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1.5 text-sm w-full"
                          >
                            <option value="">Sucursal...</option>
                            {sucursales?.map((s) => (
                              <option key={s.id} value={s.id}>{s.nombre}</option>
                            ))}
                          </select>
                        </div>
                        <button
                          type="submit"
                          disabled={crearCuentaAcceso.isPending}
                          className="col-span-3 bg-slate-800 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
                        >
                          {crearCuentaAcceso.isPending ? "Creando..." : "Crear cuenta"}
                        </button>
                        {crearCuentaAcceso.isError && (
                          <p className="col-span-3 text-red-600 dark:text-red-400 text-xs">
                            {(crearCuentaAcceso.error as any)?.response?.data?.error ?? "Error al crear la cuenta de acceso"}
                          </p>
                        )}
                      </form>
                    </td>
                  </tr>
                )}

                {empleadoEditandoId === e.id && (
                  <tr className="bg-slate-50 dark:bg-gray-700/40">
                    <td colSpan={7} className="px-4 py-3">
                      <form
                        onSubmit={(ev) => {
                          ev.preventDefault();
                          editarEmpleado.mutate(e.id);
                        }}
                        className="grid grid-cols-2 gap-2"
                      >
                        <input
                          placeholder="Nombres"
                          required
                          autoFocus
                          value={editForm.nombres}
                          onChange={(ev) => setEditForm({ ...editForm, nombres: ev.target.value })}
                          className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1.5 text-sm"
                        />
                        <input
                          placeholder="Apellidos"
                          required
                          value={editForm.apellidos}
                          onChange={(ev) => setEditForm({ ...editForm, apellidos: ev.target.value })}
                          className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1.5 text-sm"
                        />
                        <input
                          placeholder="Cargo"
                          required
                          value={editForm.cargo}
                          onChange={(ev) => setEditForm({ ...editForm, cargo: ev.target.value })}
                          className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1.5 text-sm"
                        />
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          placeholder="Sueldo mensual"
                          required
                          value={editForm.sueldoMensual}
                          onChange={(ev) => setEditForm({ ...editForm, sueldoMensual: ev.target.value })}
                          className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1.5 text-sm"
                        />
                        <select
                          value={editForm.sucursalId}
                          onChange={(ev) => setEditForm({ ...editForm, sucursalId: ev.target.value })}
                          className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1.5 text-sm"
                        >
                          <option value="">Sucursal (opcional)...</option>
                          {sucursales?.map((s) => (
                            <option key={s.id} value={s.id}>{s.nombre}</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min="0"
                          placeholder="Cargas familiares"
                          value={editForm.cargasFamiliares}
                          onChange={(ev) => setEditForm({ ...editForm, cargasFamiliares: ev.target.value })}
                          className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1.5 text-sm"
                        />
                        <div>
                          <label className="block text-[10px] text-gray-500 dark:text-gray-400">Hora entrada esperada</label>
                          <input
                            type="time"
                            value={editForm.horaEntradaEsperada}
                            onChange={(ev) => setEditForm({ ...editForm, horaEntradaEsperada: ev.target.value })}
                            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1.5 text-sm w-full"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-gray-500 dark:text-gray-400">Hora salida esperada</label>
                          <input
                            type="time"
                            value={editForm.horaSalidaEsperada}
                            onChange={(ev) => setEditForm({ ...editForm, horaSalidaEsperada: ev.target.value })}
                            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1.5 text-sm w-full"
                          />
                        </div>
                        <label className="col-span-2 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                          <input
                            type="checkbox"
                            checked={editForm.fondoReservaMensualizado}
                            onChange={(ev) => setEditForm({ ...editForm, fondoReservaMensualizado: ev.target.checked })}
                          />
                          Fondo de reserva mensualizado
                        </label>
                        <div className="col-span-2 flex gap-2">
                          <button
                            type="submit"
                            disabled={editarEmpleado.isPending}
                            className="flex-1 bg-slate-800 text-white py-1.5 rounded-md text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
                          >
                            {editarEmpleado.isPending ? "Guardando..." : "Guardar cambios"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEmpleadoEditandoId(null)}
                            className="flex-1 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 py-1.5 rounded-md text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-500"
                          >
                            Cancelar
                          </button>
                        </div>
                        {editarEmpleado.isError && (
                          <p className="col-span-2 text-red-600 dark:text-red-400 text-xs">
                            {(editarEmpleado.error as any)?.response?.data?.error ?? "Error al guardar los cambios"}
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
    </div>
  );
}
