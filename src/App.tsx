import { useState } from "react";
import { Clock, LogOut } from "lucide-react";
import { DashboardPage } from "./pages/DashboardPage";
import { ProductosPage } from "./pages/ProductosPage";
import { MetrajePage } from "./pages/MetrajePage";
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
import { EgresosBodegaPage } from "./pages/EgresosBodegaPage";
import { ProveedoresPage } from "./pages/ProveedoresPage";
import { CategoriasPage } from "./pages/CategoriasPage";
import { TiposPrecioPage } from "./pages/TiposPrecioPage";
import { CuentasBancariasPage } from "./pages/CuentasBancariasPage";
import { BancosPage } from "./pages/BancosPage";
import { UsuariosPage } from "./pages/UsuariosPage";
import { AuditoriaPage } from "./pages/AuditoriaPage";
import { ContabilidadPage } from "./pages/ContabilidadPage";
import { AtsPage } from "./pages/AtsPage";
import { EmpleadosPage } from "./pages/EmpleadosPage";
import { VehiculosPage } from "./pages/VehiculosPage";
import { ReporteCombustiblePage } from "./pages/ReporteCombustiblePage";
import { NominaPage } from "./pages/NominaPage";
import { VisitasPage } from "./pages/VisitasPage";
import { HistorialVisitasPage } from "./pages/HistorialVisitasPage";
import { MikrotikPage } from "./pages/MikrotikPage";
import { PlanesInternetPage } from "./pages/PlanesInternetPage";
import { PromocionesPage } from "./pages/PromocionesPage";
import { NodosPage } from "./pages/NodosPage";
import { OltsPage } from "./pages/OltsPage";
import { RedFisicaPage } from "./pages/RedFisicaPage";
import { MapaRedPage } from "./pages/MapaRedPage";
import { LocalizacionTecnicosPage } from "./pages/LocalizacionTecnicosPage";
import { CentroControlPage } from "./pages/CentroControlPage";
import { TicketsPage } from "./pages/TicketsPage";
import { FacturacionInternetPage } from "./pages/FacturacionInternetPage";
import { AcercaDePage } from "./pages/AcercaDePage";
import { AjustesPage } from "./pages/AjustesPage";
import { TrasladosPage } from "./pages/TrasladosPage";
import { ReporteadorPrincipalPage } from "./pages/ReporteadorPrincipalPage";
import { LoginPage } from "./pages/LoginPage";
import { CambiarPasswordObligatorioPage } from "./pages/CambiarPasswordObligatorioPage";
import { AuthContext } from "./context/AuthContext";
import { AppMovil } from "./AppMovil";
import { leerModoEfectivo, esUsuarioDeCampo, fijarModo, limpiarModoForzado } from "./utils/modoCampo";
import { BotonTema } from "./components/BotonTema";
import { MarcaAmbross, FONDO_CUADRICULA } from "./components/MarcaAmbross";
import { SelectorColor } from "./components/SelectorColor";
import { MenuSuperior, grupoDePestana, type Pestana } from "./components/MenuSuperior";
import { ToastProvider } from "./components/ToastProvider";
import { ConfirmProvider } from "./components/ConfirmProvider";
import { Modal } from "./components/Modal";
import { FormularioCambiarPassword } from "./components/FormularioCambiarPassword";
import { ModalMarcacion } from "./components/ModalMarcacion";
import { useTema } from "./hooks/useTema";
import { useColorTema } from "./hooks/useColorTema";
import type { UsuarioAutenticado, EmpresaResumen } from "./api/client";
import { guardarTokenParaServiceWorker } from "./utils/serviceWorkerTecnico";

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
  const { colorTema, setColorTema } = useColorTema();
  const [usuario, setUsuario] = useState<UsuarioAutenticado | null>(leerUsuarioGuardado());
  const [empresa, setEmpresa] = useState<EmpresaResumen | null>(leerEmpresaGuardada());
  const [pestanaActiva, setPestanaActiva] = useState<Pestana>("dashboard");
  // Qué grupo del menú superior está expandido (mostrando su fila de
  // subítems) — independiente de "pestanaActiva": permite explorar un grupo
  // sin todavía haber navegado a ninguno de sus ítems. Se sincroniza con la
  // pestaña activa a través de navegarA() más abajo, la única forma en que
  // el resto del componente cambia de pantalla.
  const [grupoAbierto, setGrupoAbierto] = useState<string | null>(() => grupoDePestana("dashboard"));
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
    // El Service Worker guarda su propia copia del token para poder mandar
    // la cola de ubicaciones pendiente en segundo plano (ver
    // utils/serviceWorkerTecnico.ts) — hay que borrarla también, o seguiría
    // mandando ubicaciones a nombre de esta sesión ya cerrada.
    guardarTokenParaServiceWorker(null);
    // El override de modo celular/completo es una preferencia de dispositivo
    // por persona — no debe arrastrarse a quien inicie sesión después.
    limpiarModoForzado();
    setUsuario(null);
    setEmpresa(null);
  }

  function manejarLoginExitoso(usuarioNuevo: UsuarioAutenticado, empresaNueva: EmpresaResumen) {
    setUsuario(usuarioNuevo);
    setEmpresa(empresaNueva);
  }

  // Único punto por el que cambia "pestanaActiva" en el shell de escritorio
  // (además del propio MenuSuperior) — mantiene "grupoAbierto" sincronizado
  // para que el menú siempre muestre expandido el grupo de la pantalla a la
  // que se acaba de saltar por código (ej. Facturas -> Notas de Crédito).
  function navegarA(pestana: Pestana) {
    setPestanaActiva(pestana);
    const grupo = grupoDePestana(pestana);
    if (grupo) setGrupoAbierto(grupo);
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

  // Un técnico de campo (Usuario no-ADMIN vinculado a un Empleado) arranca en
  // el shell móvil de una sola columna, salvo que haya elegido "Ver versión
  // completa" — ver utils/modoCampo.ts. El resto de <App/> es el shell de
  // escritorio de siempre.
  if (leerModoEfectivo(usuario) === "movil") {
    return (
      <AppMovil
        usuario={usuario}
        empresa={empresa}
        tema={tema}
        alternarTema={alternarTema}
        onCerrarSesion={cerrarSesion}
      />
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
  const puedeVehiculos = esAdmin || usuario.permisos.includes("vehiculos");
  const puedeVisitas = esAdmin || usuario.permisos.includes("visitas") || usuario.permisos.includes("visitas_editar");
  const puedeMikrotik = esAdmin || usuario.permisos.includes("mikrotik");
  const puedeOlt = esAdmin || usuario.permisos.includes("olt");
  const puedeRedFisica = esAdmin || usuario.permisos.includes("red_fisica");
  const puedeMapaRed = esAdmin || usuario.permisos.includes("mapa_red");
  const puedeUbicacionTecnicos = esAdmin || usuario.permisos.includes("ubicacion_tecnicos");
  const puedeCentroControl = esAdmin || usuario.permisos.includes("centro_control");
  const puedeTickets = esAdmin || usuario.permisos.includes("tickets");
  const puedeVentas = esAdmin || usuario.permisos.includes("ventas");
  const puedeCompras = esAdmin || usuario.permisos.includes("compras");
  const puedeClientes = esAdmin || usuario.permisos.includes("clientes");
  const puedeProveedores = esAdmin || usuario.permisos.includes("proveedores");
  const puedeProductos = esAdmin || usuario.permisos.includes("productos");
  const puedeInventario = esAdmin || usuario.permisos.includes("inventario");
  // Un técnico de campo vinculado a un Empleado (ver select en UsuariosPage)
  // necesita ver esta pestaña para acceder a "Mi ruta de hoy" aunque no
  // tenga ningún permiso de "visitas" — ese permiso es para planificar/ver
  // TODAS las rutas, no la propia.
  const mostrarVisitas = puedeVisitas || usuario.empleadoId != null;

  return (
    <ToastProvider>
    <ConfirmProvider>
    <AuthContext.Provider value={usuario}>
      <div className="h-screen flex flex-col bg-stone-100 dark:bg-gray-950">
        <header
          className="bg-brand-900 text-white px-5 py-2.5 flex justify-between items-center shrink-0 z-10"
          style={FONDO_CUADRICULA}
        >
          <div className="flex items-center gap-4 min-w-0">
            <h1 onClick={() => navegarA("dashboard")} className="cursor-pointer hover:opacity-90" title="Ir al Dashboard">
              <MarcaAmbross />
            </h1>
            {empresa && (
              <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-brand-200 border-l border-white/15 pl-4 truncate">
                {empresa.nombre}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-right leading-tight">
              <span className="block text-white text-sm font-medium">{usuario.nombre}</span>
              <span className="block font-mono text-[10px] uppercase tracking-wider text-brand-300">
                {esAdmin ? "Administrador" : "Acceso personalizado"}
              </span>
            </span>
            <span className="w-px h-7 bg-white/15" aria-hidden />
            <BotonTema
              tema={tema}
              onAlternar={alternarTema}
              className="text-brand-200 hover:text-white hover:bg-white/10 p-1.5 rounded-sm"
            />
            <SelectorColor
              colorTema={colorTema}
              onElegir={setColorTema}
              className="text-brand-200 hover:text-white hover:bg-white/10 p-1.5 rounded-sm"
            />
            <button
              onClick={() => setMostrarMarcacion(true)}
              title="Marcar asistencia de un empleado desde este dispositivo"
              aria-label="Marcar asistencia"
              className="text-brand-200 hover:text-white hover:bg-white/10 p-1.5 rounded-sm"
            >
              <Clock strokeWidth={1.75} className="w-5 h-5" />
            </button>
            <span className="w-px h-7 bg-white/15" aria-hidden />
            {esUsuarioDeCampo(usuario) && (
              <button
                onClick={() => fijarModo("movil")}
                className="font-mono text-[11px] uppercase tracking-wider text-brand-200 hover:text-white"
              >
                Versión celular
              </button>
            )}
            <button
              onClick={() => navegarA("acercaDe")}
              className="font-mono text-[11px] uppercase tracking-wider text-brand-200 hover:text-white"
            >
              Acerca de
            </button>
            <button
              onClick={() => setMostrarCambiarPassword(true)}
              className="font-mono text-[11px] uppercase tracking-wider text-brand-200 hover:text-white"
            >
              Cambiar contraseña
            </button>
            <button
              onClick={cerrarSesion}
              className="flex items-center gap-1.5 border border-white/25 hover:bg-white/10 px-3 py-1.5 rounded-sm text-xs font-semibold"
            >
              <LogOut strokeWidth={2} className="w-3.5 h-3.5" />
              Cerrar sesión
            </button>
          </div>
        </header>

        <MenuSuperior
          pestanaActiva={pestanaActiva}
          onSeleccionar={navegarA}
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
          puedeVehiculos={puedeVehiculos}
          mostrarVisitas={mostrarVisitas}
          puedeVisitas={puedeVisitas}
          puedeMikrotik={puedeMikrotik}
          puedeOlt={puedeOlt}
          puedeRedFisica={puedeRedFisica}
          puedeMapaRed={puedeMapaRed}
          puedeUbicacionTecnicos={puedeUbicacionTecnicos}
          puedeCentroControl={puedeCentroControl}
          puedeTickets={puedeTickets}
          puedeVentas={puedeVentas}
          puedeCompras={puedeCompras}
          puedeClientes={puedeClientes}
          puedeProveedores={puedeProveedores}
          puedeProductos={puedeProductos}
          puedeInventario={puedeInventario}
          grupoAbierto={grupoAbierto}
          onAbrirGrupo={setGrupoAbierto}
        />

        <div className="flex flex-1 min-h-0">
          <main className={`flex-1 p-6 ${pestanaActiva === "mapaRed" || pestanaActiva === "redFisica" || pestanaActiva === "ubicacionTecnicos" ? "overflow-hidden" : "overflow-y-auto"}`}>
            {/* Mapa de Red y Red Física escapan del ancho máximo de 6xl y
                ocupan todo el alto disponible a propósito — son mapas
                pensados para quedar fijos en una pantalla grande, no para
                convivir con el resto de pantallas (que sí son documentos
                angostos de lectura). */}
            <div className={pestanaActiva === "mapaRed" || pestanaActiva === "redFisica" || pestanaActiva === "ubicacionTecnicos" ? "h-full" : "max-w-6xl mx-auto"}>
              {pestanaActiva === "dashboard" && (
                <DashboardPage onNavegar={navegarA} puedeConfiguracion={puedeConfiguracion} puedeVentas={puedeVentas} puedeProductos={puedeProductos} />
              )}
              {pestanaActiva === "venta" && puedeVentas && <PuntoDeVentaPage />}
              {pestanaActiva === "caja" && puedeCaja && <CajaPage />}
              {pestanaActiva === "productos" && puedeProductos && <ProductosPage />}
              {pestanaActiva === "metraje" && puedeInventario && <MetrajePage />}
              {pestanaActiva === "clientes" && puedeClientes && <ClientesPage />}
              {pestanaActiva === "facturas" && puedeVentas && (
                <FacturasPage
                  onIrANotaCredito={(facturaId) => {
                    setFacturaIdParaNotaCredito(facturaId);
                    navegarA("notasCredito");
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
              {pestanaActiva === "egresosBodega" && puedeProductos && <EgresosBodegaPage />}
              {pestanaActiva === "proveedores" && puedeProveedores && <ProveedoresPage />}
              {pestanaActiva === "categorias" && puedeProductos && <CategoriasPage />}
              {pestanaActiva === "tiposPrecio" && esAdmin && <TiposPrecioPage />}
              {pestanaActiva === "cuentasBancarias" && esAdmin && <CuentasBancariasPage />}
              {pestanaActiva === "bancos" && esAdmin && <BancosPage />}
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
              {pestanaActiva === "ats" && puedeContabilidad && <AtsPage />}
              {pestanaActiva === "empleados" && puedeNomina && <EmpleadosPage />}
              {pestanaActiva === "nomina" && puedeNomina && <NominaPage />}
              {pestanaActiva === "vehiculos" && puedeVehiculos && <VehiculosPage />}
              {pestanaActiva === "reporteCombustible" && puedeVehiculos && <ReporteCombustiblePage />}
              {pestanaActiva === "visitas" && mostrarVisitas && <VisitasPage />}
              {pestanaActiva === "historialVisitas" && puedeVisitas && <HistorialVisitasPage />}
              {pestanaActiva === "mikrotik" && puedeMikrotik && <MikrotikPage />}
              {pestanaActiva === "planesInternet" && puedeMikrotik && <PlanesInternetPage />}
              {pestanaActiva === "promociones" && puedeMikrotik && <PromocionesPage />}
              {pestanaActiva === "nodos" && puedeMikrotik && <NodosPage />}
              {pestanaActiva === "olts" && puedeOlt && <OltsPage />}
              {pestanaActiva === "redFisica" && puedeRedFisica && <RedFisicaPage />}
              {pestanaActiva === "mapaRed" && puedeMapaRed && <MapaRedPage />}
              {pestanaActiva === "ubicacionTecnicos" && puedeUbicacionTecnicos && <LocalizacionTecnicosPage />}
              {pestanaActiva === "centroControl" && puedeCentroControl && <CentroControlPage />}
              {pestanaActiva === "tickets" && puedeTickets && <TicketsPage />}
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
