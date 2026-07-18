import { useState } from "react";
import { DashboardPage } from "./pages/DashboardPage";
import { ProductosPage } from "./pages/ProductosPage";
import { PuntoDeVentaPage } from "./pages/PuntoDeVentaPage";
import { CajaPage } from "./pages/CajaPage";
import { ClientesPage } from "./pages/ClientesPage";
import { FacturasPage } from "./pages/FacturasPage";
import { NotasVentaPage } from "./pages/NotasVentaPage";
import { ProformasPage } from "./pages/ProformasPage";
import { ReportesPage } from "./pages/ReportesPage";
import { NotasCreditoPage } from "./pages/NotasCreditoPage";
import { GuiasRemisionPage } from "./pages/GuiasRemisionPage";
import { ComprasPage } from "./pages/ComprasPage";
import { DevolucionesCompraPage } from "./pages/DevolucionesCompraPage";
import { SeriesProductosPage } from "./pages/SeriesProductosPage";
import { ProveedoresPage } from "./pages/ProveedoresPage";
import { CategoriasPage } from "./pages/CategoriasPage";
import { TiposPrecioPage } from "./pages/TiposPrecioPage";
import { CuentasBancariasPage } from "./pages/CuentasBancariasPage";
import { UsuariosPage } from "./pages/UsuariosPage";
import { AuditoriaPage } from "./pages/AuditoriaPage";
import { ContabilidadPage } from "./pages/ContabilidadPage";
import { EmpleadosPage } from "./pages/EmpleadosPage";
import { NominaPage } from "./pages/NominaPage";
import { VisitasPage } from "./pages/VisitasPage";
import { HistorialVisitasPage } from "./pages/HistorialVisitasPage";
import { MikrotikPage } from "./pages/MikrotikPage";
import { PlanesInternetPage } from "./pages/PlanesInternetPage";
import { NodosPage } from "./pages/NodosPage";
import { FacturacionInternetPage } from "./pages/FacturacionInternetPage";
import { AcercaDePage } from "./pages/AcercaDePage";
import { AjustesPage } from "./pages/AjustesPage";
import { TrasladosPage } from "./pages/TrasladosPage";
import { ReporteadorPrincipalPage } from "./pages/ReporteadorPrincipalPage";
import { LoginPage } from "./pages/LoginPage";
import { CambiarPasswordObligatorioPage } from "./pages/CambiarPasswordObligatorioPage";
import { AuthContext } from "./context/AuthContext";
import { BotonTema } from "./components/BotonTema";
import { Sidebar, type Pestana } from "./components/Sidebar";
import { ToastProvider } from "./components/ToastProvider";
import { ConfirmProvider } from "./components/ConfirmProvider";
import { Modal } from "./components/Modal";
import { FormularioCambiarPassword } from "./components/FormularioCambiarPassword";
import { ModalMarcacion } from "./components/ModalMarcacion";
import { useTema } from "./hooks/useTema";
import type { UsuarioAutenticado, EmpresaResumen } from "./api/client";

function leerUsuarioGuardado(): UsuarioAutenticado | null {
  const guardado = localStorage.getItem("usuario");
  const token = localStorage.getItem("token");
  if (!guardado || !token) return null;
  try {
    return JSON.parse(guardado);
  } catch {
    return null;
  }
}

function leerEmpresaGuardada(): EmpresaResumen | null {
  const guardado = localStorage.getItem("empresa");
  if (!guardado) return null;
  try {
    return JSON.parse(guardado);
  } catch {
    return null;
  }
}

function App() {
  // Se llama siempre, incluso antes de iniciar sesión, para que el modo
  // oscuro también se vea en la pantalla de login.
  const { tema, alternarTema } = useTema();
  const [usuario, setUsuario] = useState<UsuarioAutenticado | null>(leerUsuarioGuardado());
  const [empresa, setEmpresa] = useState<EmpresaResumen | null>(leerEmpresaGuardada());
  const [pestanaActiva, setPestanaActiva] = useState<Pestana>("dashboard");
  const [sidebarAbierto, setSidebarAbierto] = useState(true);
  const [mostrarCambiarPassword, setMostrarCambiarPassword] = useState(false);
  const [mostrarMarcacion, setMostrarMarcacion] = useState(false);
  // Factura preseleccionada al ir de Facturas a Notas de Crédito con el botón
  // "Anular (nota de crédito)" — se consume (vuelve a null) apenas la toma
  // NotasCreditoPage, para no re-disparar la preselección si el usuario
  // vuelve a esa pestaña después.
  const [facturaIdParaNotaCredito, setFacturaIdParaNotaCredito] = useState<number | null>(null);

  function cerrarSesion() {
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
    localStorage.removeItem("empresa");
    setUsuario(null);
    setEmpresa(null);
  }

  function manejarLoginExitoso(usuarioNuevo: UsuarioAutenticado, empresaNueva: EmpresaResumen) {
    setUsuario(usuarioNuevo);
    setEmpresa(empresaNueva);
  }

  if (!usuario) {
    return (
      <ToastProvider>
        <ConfirmProvider>
          <LoginPage onLoginExitoso={manejarLoginExitoso} tema={tema} alternarTema={alternarTema} />
        </ConfirmProvider>
      </ToastProvider>
    );
  }

  // Un admin reseteó esta contraseña — se bloquea el resto del sistema hasta
  // que elija una propia, sin forma de saltarlo (ver UsuariosPage.tsx).
  if (usuario.debeCambiarPassword) {
    return (
      <ToastProvider>
        <ConfirmProvider>
          <CambiarPasswordObligatorioPage
            nombreUsuario={usuario.nombre}
            onCambiada={() => {
              const usuarioActualizado = { ...usuario, debeCambiarPassword: false };
              localStorage.setItem("usuario", JSON.stringify(usuarioActualizado));
              setUsuario(usuarioActualizado);
            }}
          />
        </ConfirmProvider>
      </ToastProvider>
    );
  }

  // Se computan directo desde "usuario" (no con usePermiso()) porque estamos
  // arriba del <AuthContext.Provider> — el contexto todavía no existe acá.
  const esAdmin = usuario.rol === "ADMIN";
  const puedeNotasCredito = esAdmin || usuario.permisos.includes("notas_credito");
  const puedeReportes = esAdmin || usuario.permisos.includes("reportes");
  const puedeAuditoria = esAdmin || usuario.permisos.includes("auditoria");
  const puedeConfiguracion = esAdmin || usuario.permisos.includes("configuracion");
  const puedeTraslados = esAdmin || usuario.permisos.includes("traslados");
  const puedeCaja = esAdmin || usuario.permisos.includes("caja");
  const puedeRetenciones = esAdmin || usuario.permisos.includes("retenciones");
  const puedeContabilidad = esAdmin || usuario.permisos.includes("contabilidad");
  const puedeDevolucionesCompra = esAdmin || usuario.permisos.includes("devoluciones_compra");
  const puedeGuiasRemision = esAdmin || usuario.permisos.includes("guias_remision");
  const puedeNomina = esAdmin || usuario.permisos.includes("nomina");
  const puedeVisitas = esAdmin || usuario.permisos.includes("visitas") || usuario.permisos.includes("visitas_editar");
  const puedeMikrotik = esAdmin || usuario.permisos.includes("mikrotik");
  const puedeVentas = esAdmin || usuario.permisos.includes("ventas");
  const puedeCompras = esAdmin || usuario.permisos.includes("compras");
  const puedeClientes = esAdmin || usuario.permisos.includes("clientes");
  const puedeProveedores = esAdmin || usuario.permisos.includes("proveedores");
  const puedeProductos = esAdmin || usuario.permisos.includes("productos");
  // Un técnico de campo vinculado a un Empleado (ver select en UsuariosPage)
  // necesita ver esta pestaña para acceder a "Mi ruta de hoy" aunque no
  // tenga ningún permiso de "visitas" — ese permiso es para planificar/ver
  // TODAS las rutas, no la propia.
  const mostrarVisitas = puedeVisitas || usuario.empleadoId != null;

  return (
    <ToastProvider>
    <ConfirmProvider>
    <AuthContext.Provider value={usuario}>
      <div className="h-screen flex flex-col bg-gray-100 dark:bg-gray-950">
        <header className="bg-sky-700 dark:bg-gray-900 text-white px-4 py-3 flex justify-between items-center shrink-0 shadow-sm z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarAbierto(!sidebarAbierto)}
              aria-label="Alternar menú"
              className="p-1.5 rounded-md hover:bg-sky-600 dark:hover:bg-gray-800"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-5 h-5">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-lg font-semibold">AmbrossISP PYMES</h1>
            {empresa && (
              <span className="text-xs bg-sky-800 dark:bg-gray-800 text-sky-100 dark:text-slate-300 px-2 py-1 rounded-md">
                {empresa.nombre}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-sky-100 dark:text-slate-300">
              {usuario.nombre}{" "}
              <span className="text-sky-200/70 dark:text-slate-500">
                ({esAdmin ? "Administrador" : "Acceso personalizado"})
              </span>
            </span>
            <BotonTema
              tema={tema}
              onAlternar={alternarTema}
              className="text-sky-100 hover:text-white hover:bg-sky-600 dark:hover:bg-gray-800 p-1.5 rounded-md"
            />
            <button
              onClick={() => setMostrarMarcacion(true)}
              title="Marcar asistencia de un empleado desde este dispositivo"
              aria-label="Marcar asistencia"
              className="text-sky-100 hover:text-white hover:bg-sky-600 dark:hover:bg-gray-800 p-1.5 rounded-md"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3.5 2" />
              </svg>
            </button>
            <button
              onClick={() => setPestanaActiva("acercaDe")}
              className="text-sky-100 hover:text-white hover:underline text-xs font-medium"
            >
              Acerca de
            </button>
            <button
              onClick={() => setMostrarCambiarPassword(true)}
              className="text-sky-100 hover:text-white hover:underline text-xs font-medium"
            >
              Cambiar contraseña
            </button>
            <button
              onClick={cerrarSesion}
              className="bg-sky-800 dark:bg-gray-800 hover:bg-sky-900 dark:hover:bg-gray-700 px-3 py-1.5 rounded-md text-xs font-medium"
            >
              Cerrar sesión
            </button>
          </div>
        </header>

        <div className="flex flex-1 min-h-0">
          <Sidebar
            pestanaActiva={pestanaActiva}
            onSeleccionar={setPestanaActiva}
            esAdmin={esAdmin}
            puedeNotasCredito={puedeNotasCredito}
            puedeReportes={puedeReportes}
            puedeAuditoria={puedeAuditoria}
            puedeConfiguracion={puedeConfiguracion}
            puedeTraslados={puedeTraslados}
            puedeCaja={puedeCaja}
            puedeContabilidad={puedeContabilidad}
            puedeDevolucionesCompra={puedeDevolucionesCompra}
            puedeGuiasRemision={puedeGuiasRemision}
            puedeNomina={puedeNomina}
            mostrarVisitas={mostrarVisitas}
            puedeVisitas={puedeVisitas}
            puedeMikrotik={puedeMikrotik}
            puedeVentas={puedeVentas}
            puedeCompras={puedeCompras}
            puedeClientes={puedeClientes}
            puedeProveedores={puedeProveedores}
            puedeProductos={puedeProductos}
            abierto={sidebarAbierto}
          />

          <main className="flex-1 overflow-y-auto p-6">
            <div className="max-w-6xl mx-auto">
              {pestanaActiva === "dashboard" && (
                <DashboardPage onNavegar={setPestanaActiva} puedeConfiguracion={puedeConfiguracion} puedeVentas={puedeVentas} puedeProductos={puedeProductos} />
              )}
              {pestanaActiva === "venta" && puedeVentas && <PuntoDeVentaPage />}
              {pestanaActiva === "caja" && puedeCaja && <CajaPage />}
              {pestanaActiva === "productos" && puedeProductos && <ProductosPage />}
              {pestanaActiva === "clientes" && puedeClientes && <ClientesPage />}
              {pestanaActiva === "facturas" && puedeVentas && (
                <FacturasPage
                  onIrANotaCredito={(facturaId) => {
                    setFacturaIdParaNotaCredito(facturaId);
                    setPestanaActiva("notasCredito");
                  }}
                />
              )}
              {pestanaActiva === "notasVenta" && puedeVentas && <NotasVentaPage />}
              {pestanaActiva === "proformas" && puedeVentas && <ProformasPage />}
              {pestanaActiva === "notasCredito" && puedeNotasCredito && (
                <NotasCreditoPage
                  facturaIdInicial={facturaIdParaNotaCredito}
                  onFacturaIdInicialConsumida={() => setFacturaIdParaNotaCredito(null)}
                />
              )}
              {pestanaActiva === "guiasRemision" && puedeGuiasRemision && <GuiasRemisionPage />}
              {pestanaActiva === "compras" && puedeCompras && <ComprasPage />}
              {pestanaActiva === "devolucionesCompra" && puedeDevolucionesCompra && <DevolucionesCompraPage />}
              {pestanaActiva === "seriesProductos" && puedeCompras && <SeriesProductosPage />}
              {pestanaActiva === "proveedores" && puedeProveedores && <ProveedoresPage />}
              {pestanaActiva === "categorias" && puedeProductos && <CategoriasPage />}
              {pestanaActiva === "tiposPrecio" && esAdmin && <TiposPrecioPage />}
              {pestanaActiva === "cuentasBancarias" && esAdmin && <CuentasBancariasPage />}
              {pestanaActiva === "traslados" && puedeTraslados && <TrasladosPage />}
              {pestanaActiva === "reportes" && puedeReportes && <ReportesPage />}
              {pestanaActiva === "reporteadorPrincipal" && puedeReportes && (
                <ReporteadorPrincipalPage
                  esAdmin={esAdmin}
                  puedeNotasCredito={puedeNotasCredito}
                  puedeAuditoria={puedeAuditoria}
                  puedeCaja={puedeCaja}
                  puedeRetenciones={puedeRetenciones}
                  puedeDevolucionesCompra={puedeDevolucionesCompra}
                />
              )}
              {pestanaActiva === "usuarios" && esAdmin && <UsuariosPage />}
              {pestanaActiva === "auditoria" && puedeAuditoria && <AuditoriaPage />}
              {pestanaActiva === "contabilidad" && puedeContabilidad && <ContabilidadPage />}
              {pestanaActiva === "empleados" && puedeNomina && <EmpleadosPage />}
              {pestanaActiva === "nomina" && puedeNomina && <NominaPage />}
              {pestanaActiva === "visitas" && mostrarVisitas && <VisitasPage />}
              {pestanaActiva === "historialVisitas" && puedeVisitas && <HistorialVisitasPage />}
              {pestanaActiva === "mikrotik" && puedeMikrotik && <MikrotikPage />}
              {pestanaActiva === "planesInternet" && puedeMikrotik && <PlanesInternetPage />}
              {pestanaActiva === "nodos" && puedeMikrotik && <NodosPage />}
              {pestanaActiva === "facturacionInternet" && puedeMikrotik && <FacturacionInternetPage />}
              {pestanaActiva === "ajustes" && puedeConfiguracion && <AjustesPage />}
              {pestanaActiva === "acercaDe" && <AcercaDePage />}
            </div>
          </main>
        </div>
      </div>

      {mostrarCambiarPassword && (
        <Modal titulo="Cambiar mi contraseña" onCerrar={() => setMostrarCambiarPassword(false)}>
          <FormularioCambiarPassword onExito={() => setMostrarCambiarPassword(false)} />
        </Modal>
      )}

      {mostrarMarcacion && empresa && (
        <ModalMarcacion onCerrar={() => setMostrarMarcacion(false)} empresaId={empresa.id} />
      )}

      <p className="fixed bottom-1.5 right-3 text-[11px] text-gray-400 dark:text-gray-600 pointer-events-none z-40">
        Creado por: JuanCarlosAmbrosi (Cuenca - Ecuador)
      </p>
    </AuthContext.Provider>
    </ConfirmProvider>
    </ToastProvider>
  );
}

export default App;
