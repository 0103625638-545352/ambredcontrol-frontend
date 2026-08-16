import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, type UsuarioAutenticado, type EmpresaResumen } from "../api/client";
import { BotonTema } from "../components/BotonTema";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmProvider";
import type { Tema } from "../hooks/useTema";

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
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950 flex items-center justify-center relative py-8">
      <BotonTema
        tema={tema}
        onAlternar={alternarTema}
        className="absolute top-4 right-4 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800 p-2 rounded-md"
      />

      {modo === "login" ? (
        <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 p-8 w-full max-w-sm">
          <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-1 text-center">
            AmbrossISP PYMES
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-6">Inicia sesión para continuar</p>

          <form onSubmit={manejarSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">Empresa</label>
              <select
                required
                value={empresaId}
                onChange={(e) => setEmpresaId(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
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
              <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">Usuario</label>
              <input
                type="text"
                required
                autoFocus
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">Contraseña</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
              />
            </div>

            {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={cargando}
              className="w-full bg-slate-800 dark:bg-slate-700 text-white py-2 rounded-md text-sm font-medium hover:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50"
            >
              {cargando ? "Ingresando..." : "Iniciar sesión"}
            </button>
          </form>

          <button
            onClick={() => {
              setFormOlvide((f) => ({ ...f, empresaId, usuario }));
              setModo("olvide-password");
            }}
            className="w-full text-center text-xs text-slate-500 dark:text-slate-400 hover:underline mt-4"
          >
            ¿Olvidaste tu contraseña?
          </button>

          <div className="flex items-center justify-center gap-4 mt-3">
            <button
              onClick={() => setModo("crear-empresa")}
              className="text-center text-xs text-slate-500 dark:text-slate-400 hover:underline"
            >
              + Crear una empresa nueva
            </button>
            <button
              onClick={() => setModo("eliminar-empresa")}
              className="text-center text-xs text-red-500 dark:text-red-400 hover:underline"
            >
              Eliminar una empresa
            </button>
          </div>
        </div>
      ) : modo === "crear-empresa" ? (
        <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 p-8 w-full max-w-md">
          <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">Crear empresa nueva</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">
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
              className="w-full border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
            />

            <div className="grid grid-cols-2 gap-3">
              <input
                placeholder="Nombre de la empresa"
                required
                value={formEmpresa.nombre}
                onChange={(e) => setFormEmpresa({ ...formEmpresa, nombre: e.target.value })}
                className="col-span-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
              />
              <input
                placeholder="RUC"
                required
                value={formEmpresa.ruc}
                onChange={(e) => setFormEmpresa({ ...formEmpresa, ruc: e.target.value })}
                className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
              />
              <select
                value={formEmpresa.ambienteSri}
                onChange={(e) => setFormEmpresa({ ...formEmpresa, ambienteSri: e.target.value })}
                className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
              >
                <option value="1">Ambiente: Pruebas</option>
                <option value="2">Ambiente: Producción</option>
              </select>
              <input
                placeholder="Razón social"
                required
                value={formEmpresa.razonSocial}
                onChange={(e) => setFormEmpresa({ ...formEmpresa, razonSocial: e.target.value })}
                className="col-span-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
              />
              <input
                placeholder="Dirección matriz"
                value={formEmpresa.direccionMatriz}
                onChange={(e) => setFormEmpresa({ ...formEmpresa, direccionMatriz: e.target.value })}
                className="col-span-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
              />
              <input
                placeholder="Establecimiento (001)"
                value={formEmpresa.establecimiento}
                onChange={(e) => setFormEmpresa({ ...formEmpresa, establecimiento: e.target.value })}
                className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
              />
              <input
                placeholder="Punto de emisión (001)"
                value={formEmpresa.puntoEmision}
                onChange={(e) => setFormEmpresa({ ...formEmpresa, puntoEmision: e.target.value })}
                className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
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

            <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">Usuario administrador inicial</p>
              <div className="grid grid-cols-2 gap-3">
                <input
                  placeholder="Nombre completo"
                  required
                  value={formEmpresa.adminNombre}
                  onChange={(e) => setFormEmpresa({ ...formEmpresa, adminNombre: e.target.value })}
                  className="col-span-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
                />
                <input
                  placeholder="Usuario"
                  required
                  value={formEmpresa.adminUsuario}
                  onChange={(e) => setFormEmpresa({ ...formEmpresa, adminUsuario: e.target.value })}
                  className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
                />
                <input
                  type="password"
                  placeholder="Contraseña (mín. 8)"
                  required
                  minLength={8}
                  value={formEmpresa.adminPassword}
                  onChange={(e) => setFormEmpresa({ ...formEmpresa, adminPassword: e.target.value })}
                  className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
                />
              </div>
            </div>

            {errorEmpresa && <p className="text-red-600 dark:text-red-400 text-sm">{errorEmpresa}</p>}

            <button
              type="submit"
              disabled={creandoEmpresa}
              className="w-full bg-brand-600 text-white py-2 rounded-md text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
            >
              {creandoEmpresa ? "Creando empresa (puede tardar unos segundos)..." : "Crear empresa"}
            </button>
          </form>

          <button
            onClick={() => setModo("login")}
            className="w-full text-center text-xs text-slate-500 dark:text-slate-400 hover:underline mt-4"
          >
            ← Volver a iniciar sesión
          </button>
        </div>
      ) : modo === "eliminar-empresa" ? (
        <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 p-8 w-full max-w-sm">
          <h1 className="text-lg font-semibold text-red-700 dark:text-red-400 mb-1">Eliminar empresa</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">
            Borra su base de datos y sus archivos para siempre. No hay forma de deshacerlo — solo puede hacerlo
            un administrador real de esa empresa, más la clave maestra del servidor.
          </p>

          <form onSubmit={manejarEliminarEmpresa} className="space-y-3">
            <select
              required
              value={formEliminar.empresaId}
              onChange={(e) => setFormEliminar({ ...formEliminar, empresaId: e.target.value })}
              className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
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
              className="w-full border border-red-300 dark:border-red-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
            />

            <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">
                Usuario administrador de esa empresa
              </p>
              <div className="grid grid-cols-2 gap-3">
                <input
                  placeholder="Usuario"
                  required
                  value={formEliminar.usuario}
                  onChange={(e) => setFormEliminar({ ...formEliminar, usuario: e.target.value })}
                  className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
                />
                <input
                  type="password"
                  placeholder="Contraseña"
                  required
                  value={formEliminar.password}
                  onChange={(e) => setFormEliminar({ ...formEliminar, password: e.target.value })}
                  className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
                />
              </div>
            </div>

            <input
              type="password"
              placeholder="Clave maestra del servidor"
              required
              value={formEliminar.claveMaestra}
              onChange={(e) => setFormEliminar({ ...formEliminar, claveMaestra: e.target.value })}
              className="w-full border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
            />

            {errorEliminar && <p className="text-red-600 dark:text-red-400 text-sm">{errorEliminar}</p>}

            <button
              type="submit"
              disabled={eliminandoEmpresa}
              className="w-full bg-red-600 text-white py-2 rounded-md text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {eliminandoEmpresa ? "Eliminando..." : "Eliminar empresa para siempre"}
            </button>
          </form>

          <button
            onClick={() => setModo("login")}
            className="w-full text-center text-xs text-slate-500 dark:text-slate-400 hover:underline mt-4"
          >
            ← Volver a iniciar sesión
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 p-8 w-full max-w-sm">
          <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">Recuperar contraseña</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">
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
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
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
                value={formOlvide.usuario}
                onChange={(e) => setFormOlvide({ ...formOlvide, usuario: e.target.value })}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
              />

              {errorOlvide && <p className="text-red-600 dark:text-red-400 text-sm">{errorOlvide}</p>}

              <button
                type="submit"
                disabled={solicitarCodigo.isPending}
                className="w-full bg-slate-800 dark:bg-slate-700 text-white py-2 rounded-md text-sm font-medium hover:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50"
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
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
              />
              <input
                type="password"
                placeholder="Contraseña nueva (mín. 8)"
                required
                minLength={8}
                value={formOlvide.passwordNueva}
                onChange={(e) => setFormOlvide({ ...formOlvide, passwordNueva: e.target.value })}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
              />
              <input
                type="password"
                placeholder="Confirmar contraseña nueva"
                required
                value={formOlvide.passwordConfirmar}
                onChange={(e) => setFormOlvide({ ...formOlvide, passwordConfirmar: e.target.value })}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
              />

              {errorOlvide && <p className="text-red-600 dark:text-red-400 text-sm">{errorOlvide}</p>}

              <button
                type="submit"
                disabled={confirmarRecuperacion.isPending}
                className="w-full bg-brand-600 text-white py-2 rounded-md text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
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
            className="w-full text-center text-xs text-slate-500 dark:text-slate-400 hover:underline mt-4"
          >
            ← Volver a iniciar sesión
          </button>
        </div>
      )}

      <p className="absolute bottom-3 right-4 text-xs text-gray-400 dark:text-gray-600">
        Creado por: JuanCarlosAmbrosi (Cuenca - Ecuador)
      </p>
    </div>
  );
}
