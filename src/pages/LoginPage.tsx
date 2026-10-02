import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, type UsuarioAutenticado, type EmpresaResumen } from "../api/client";
import { BotonTema } from "../components/BotonTema";
import { MarcaAmbross, FONDO_CUADRICULA } from "../components/MarcaAmbross";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmProvider";
import type { Tema } from "../hooks/useTema";
import { guardarTokenParaServiceWorker } from "../utils/serviceWorkerTecnico";

interface Props {
  onLoginExitoso: (usuario: UsuarioAutenticado, empresa: EmpresaResumen) => void;
  tema: Tema;
  alternarTema: () => void;
}

const FORM_EMPRESA_VACIO = {
  nombre: "",
  ruc: "",
  razonSocial: "",
  direccionMatriz: "",
  ambienteSri: "1",
  establecimiento: "001",
  puntoEmision: "001",
  obligadoContabilidad: false,
  agenteRetencion: false,
  adminNombre: "",
  adminUsuario: "",
  adminPassword: "",
  claveMaestra: "",
};

const FORM_ELIMINAR_VACIO = {
  empresaId: "",
  nombreConfirmacion: "",
  usuario: "",
  password: "",
  claveMaestra: "",
};

const CLASE_ETIQUETA = "block font-mono text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5";

const FORM_OLVIDE_VACIO = {
  empresaId: "",
  usuario: "",
  codigo: "",
  passwordNueva: "",
  passwordConfirmar: "",
};

export function LoginPage({ onLoginExitoso, tema, alternarTema }: Props) {
  const { mostrarToast } = useToast();
  const confirmar = useConfirm();
  const [modo, setModo] = useState<"login" | "crear-empresa" | "eliminar-empresa" | "olvide-password">("login");

  const [empresas, setEmpresas] = useState<EmpresaResumen[] | null>(null);
  const [empresaId, setEmpresaId] = useState("");
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const [formEmpresa, setFormEmpresa] = useState(FORM_EMPRESA_VACIO);
  const [creandoEmpresa, setCreandoEmpresa] = useState(false);
  const [errorEmpresa, setErrorEmpresa] = useState<string | null>(null);

  const [formEliminar, setFormEliminar] = useState(FORM_ELIMINAR_VACIO);
  const [eliminandoEmpresa, setEliminandoEmpresa] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);

  const [formOlvide, setFormOlvide] = useState(FORM_OLVIDE_VACIO);
  const [pasoOlvide, setPasoOlvide] = useState<"solicitar" | "verificar">("solicitar");
  const [errorOlvide, setErrorOlvide] = useState<string | null>(null);

  async function cargarEmpresas(preseleccionar?: string) {
    try {
      const respuesta = await api.get<EmpresaResumen[]>("/auth/empresas");
      setEmpresas(respuesta.data);
      if (preseleccionar) {
        setEmpresaId(preseleccionar);
      } else if (respuesta.data.length === 1) {
        // Con una sola empresa registrada (el caso más común al empezar),
        // no tiene sentido obligar a elegirla — se preselecciona sola.
        setEmpresaId(respuesta.data[0].id);
      }
    } catch {
      setEmpresas([]);
    }
  }

  useEffect(() => {
    cargarEmpresas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function manejarSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);

    try {
      const respuesta = await api.post("/auth/login", { empresaId, usuario, password });
      // Guardamos el token en localStorage: así la sesión sobrevive si
      // recargas la página o cierras y abres el navegador de nuevo.
      localStorage.setItem("token", respuesta.data.token);
      localStorage.setItem("usuario", JSON.stringify(respuesta.data.usuario));
      localStorage.setItem("empresa", JSON.stringify(respuesta.data.empresa));
      // Espeja el token en IndexedDB para que el Service Worker pueda usarlo
      // si necesita mandar la cola de ubicaciones pendiente en segundo plano
      // (ver utils/serviceWorkerTecnico.ts) — localStorage no es accesible
      // desde ahí.
      guardarTokenParaServiceWorker(respuesta.data.token);
      onLoginExitoso(respuesta.data.usuario, respuesta.data.empresa);
    } catch (err: any) {
      setError(err.response?.data?.error ?? "Error al iniciar sesión");
    } finally {
      setCargando(false);
    }
  }

  async function manejarCrearEmpresa(e: React.FormEvent) {
    e.preventDefault();
    setErrorEmpresa(null);
    setCreandoEmpresa(true);

    try {
      const respuesta = await api.post<EmpresaResumen>("/auth/empresas", formEmpresa);
      mostrarToast(`Empresa "${respuesta.data.nombre}" creada. Ya puedes iniciar sesión con el usuario administrador.`, "success");
      setFormEmpresa(FORM_EMPRESA_VACIO);
      setModo("login");
      await cargarEmpresas(respuesta.data.id);
    } catch (err: any) {
      setErrorEmpresa(err.response?.data?.error ?? "Error al crear la empresa");
    } finally {
      setCreandoEmpresa(false);
    }
  }

  async function manejarEliminarEmpresa(e: React.FormEvent) {
    e.preventDefault();
    setErrorEliminar(null);

    const empresaElegida = empresas?.find((emp) => emp.id === formEliminar.empresaId);
    const ok = await confirmar(
      `Esto borra "${empresaElegida?.nombre ?? formEliminar.empresaId}" para siempre: su base de datos completa, ` +
        `sus comprobantes y sus archivos. No hay forma de deshacerlo. ¿Continuar?`
    );
    if (!ok) return;

    setEliminandoEmpresa(true);
    try {
      const { empresaId: idEmpresaAEliminar, ...body } = formEliminar;
      const respuesta = await api.post<{ mensaje: string }>(`/auth/empresas/${idEmpresaAEliminar}/eliminar`, body);
      mostrarToast(respuesta.data.mensaje, "success");
      setFormEliminar(FORM_ELIMINAR_VACIO);
      setModo("login");
      setEmpresaId("");
      await cargarEmpresas();
    } catch (err: any) {
      setErrorEliminar(err.response?.data?.error ?? "Error al eliminar la empresa");
    } finally {
      setEliminandoEmpresa(false);
    }
  }

  const solicitarCodigo = useMutation({
    mutationFn: async () =>
      api.post<{ mensaje: string }>("/auth/recuperar-password/solicitar", {
        empresaId: formOlvide.empresaId,
        usuario: formOlvide.usuario,
      }),
    onSuccess: (respuesta) => {
      mostrarToast(respuesta.data.mensaje, "success");
      setPasoOlvide("verificar");
    },
    onError: (err: any) => setErrorOlvide(err.response?.data?.error ?? "Error al solicitar el código"),
  });

  function manejarSolicitarCodigo(e: React.FormEvent) {
    e.preventDefault();
    setErrorOlvide(null);
    solicitarCodigo.mutate();
  }

  const confirmarRecuperacion = useMutation({
    mutationFn: async () =>
      api.post<{ mensaje: string }>("/auth/recuperar-password/confirmar", {
        empresaId: formOlvide.empresaId,
        usuario: formOlvide.usuario,
        codigo: formOlvide.codigo,
        passwordNueva: formOlvide.passwordNueva,
      }),
    onSuccess: (respuesta) => {
      mostrarToast(respuesta.data.mensaje, "success");
      setEmpresaId(formOlvide.empresaId);
      setUsuario(formOlvide.usuario);
      setPassword("");
      setFormOlvide(FORM_OLVIDE_VACIO);
      setPasoOlvide("solicitar");
      setModo("login");
    },
    onError: (err: any) => setErrorOlvide(err.response?.data?.error ?? "Error al confirmar la recuperación"),
  });

  function manejarConfirmarRecuperacion(e: React.FormEvent) {
    e.preventDefault();
    setErrorOlvide(null);
    if (formOlvide.passwordNueva.length < 8) {
      setErrorOlvide("La contraseña nueva debe tener al menos 8 caracteres");
      return;
    }
    if (formOlvide.passwordNueva !== formOlvide.passwordConfirmar) {
      setErrorOlvide("Las contraseñas nuevas no coinciden");
      return;
    }
    confirmarRecuperacion.mutate();
  }

  function volverALogin() {
    setFormOlvide(FORM_OLVIDE_VACIO);
    setPasoOlvide("solicitar");
    setErrorOlvide(null);
    setModo("login");
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)] bg-stone-50 dark:bg-gray-950">
      <PanelIdentidad />

      <main className="flex flex-col min-h-screen px-6 sm:px-12 py-6">
        <div className="flex items-center justify-between">
          {/* En pantallas chicas el panel de identidad se oculta — la marca
              queda como una línea sola arriba del formulario. */}
          <MarcaAmbross className="lg:invisible text-gray-900 dark:text-gray-100" />
          <BotonTema
            tema={tema}
            onAlternar={alternarTema}
            className="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-stone-200 dark:hover:bg-gray-800 p-2 rounded-sm"
          />
        </div>

        <div className="flex-1 flex items-center justify-center py-10">
          {modo === "login" ? (
            <div className="w-full max-w-sm">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-brand-700 dark:text-brand-400 mb-3">
                Acceso al sistema
              </p>
              <h1 className="font-serif text-4xl sm:text-5xl leading-none text-gray-900 dark:text-gray-50 mb-3">
                Bienvenido <em className="text-brand-700 dark:text-brand-400">de vuelta.</em>
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">Elige tu empresa e ingresa con tu usuario.</p>

              <form onSubmit={manejarSubmit} className="space-y-5">
                <div>
                  <label className={CLASE_ETIQUETA}>Empresa</label>
                  <select
                    required
                    value={empresaId}
                    onChange={(e) => setEmpresaId(e.target.value)}
                    className="w-full border border-stone-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                  >
                    <option value="" disabled>
                      {empresas === null ? "Cargando..." : "Selecciona una empresa"}
                    </option>
                    {empresas?.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={CLASE_ETIQUETA}>Usuario</label>
                  <input
                    type="text"
                    required
                    autoFocus
                    data-no-mayus="true"
                    value={usuario}
                    onChange={(e) => setUsuario(e.target.value)}
                    className="w-full border border-stone-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                  />
                </div>
                <div>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <label className={CLASE_ETIQUETA.replace(" mb-1.5", "")}>Contraseña</label>
                    <button
                      type="button"
                      onClick={() => {
                        setFormOlvide((f) => ({ ...f, empresaId, usuario }));
                        setModo("olvide-password");
                      }}
                      className="text-xs text-brand-700 dark:text-brand-400 hover:underline underline-offset-2"
                    >
                      ¿La olvidaste?
                    </button>
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full border border-stone-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                  />
                </div>

                {error && (
                  <p className="border-l-2 border-red-600 pl-3 text-red-700 dark:text-red-400 text-sm">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={cargando}
                  className="group w-full flex items-center justify-between bg-brand-700 text-white px-4 py-3 rounded-sm text-sm font-semibold hover:bg-brand-800 disabled:opacity-50"
                >
                  <span>{cargando ? "Ingresando..." : "Iniciar sesión"}</span>
                  <span aria-hidden className="transition-transform group-hover:translate-x-1">
                    →
                  </span>
                </button>
              </form>

              <div className="mt-10 pt-4 border-t border-stone-200 dark:border-gray-800">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500 mb-2">
                  Administración de empresas
                </p>
                <div className="flex items-center gap-5 text-xs">
                  <button
                    onClick={() => setModo("crear-empresa")}
                    className="text-gray-600 dark:text-gray-300 hover:text-brand-700 dark:hover:text-brand-300 hover:underline underline-offset-2"
                  >
                    + Crear empresa nueva
                  </button>
                  <button
                    onClick={() => setModo("eliminar-empresa")}
                    className="text-red-600 dark:text-red-400 hover:underline underline-offset-2"
                  >
                    Eliminar una empresa
                  </button>
                </div>
              </div>
            </div>
          ) : modo === "crear-empresa" ? (
            <div className="w-full max-w-md">
              <h1 className="font-serif text-4xl text-gray-900 dark:text-gray-50 mb-2">Crear empresa nueva</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Crea una base de datos completamente separada para otro negocio, con su propio usuario administrador.
                Necesitas la clave maestra del servidor.
              </p>

              <form onSubmit={manejarCrearEmpresa} className="space-y-3">
                <input
                  type="password"
                  placeholder="Clave maestra del servidor"
                  required
                  value={formEmpresa.claveMaestra}
                  onChange={(e) => setFormEmpresa({ ...formEmpresa, claveMaestra: e.target.value })}
                  className="w-full border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-gray-900 dark:text-gray-100 rounded-sm px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                />

                <div className="grid grid-cols-2 gap-3">
                  <input
                    placeholder="Nombre de la empresa"
                    required
                    value={formEmpresa.nombre}
                    onChange={(e) => setFormEmpresa({ ...formEmpresa, nombre: e.target.value })}
                    className="col-span-2 border border-stone-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                  />
                  <input
                    placeholder="RUC"
                    required
                    value={formEmpresa.ruc}
                    onChange={(e) => setFormEmpresa({ ...formEmpresa, ruc: e.target.value })}
                    className="border border-stone-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                  />
                  <select
                    value={formEmpresa.ambienteSri}
                    onChange={(e) => setFormEmpresa({ ...formEmpresa, ambienteSri: e.target.value })}
                    className="border border-stone-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                  >
                    <option value="1">Ambiente: Pruebas</option>
                    <option value="2">Ambiente: Producción</option>
                  </select>
                  <input
                    placeholder="Razón social"
                    required
                    value={formEmpresa.razonSocial}
                    onChange={(e) => setFormEmpresa({ ...formEmpresa, razonSocial: e.target.value })}
                    className="col-span-2 border border-stone-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                  />
                  <input
                    placeholder="Dirección matriz"
                    value={formEmpresa.direccionMatriz}
                    onChange={(e) => setFormEmpresa({ ...formEmpresa, direccionMatriz: e.target.value })}
                    className="col-span-2 border border-stone-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                  />
                  <input
                    placeholder="Establecimiento (001)"
                    value={formEmpresa.establecimiento}
                    onChange={(e) => setFormEmpresa({ ...formEmpresa, establecimiento: e.target.value })}
                    className="border border-stone-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                  />
                  <input
                    placeholder="Punto de emisión (001)"
                    value={formEmpresa.puntoEmision}
                    onChange={(e) => setFormEmpresa({ ...formEmpresa, puntoEmision: e.target.value })}
                    className="border border-stone-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                  />
                </div>

                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={formEmpresa.obligadoContabilidad}
                    onChange={(e) => setFormEmpresa({ ...formEmpresa, obligadoContabilidad: e.target.checked })}
                  />
                  Obligado a llevar contabilidad
                </label>

                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={formEmpresa.agenteRetencion}
                    onChange={(e) => setFormEmpresa({ ...formEmpresa, agenteRetencion: e.target.checked })}
                  />
                  Agente de retención autorizado por el SRI
                </label>

                <div className="border-t border-stone-200 dark:border-gray-800 pt-3">
                  <p className="font-mono text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Usuario administrador inicial</p>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      placeholder="Nombre completo"
                      required
                      value={formEmpresa.adminNombre}
                      onChange={(e) => setFormEmpresa({ ...formEmpresa, adminNombre: e.target.value })}
                      className="col-span-2 border border-stone-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                    />
                    <input
                      placeholder="Usuario"
                      required
                      data-no-mayus="true"
                      value={formEmpresa.adminUsuario}
                      onChange={(e) => setFormEmpresa({ ...formEmpresa, adminUsuario: e.target.value })}
                      className="border border-stone-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                    />
                    <input
                      type="password"
                      placeholder="Contraseña (mín. 8)"
                      required
                      minLength={8}
                      value={formEmpresa.adminPassword}
                      onChange={(e) => setFormEmpresa({ ...formEmpresa, adminPassword: e.target.value })}
                      className="border border-stone-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                    />
                  </div>
                </div>

                {errorEmpresa && <p className="text-red-600 dark:text-red-400 text-sm">{errorEmpresa}</p>}

                <button
                  type="submit"
                  disabled={creandoEmpresa}
                  className="w-full bg-brand-700 text-white py-3 rounded-sm text-sm font-semibold hover:bg-brand-800 disabled:opacity-50"
                >
                  {creandoEmpresa ? "Creando empresa (puede tardar unos segundos)..." : "Crear empresa"}
                </button>
              </form>

              <button
                onClick={() => setModo("login")}
                className="mt-6 font-mono text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 hover:text-brand-700 dark:hover:text-brand-300"
              >
                ← Volver a iniciar sesión
              </button>
            </div>
          ) : modo === "eliminar-empresa" ? (
            <div className="w-full max-w-sm">
              <h1 className="font-serif text-4xl text-red-700 dark:text-red-400 mb-2">Eliminar empresa</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Borra su base de datos y sus archivos para siempre. No hay forma de deshacerlo — solo puede hacerlo
                un administrador real de esa empresa, más la clave maestra del servidor.
              </p>

              <form onSubmit={manejarEliminarEmpresa} className="space-y-3">
                <select
                  required
                  value={formEliminar.empresaId}
                  onChange={(e) => setFormEliminar({ ...formEliminar, empresaId: e.target.value })}
                  className="w-full border border-stone-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                >
                  <option value="" disabled>
                    Selecciona la empresa a eliminar
                  </option>
                  {empresas?.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.nombre}
                    </option>
                  ))}
                </select>

                <input
                  placeholder="Escribe el nombre EXACTO de la empresa para confirmar"
                  required
                  value={formEliminar.nombreConfirmacion}
                  onChange={(e) => setFormEliminar({ ...formEliminar, nombreConfirmacion: e.target.value })}
                  className="w-full border border-red-300 dark:border-red-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-red-500"
                />

                <div className="border-t border-stone-200 dark:border-gray-800 pt-3">
                  <p className="font-mono text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                    Usuario administrador de esa empresa
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      placeholder="Usuario"
                      required
                      data-no-mayus="true"
                      value={formEliminar.usuario}
                      onChange={(e) => setFormEliminar({ ...formEliminar, usuario: e.target.value })}
                      className="border border-stone-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                    />
                    <input
                      type="password"
                      placeholder="Contraseña"
                      required
                      value={formEliminar.password}
                      onChange={(e) => setFormEliminar({ ...formEliminar, password: e.target.value })}
                      className="border border-stone-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                    />
                  </div>
                </div>

                <input
                  type="password"
                  placeholder="Clave maestra del servidor"
                  required
                  value={formEliminar.claveMaestra}
                  onChange={(e) => setFormEliminar({ ...formEliminar, claveMaestra: e.target.value })}
                  className="w-full border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-gray-900 dark:text-gray-100 rounded-sm px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                />

                {errorEliminar && <p className="text-red-600 dark:text-red-400 text-sm">{errorEliminar}</p>}

                <button
                  type="submit"
                  disabled={eliminandoEmpresa}
                  className="w-full bg-red-700 text-white py-3 rounded-sm text-sm font-semibold hover:bg-red-800 disabled:opacity-50"
                >
                  {eliminandoEmpresa ? "Eliminando..." : "Eliminar empresa para siempre"}
                </button>
              </form>

              <button
                onClick={() => setModo("login")}
                className="mt-6 font-mono text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 hover:text-brand-700 dark:hover:text-brand-300"
              >
                ← Volver a iniciar sesión
              </button>
            </div>
          ) : (
            <div className="w-full max-w-sm">
              <h1 className="font-serif text-4xl text-gray-900 dark:text-gray-50 mb-2">Recuperar contraseña</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                {pasoOlvide === "solicitar"
                  ? "Escribe tu empresa y usuario. Si tienes un correo registrado, te enviaremos un código."
                  : "Escribe el código que llegó a tu correo y elige tu nueva contraseña."}
              </p>

              {pasoOlvide === "solicitar" ? (
                <form onSubmit={manejarSolicitarCodigo} className="space-y-3">
                  <select
                    required
                    value={formOlvide.empresaId}
                    onChange={(e) => setFormOlvide({ ...formOlvide, empresaId: e.target.value })}
                    className="w-full border border-stone-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                  >
                    <option value="" disabled>
                      Selecciona una empresa
                    </option>
                    {empresas?.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.nombre}
                      </option>
                    ))}
                  </select>

                  <input
                    placeholder="Usuario"
                    required
                    autoFocus
                    data-no-mayus="true"
                    value={formOlvide.usuario}
                    onChange={(e) => setFormOlvide({ ...formOlvide, usuario: e.target.value })}
                    className="w-full border border-stone-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                  />

                  {errorOlvide && <p className="text-red-600 dark:text-red-400 text-sm">{errorOlvide}</p>}

                  <button
                    type="submit"
                    disabled={solicitarCodigo.isPending}
                    className="w-full bg-brand-700 text-white py-3 rounded-sm text-sm font-semibold hover:bg-brand-800 disabled:opacity-50"
                  >
                    {solicitarCodigo.isPending ? "Enviando..." : "Enviar código"}
                  </button>
                </form>
              ) : (
                <form onSubmit={manejarConfirmarRecuperacion} className="space-y-3">
                  <input
                    placeholder="Código de 6 dígitos"
                    required
                    maxLength={6}
                    autoFocus
                    value={formOlvide.codigo}
                    onChange={(e) => setFormOlvide({ ...formOlvide, codigo: e.target.value })}
                    className="w-full border border-stone-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                  />
                  <input
                    type="password"
                    placeholder="Contraseña nueva (mín. 8)"
                    required
                    minLength={8}
                    value={formOlvide.passwordNueva}
                    onChange={(e) => setFormOlvide({ ...formOlvide, passwordNueva: e.target.value })}
                    className="w-full border border-stone-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                  />
                  <input
                    type="password"
                    placeholder="Confirmar contraseña nueva"
                    required
                    value={formOlvide.passwordConfirmar}
                    onChange={(e) => setFormOlvide({ ...formOlvide, passwordConfirmar: e.target.value })}
                    className="w-full border border-stone-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                  />

                  {errorOlvide && <p className="text-red-600 dark:text-red-400 text-sm">{errorOlvide}</p>}

                  <button
                    type="submit"
                    disabled={confirmarRecuperacion.isPending}
                    className="w-full bg-brand-700 text-white py-3 rounded-sm text-sm font-semibold hover:bg-brand-800 disabled:opacity-50"
                  >
                    {confirmarRecuperacion.isPending ? "Guardando..." : "Cambiar contraseña"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPasoOlvide("solicitar");
                      setErrorOlvide(null);
                    }}
                    className="w-full text-center text-xs text-slate-500 dark:text-slate-400 hover:underline"
                  >
                    ← Pedir otro código
                  </button>
                </form>
              )}

              <button
                onClick={volverALogin}
                className="mt-6 font-mono text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 hover:text-brand-700 dark:hover:text-brand-300"
              >
                ← Volver a iniciar sesión
              </button>
            </div>
          )}
        </div>

        <p className="font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-600 text-right">
          Creado por JuanCarlosAmbrosi · Cuenca, Ecuador
        </p>
      </main>
    </div>
  );
}

// Panel izquierdo del login (solo en pantallas anchas): en vez de la típica
// tarjeta centrada sobre fondo gris, una "hoja cuadriculada" con un
// comprobante de muestra sellado — deja claro de entrada de qué va el
// sistema. Los números del comprobante son decorativos, no reales.
function PanelIdentidad() {
  return (
    <aside
      className="hidden lg:flex flex-col justify-between min-h-screen overflow-hidden bg-brand-900 text-brand-50 px-14 py-10"
      style={FONDO_CUADRICULA}
    >
      <MarcaAmbross className="text-white" />

      <div className="max-w-lg">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-brand-300 mb-5">
          Facturación electrónica · Tecnicos · Visitas Tecnicas · Inventario · Reportes - Vehiculos 
          
        </p>
        <h2 className="font-serif text-6xl leading-[0.95] text-white">
          Controla tu Empresa,<em className="text-brand-300">con </em>AmbrossISP.
        </h2>

        <div className="relative mt-12 ml-2 w-80 -rotate-2 bg-stone-50 text-gray-800 px-6 py-5 font-mono text-[11px] leading-relaxed shadow-xl">
          <div className="flex justify-between border-b border-dashed border-gray-400 pb-2 mb-2">
            <span className="font-semibold">FACTURA</span>
            <span>001-001-000000482</span>
          </div>
          <div className="flex justify-between">
            <span>Subtotal 15%</span>
            <span>84,35</span>
          </div>
          <div className="flex justify-between">
            <span>IVA 15%</span>
            <span>12,65</span>
          </div>
          <div className="flex justify-between font-semibold border-t border-gray-800 pt-1.5 mt-1.5">
            <span>TOTAL USD</span>
            <span>97,00</span>
          </div>
          <p className="mt-3 text-[9px] text-gray-500 break-all leading-snug">
            CLAVE DE ACCESO
            <br />
            2609202601019000000000120010010000004821234567817
          </p>
          <span className="absolute -right-6 -top-4 rotate-[9deg] border-2 border-brand-600 text-brand-600 bg-stone-50/90 px-2 py-0.5 text-xs font-bold tracking-[0.25em]">
            AUTORIZADO
          </span>
        </div>
      </div>

      <div className="flex justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-brand-300/80">
        <span>Cuenca — Ecuador</span>
        <span>RUC · IVA · RIDE</span>
      </div>
    </aside>
  );
}
