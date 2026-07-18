import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api, type RespuestaPaginada, type Sucursal, type Bodega, type PuntoDeVenta, type Empleado, type UsuarioAdmin as Usuario } from "../api/client";
import { Paginacion } from "../components/Paginacion";
import { Modal } from "../components/Modal";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmProvider";
import { useDebounce } from "../hooks/useDebounce";
import { PERMISOS } from "../constants/permisos";

const TAMANO_PAGINA = 20;

// Agrupa el catálogo plano de PERMISOS por su "categoria" (ver
// constants/permisos.ts), preservando el orden en que aparecen — mismo orden
// que los grupos del menú lateral. Se calcula una sola vez a nivel de
// módulo, no en cada render, porque PERMISOS es una constante fija.
const PERMISOS_POR_CATEGORIA: { categoria: string; permisos: (typeof PERMISOS)[number][] }[] = (() => {
  const grupos: { categoria: string; permisos: (typeof PERMISOS)[number][] }[] = [];
  for (const p of PERMISOS) {
    let grupo = grupos.find((g) => g.categoria === p.categoria);
    if (!grupo) {
      grupo = { categoria: p.categoria, permisos: [] };
      grupos.push(grupo);
    }
    grupo.permisos.push(p);
  }
  return grupos;
})();

// Casillas del catálogo de permisos, compartidas entre el formulario de
// creación y el modal de edición. Agrupadas por categoría (mismo criterio
// que el menú lateral) para que sea más fácil ubicar qué pantalla destraba
// cada una — antes era una sola grilla plana de ~19 casillas. Deshabilitadas
// (y con una nota) cuando el rol elegido es ADMIN, porque un administrador
// ya tiene acceso a todo sin importar qué esté marcado acá.
function CasillasPermisos({
  permisos,
  onCambiar,
  esAdmin,
}: {
  permisos: string[];
  onCambiar: (permisos: string[]) => void;
  esAdmin: boolean;
}) {
  function alternar(clave: string) {
    onCambiar(permisos.includes(clave) ? permisos.filter((p) => p !== clave) : [...permisos, clave]);
  }

  return (
    <div className="col-span-2">
      <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">
        Permisos {esAdmin && <span className="text-gray-400 dark:text-gray-500">(un administrador ya tiene acceso a todo)</span>}
      </p>
      <div className={`space-y-1.5 ${esAdmin ? "opacity-50" : ""}`}>
        {PERMISOS_POR_CATEGORIA.map((grupo) => (
          <div key={grupo.categoria}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {grupo.categoria}
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
              {grupo.permisos.map((p) => (
                <label key={p.clave} className="flex items-start gap-2 text-sm py-0.5" title={p.descripcion}>
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    disabled={esAdmin}
                    checked={esAdmin || permisos.includes(p.clave)}
                    onChange={() => alternar(p.clave)}
                  />
                  <span className="text-gray-700 dark:text-gray-300">{p.etiqueta}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Gestión de las sucursales (locales físicos) de la empresa — vive acá
// porque es un trabajo admin que se hace en la misma sesión que asignar
// usuarios a un local, y esta página ya está gateada por esAdmin de punta a
// punta (a diferencia de Ajustes, gateada por el permiso delegable
// "configuracion").
function TarjetaSucursales() {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [form, setForm] = useState({ nombre: "", direccion: "" });
  const [sucursalEditando, setSucursalEditando] = useState<Sucursal | null>(null);
  const [formEdicion, setFormEdicion] = useState({ nombre: "", direccion: "" });

  const { data: sucursales, isLoading } = useQuery({
    queryKey: ["sucursales"],
    queryFn: async () => (await api.get<Sucursal[]>("/sucursales")).data,
  });

  const crearSucursal = useMutation({
    mutationFn: async () => api.post("/sucursales", form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sucursales"] });
      setForm({ nombre: "", direccion: "" });
      setMostrarFormulario(false);
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al crear la sucursal"),
  });

  const editarSucursal = useMutation({
    mutationFn: async () => api.put(`/sucursales/${sucursalEditando!.id}`, formEdicion),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sucursales"] });
      mostrarToast("Sucursal actualizada", "success");
      setSucursalEditando(null);
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al editar la sucursal"),
  });

  function abrirEdicion(s: Sucursal) {
    setFormEdicion({ nombre: s.nombre, direccion: s.direccion ?? "" });
    setSucursalEditando(s);
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 mb-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Sucursales</h3>
        <button
          onClick={() => setMostrarFormulario(!mostrarFormulario)}
          className="text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline"
        >
          {mostrarFormulario ? "Cancelar" : "+ Nueva sucursal"}
        </button>
      </div>

      {mostrarFormulario && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            crearSucursal.mutate();
          }}
          className="grid grid-cols-2 gap-2 mb-3"
        >
          <input
            placeholder="Nombre (ej. Local 1)"
            required
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-1.5 text-sm"
          />
          <input
            placeholder="Dirección (opcional)"
            value={form.direccion}
            onChange={(e) => setForm({ ...form, direccion: e.target.value })}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={crearSucursal.isPending}
            className="col-span-2 bg-emerald-600 text-white py-1.5 rounded-md text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            {crearSucursal.isPending ? "Guardando..." : "Crear sucursal"}
          </button>
        </form>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {sucursales?.map((s) => (
            <li key={s.id} className="py-2 flex justify-between items-center text-sm">
              <div>
                <span className="text-gray-800 dark:text-gray-100">{s.nombre}</span>
                {s.direccion && <span className="text-gray-400 dark:text-gray-500 ml-2 text-xs">{s.direccion}</span>}
              </div>
              <button
                onClick={() => abrirEdicion(s)}
                className="text-sky-600 dark:text-sky-400 hover:underline text-xs font-medium"
              >
                Editar
              </button>
            </li>
          ))}
        </ul>
      )}

      {sucursalEditando && (
        <Modal titulo={`Editar ${sucursalEditando.nombre}`} onCerrar={() => setSucursalEditando(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              editarSucursal.mutate();
            }}
            className="space-y-3"
          >
            <input
              placeholder="Nombre"
              required
              value={formEdicion.nombre}
              onChange={(e) => setFormEdicion({ ...formEdicion, nombre: e.target.value })}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
            />
            <input
              placeholder="Dirección (opcional)"
              value={formEdicion.direccion}
              onChange={(e) => setFormEdicion({ ...formEdicion, direccion: e.target.value })}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={editarSucursal.isPending}
              className="w-full bg-emerald-600 text-white py-2 rounded-md text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
            >
              {editarSucursal.isPending ? "Guardando..." : "Guardar cambios"}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

// Gestión de bodegas (subdivisión de stock DENTRO de una sucursal) — mismo
// criterio y mismo lugar que TarjetaSucursales, ya que crear una bodega
// necesita elegir a qué sucursal pertenece. A diferencia de sucursal, acá
// desactivar SÍ puede fallar (409) si es la última bodega activa de su
// sucursal — toda sucursal debe quedar con al menos una.
function TarjetaBodegas() {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const confirmar = useConfirm();
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [form, setForm] = useState({ nombre: "", sucursalId: "" });
  const [bodegaEditando, setBodegaEditando] = useState<Bodega | null>(null);
  const [formEdicion, setFormEdicion] = useState({ nombre: "" });

  const { data: sucursales } = useQuery({
    queryKey: ["sucursales"],
    queryFn: async () => (await api.get<Sucursal[]>("/sucursales")).data,
  });

  const { data: bodegas, isLoading } = useQuery({
    queryKey: ["bodegas"],
    queryFn: async () => (await api.get<Bodega[]>("/bodegas")).data,
  });

  const crearBodega = useMutation({
    mutationFn: async () => api.post("/bodegas", { nombre: form.nombre, sucursalId: Number(form.sucursalId) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bodegas"] });
      setForm({ nombre: "", sucursalId: "" });
      setMostrarFormulario(false);
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al crear la bodega"),
  });

  const editarBodega = useMutation({
    mutationFn: async () => api.put(`/bodegas/${bodegaEditando!.id}`, formEdicion),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bodegas"] });
      mostrarToast("Bodega actualizada", "success");
      setBodegaEditando(null);
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al editar la bodega"),
  });

  const desactivarBodega = useMutation({
    mutationFn: async (id: number) => api.patch(`/bodegas/${id}/desactivar`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bodegas"] });
      mostrarToast("Bodega desactivada", "success");
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al desactivar la bodega"),
  });

  function abrirEdicion(b: Bodega) {
    setFormEdicion({ nombre: b.nombre });
    setBodegaEditando(b);
  }

  function nombreSucursal(sucursalId: number): string {
    return sucursales?.find((s) => s.id === sucursalId)?.nombre ?? `Sucursal #${sucursalId}`;
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 mb-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Bodegas</h3>
        <button
          onClick={() => setMostrarFormulario(!mostrarFormulario)}
          className="text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline"
        >
          {mostrarFormulario ? "Cancelar" : "+ Nueva bodega"}
        </button>
      </div>

      {mostrarFormulario && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            crearBodega.mutate();
          }}
          className="grid grid-cols-2 gap-2 mb-3"
        >
          <input
            placeholder="Nombre (ej. Electrónicos)"
            required
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-1.5 text-sm"
          />
          <select
            required
            value={form.sucursalId}
            onChange={(e) => setForm({ ...form, sucursalId: e.target.value })}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-1.5 text-sm"
          >
            <option value="">Sucursal...</option>
            {sucursales?.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={crearBodega.isPending}
            className="col-span-2 bg-emerald-600 text-white py-1.5 rounded-md text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            {crearBodega.isPending ? "Guardando..." : "Crear bodega"}
          </button>
        </form>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {bodegas?.map((b) => (
            <li key={b.id} className="py-2 flex justify-between items-center text-sm">
              <div>
                <span className="text-gray-800 dark:text-gray-100">{b.nombre}</span>
                <span className="text-gray-400 dark:text-gray-500 ml-2 text-xs">{nombreSucursal(b.sucursalId)}</span>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => abrirEdicion(b)}
                  className="text-sky-600 dark:text-sky-400 hover:underline text-xs font-medium"
                >
                  Editar
                </button>
                <button
                  onClick={async () => {
                    if (await confirmar(`¿Desactivar "${b.nombre}"?`)) {
                      desactivarBodega.mutate(b.id);
                    }
                  }}
                  className="text-red-600 dark:text-red-400 hover:underline text-xs font-medium"
                >
                  Desactivar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {bodegaEditando && (
        <Modal titulo={`Editar ${bodegaEditando.nombre}`} onCerrar={() => setBodegaEditando(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              editarBodega.mutate();
            }}
            className="space-y-3"
          >
            <input
              placeholder="Nombre"
              required
              value={formEdicion.nombre}
              onChange={(e) => setFormEdicion({ nombre: e.target.value })}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={editarBodega.isPending}
              className="w-full bg-emerald-600 text-white py-2 rounded-md text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
            >
              {editarBodega.isPending ? "Guardando..." : "Guardar cambios"}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

// Gestión de puntos de venta (cajas registradoras DENTRO de una sucursal) —
// mismo mirror que TarjetaBodegas, pero SIN el candado de "no desactivar el
// último activo": un punto de venta es opcional, una sucursal puede quedar
// válidamente con cero (sigue funcionando con una sola caja compartida).
function TarjetaPuntosVenta() {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const confirmar = useConfirm();
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [form, setForm] = useState({ nombre: "", sucursalId: "" });
  const [puntoVentaEditando, setPuntoVentaEditando] = useState<PuntoDeVenta | null>(null);
  const [formEdicion, setFormEdicion] = useState({ nombre: "" });

  const { data: sucursales } = useQuery({
    queryKey: ["sucursales"],
    queryFn: async () => (await api.get<Sucursal[]>("/sucursales")).data,
  });

  const { data: puntosVenta, isLoading } = useQuery({
    queryKey: ["puntos-venta"],
    queryFn: async () => (await api.get<PuntoDeVenta[]>("/puntos-venta")).data,
  });

  const crearPuntoVenta = useMutation({
    mutationFn: async () => api.post("/puntos-venta", { nombre: form.nombre, sucursalId: Number(form.sucursalId) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["puntos-venta"] });
      setForm({ nombre: "", sucursalId: "" });
      setMostrarFormulario(false);
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al crear el punto de venta"),
  });

  const editarPuntoVenta = useMutation({
    mutationFn: async () => api.put(`/puntos-venta/${puntoVentaEditando!.id}`, formEdicion),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["puntos-venta"] });
      mostrarToast("Punto de venta actualizado", "success");
      setPuntoVentaEditando(null);
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al editar el punto de venta"),
  });

  const desactivarPuntoVenta = useMutation({
    mutationFn: async (id: number) => api.patch(`/puntos-venta/${id}/desactivar`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["puntos-venta"] });
      mostrarToast("Punto de venta desactivado", "success");
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al desactivar el punto de venta"),
  });

  function abrirEdicion(p: PuntoDeVenta) {
    setFormEdicion({ nombre: p.nombre });
    setPuntoVentaEditando(p);
  }

  function nombreSucursal(sucursalId: number): string {
    return sucursales?.find((s) => s.id === sucursalId)?.nombre ?? `Sucursal #${sucursalId}`;
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 mb-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Puntos de venta</h3>
        <button
          onClick={() => setMostrarFormulario(!mostrarFormulario)}
          className="text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline"
        >
          {mostrarFormulario ? "Cancelar" : "+ Nuevo punto de venta"}
        </button>
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
        Opcional: solo hace falta si una sucursal tiene varias cajas registradoras físicas (ej. varios
        mostradores de cobro) que necesitan arqueos independientes. Sin ninguno, la caja sigue siendo una sola
        por sucursal, como siempre.
      </p>

      {mostrarFormulario && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            crearPuntoVenta.mutate();
          }}
          className="grid grid-cols-2 gap-2 mb-3"
        >
          <input
            placeholder="Nombre (ej. Caja 1)"
            required
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-1.5 text-sm"
          />
          <select
            required
            value={form.sucursalId}
            onChange={(e) => setForm({ ...form, sucursalId: e.target.value })}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-1.5 text-sm"
          >
            <option value="">Sucursal...</option>
            {sucursales?.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={crearPuntoVenta.isPending}
            className="col-span-2 bg-emerald-600 text-white py-1.5 rounded-md text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            {crearPuntoVenta.isPending ? "Guardando..." : "Crear punto de venta"}
          </button>
        </form>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>
      ) : puntosVenta?.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">Ninguna sucursal usa puntos de venta todavía.</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {puntosVenta?.map((p) => (
            <li key={p.id} className="py-2 flex justify-between items-center text-sm">
              <div>
                <span className="text-gray-800 dark:text-gray-100">{p.nombre}</span>
                <span className="text-gray-400 dark:text-gray-500 ml-2 text-xs">{nombreSucursal(p.sucursalId)}</span>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => abrirEdicion(p)}
                  className="text-sky-600 dark:text-sky-400 hover:underline text-xs font-medium"
                >
                  Editar
                </button>
                <button
                  onClick={async () => {
                    if (await confirmar(`¿Desactivar "${p.nombre}"?`)) {
                      desactivarPuntoVenta.mutate(p.id);
                    }
                  }}
                  className="text-red-600 dark:text-red-400 hover:underline text-xs font-medium"
                >
                  Desactivar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {puntoVentaEditando && (
        <Modal titulo={`Editar ${puntoVentaEditando.nombre}`} onCerrar={() => setPuntoVentaEditando(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              editarPuntoVenta.mutate();
            }}
            className="space-y-3"
          >
            <input
              placeholder="Nombre"
              required
              value={formEdicion.nombre}
              onChange={(e) => setFormEdicion({ nombre: e.target.value })}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={editarPuntoVenta.isPending}
              className="w-full bg-emerald-600 text-white py-2 rounded-md text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
            >
              {editarPuntoVenta.isPending ? "Guardando..." : "Guardar cambios"}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

export function UsuariosPage() {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const confirmar = useConfirm();
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [form, setForm] = useState({ nombre: "", usuario: "", password: "", email: "", rol: "CAJERO", permisos: [] as string[], sucursalId: "", empleadoId: "" });
  const [pagina, setPagina] = useState(1);
  const [busqueda, setBusqueda] = useState("");
  const busquedaDebounced = useDebounce(busqueda);
  const [usuarioEditando, setUsuarioEditando] = useState<Usuario | null>(null);
  const [formEdicion, setFormEdicion] = useState({ nombre: "", email: "", rol: "CAJERO", permisos: [] as string[], sucursalId: "", empleadoId: "" });
  const [passwordTemporal, setPasswordTemporal] = useState<{ nombre: string; password: string } | null>(null);

  useEffect(() => {
    setPagina(1);
  }, [busquedaDebounced]);

  const { data: sucursales } = useQuery({
    queryKey: ["sucursales"],
    queryFn: async () => (await api.get<Sucursal[]>("/sucursales")).data,
  });

  // Para el selector "Empleado vinculado" (módulo de Visitas Técnicas) —
  // sin "?page=" trae todos los activos, mismo criterio que NominaPage. El
  // backend es quien realmente impide vincular un Empleado ya vinculado a
  // otro Usuario (ver empleadoInvalido en routes/usuarios.ts); acá solo se
  // listan para elegir, sin filtrar por adelantado.
  const { data: empleados } = useQuery({
    queryKey: ["empleados-activos"],
    queryFn: async () => (await api.get<Empleado[]>("/empleados")).data.filter((e) => e.activo),
  });

  const { data: respuesta, isLoading } = useQuery({
    queryKey: ["usuarios", pagina, busquedaDebounced],
    queryFn: async () =>
      (
        await api.get<RespuestaPaginada<Usuario>>("/usuarios", {
          params: { page: pagina, pageSize: TAMANO_PAGINA, q: busquedaDebounced || undefined },
        })
      ).data,
    placeholderData: keepPreviousData,
  });
  const usuarios = respuesta?.datos;

  const crearUsuario = useMutation({
    mutationFn: async () =>
      api.post("/usuarios", {
        ...form,
        email: form.email || null,
        sucursalId: Number(form.sucursalId),
        empleadoId: form.empleadoId ? Number(form.empleadoId) : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["usuarios"] });
      setForm({ nombre: "", usuario: "", password: "", email: "", rol: "CAJERO", permisos: [], sucursalId: "", empleadoId: "" });
      setMostrarFormulario(false);
    },
  });

  const desactivarUsuario = useMutation({
    mutationFn: async (id: number) => api.patch(`/usuarios/${id}/desactivar`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["usuarios"] }),
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al desactivar"),
  });

  const editarUsuario = useMutation({
    mutationFn: async () =>
      api.put(`/usuarios/${usuarioEditando!.id}`, {
        ...formEdicion,
        email: formEdicion.email || null,
        sucursalId: Number(formEdicion.sucursalId),
        empleadoId: formEdicion.empleadoId ? Number(formEdicion.empleadoId) : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["usuarios"] });
      mostrarToast("Usuario actualizado", "success");
      setUsuarioEditando(null);
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al editar"),
  });

  const resetearPassword = useMutation({
    mutationFn: async (id: number) => (await api.patch<{ passwordTemporal: string }>(`/usuarios/${id}/resetear-password`)).data,
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al resetear la contraseña"),
  });

  async function confirmarDesactivar(u: Usuario) {
    const ok = await confirmar(`¿Desactivar a ${u.nombre}? Ya no podrá iniciar sesión.`);
    if (ok) desactivarUsuario.mutate(u.id);
  }

  async function confirmarResetearPassword(u: Usuario) {
    const ok = await confirmar(
      `¿Resetear la contraseña de ${u.nombre}? Se le asignará una temporal y tendrá que cambiarla al entrar.`
    );
    if (!ok) return;
    const resultado = await resetearPassword.mutateAsync(u.id);
    setPasswordTemporal({ nombre: u.nombre, password: resultado.passwordTemporal });
  }

  function abrirEdicion(u: Usuario) {
    setFormEdicion({
      nombre: u.nombre,
      email: u.email ?? "",
      rol: u.rol,
      permisos: u.permisos,
      sucursalId: u.sucursalId ? String(u.sucursalId) : "",
      empleadoId: u.empleadoId ? String(u.empleadoId) : "",
    });
    setUsuarioEditando(u);
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Usuarios</h2>

      <TarjetaSucursales />
      <TarjetaBodegas />
      <TarjetaPuntosVenta />

      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Cuentas de usuario</h3>
        <button
          onClick={() => setMostrarFormulario(!mostrarFormulario)}
          className="bg-slate-800 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-slate-700"
        >
          {mostrarFormulario ? "Cancelar" : "+ Nuevo usuario"}
        </button>
      </div>

      <input
        type="text"
        placeholder="Buscar por nombre o usuario..."
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm w-full mb-4"
      />

      {mostrarFormulario && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            crearUsuario.mutate();
          }}
          className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm mb-4 grid grid-cols-2 gap-3"
        >
          <input
            placeholder="Nombre completo"
            required
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
          />
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
          <input
            placeholder="Correo (opcional, para recuperar la contraseña)"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="col-span-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
          />
          <select
            value={form.rol}
            onChange={(e) => setForm({ ...form, rol: e.target.value })}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
          >
            <option value="CAJERO">Personalizado (elige los permisos abajo)</option>
            <option value="ADMIN">Administrador (acceso total)</option>
          </select>
          <select
            required
            value={form.sucursalId}
            onChange={(e) => setForm({ ...form, sucursalId: e.target.value })}
            className="col-span-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
          >
            <option value="" disabled>Sucursal donde trabaja...</option>
            {sucursales?.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
          <div className="col-span-2">
            <select
              value={form.empleadoId}
              onChange={(e) => setForm({ ...form, empleadoId: e.target.value })}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
            >
              <option value="">Sin vincular a un empleado técnico</option>
              {empleados?.map((e) => (
                <option key={e.id} value={e.id}>{e.nombres} {e.apellidos}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Opcional: si esta cuenta es de un técnico de campo, vincularla a su Empleado le permite ver "Mi
              ruta de hoy" en Visitas.
            </p>
          </div>
          <CasillasPermisos
            permisos={form.permisos}
            onCambiar={(permisos) => setForm({ ...form, permisos })}
            esAdmin={form.rol === "ADMIN"}
          />
          <button
            type="submit"
            disabled={crearUsuario.isPending}
            className="col-span-2 bg-emerald-600 text-white py-2 rounded-md text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            {crearUsuario.isPending ? "Guardando..." : "Crear usuario"}
          </button>
          {crearUsuario.isError && (
            <p className="col-span-2 text-red-600 dark:text-red-400 text-sm">
              {(crearUsuario.error as any)?.response?.data?.error ?? "Error al crear el usuario"}
            </p>
          )}
        </form>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
            <tr>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2">Usuario</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Rol</th>
              <th className="px-4 py-2">Sucursal</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">Cargando...</td>
              </tr>
            )}
            {!isLoading && usuarios?.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">
                  {busquedaDebounced ? `Sin resultados para "${busquedaDebounced}"` : "No hay usuarios"}
                </td>
              </tr>
            )}
            {usuarios?.map((u) => (
              <tr key={u.id} className="border-t border-gray-100 dark:border-gray-700">
                <td className="px-4 py-2">{u.nombre}</td>
                <td className="px-4 py-2 font-mono text-xs">{u.usuario}</td>
                <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{u.email || "—"}</td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${u.rol === "ADMIN" ? "bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200" : "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"}`}>
                    {u.rol === "ADMIN" ? "Administrador" : "Acceso personalizado"}
                  </span>
                </td>
                <td className="px-4 py-2 text-gray-600 dark:text-gray-300">
                  {u.sucursal?.nombre ?? <span className="text-amber-600 dark:text-amber-400">Sin asignar</span>}
                </td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${u.activo ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"}`}>
                    {u.activo ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="px-4 py-2 text-right space-x-3">
                  <button
                    onClick={() => abrirEdicion(u)}
                    className="text-sky-600 dark:text-sky-400 hover:underline text-xs font-medium"
                  >
                    Editar
                  </button>
                  {u.activo && (
                    <button
                      onClick={() => confirmarResetearPassword(u)}
                      className="text-amber-600 dark:text-amber-400 hover:underline text-xs font-medium"
                    >
                      Resetear contraseña
                    </button>
                  )}
                  {u.activo && (
                    <button
                      onClick={() => confirmarDesactivar(u)}
                      className="text-red-600 dark:text-red-400 hover:underline text-xs font-medium"
                    >
                      Desactivar
                    </button>
                  )}
                </td>
              </tr>
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

      {usuarioEditando && (
        <Modal titulo={`Editar a ${usuarioEditando.nombre}`} onCerrar={() => setUsuarioEditando(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              editarUsuario.mutate();
            }}
            className="grid grid-cols-2 gap-3"
          >
            <input
              placeholder="Nombre completo"
              required
              value={formEdicion.nombre}
              onChange={(e) => setFormEdicion({ ...formEdicion, nombre: e.target.value })}
              className="col-span-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
            />
            <input
              placeholder="Correo (opcional, para recuperar la contraseña)"
              type="email"
              value={formEdicion.email}
              onChange={(e) => setFormEdicion({ ...formEdicion, email: e.target.value })}
              className="col-span-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
            />
            <select
              value={formEdicion.rol}
              onChange={(e) => setFormEdicion({ ...formEdicion, rol: e.target.value })}
              className="col-span-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
            >
              <option value="CAJERO">Personalizado (elige los permisos abajo)</option>
              <option value="ADMIN">Administrador (acceso total)</option>
            </select>
            <select
              required
              value={formEdicion.sucursalId}
              onChange={(e) => setFormEdicion({ ...formEdicion, sucursalId: e.target.value })}
              className="col-span-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
            >
              <option value="" disabled>Sucursal donde trabaja...</option>
              {sucursales?.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
            <div className="col-span-2">
              <select
                value={formEdicion.empleadoId}
                onChange={(e) => setFormEdicion({ ...formEdicion, empleadoId: e.target.value })}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
              >
                <option value="">Sin vincular a un empleado técnico</option>
                {empleados?.map((e) => (
                  <option key={e.id} value={e.id}>{e.nombres} {e.apellidos}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Opcional: si esta cuenta es de un técnico de campo, vincularla a su Empleado le permite ver "Mi
                ruta de hoy" en Visitas.
              </p>
            </div>
            <CasillasPermisos
              permisos={formEdicion.permisos}
              onCambiar={(permisos) => setFormEdicion({ ...formEdicion, permisos })}
              esAdmin={formEdicion.rol === "ADMIN"}
            />
            <button
              type="submit"
              disabled={editarUsuario.isPending}
              className="col-span-2 bg-emerald-600 text-white py-2 rounded-md text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
            >
              {editarUsuario.isPending ? "Guardando..." : "Guardar cambios"}
            </button>
            {editarUsuario.isError && (
              <p className="col-span-2 text-red-600 dark:text-red-400 text-sm">
                {(editarUsuario.error as any)?.response?.data?.error ?? "Error al editar el usuario"}
              </p>
            )}
          </form>
        </Modal>
      )}

      {passwordTemporal && (
        <Modal titulo={`Contraseña temporal para ${passwordTemporal.nombre}`} onCerrar={() => setPasswordTemporal(null)}>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
            Pásasela a {passwordTemporal.nombre} — el sistema le va a pedir cambiarla apenas entre. Esta es la
            única vez que se muestra, no queda guardada en ningún lado.
          </p>
          <p className="font-mono text-lg text-center bg-gray-100 dark:bg-gray-900 rounded-md py-3 mb-3 select-all">
            {passwordTemporal.password}
          </p>
          <button
            onClick={() => setPasswordTemporal(null)}
            className="w-full bg-slate-800 dark:bg-slate-700 text-white py-2 rounded-md text-sm font-medium hover:bg-slate-700 dark:hover:bg-slate-600"
          >
            Ya la copié
          </button>
        </Modal>
      )}
    </div>
  );
}
