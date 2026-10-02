import { useState } from "react";
import { MapPin, Users, Car, User } from "lucide-react";
import { AuthContext } from "./context/AuthContext";
import { BotonTema } from "./components/BotonTema";
import { MarcaAmbross, FONDO_CUADRICULA } from "./components/MarcaAmbross";
import { ToastProvider } from "./components/ToastProvider";
import { ConfirmProvider } from "./components/ConfirmProvider";
import { SeccionMiRuta } from "./components/SeccionMiRuta";
import { ClienteMovil } from "./pages/movil/ClienteMovil";
import { VehiculoMovil } from "./pages/movil/VehiculoMovil";
import { YoMovil } from "./pages/movil/YoMovil";
import { useUbicacionTecnico } from "./hooks/useUbicacionTecnico";
import type { Tema } from "./hooks/useTema";
import type { UsuarioAutenticado, EmpresaResumen } from "./api/client";

type PantallaMovil = "ruta" | "cliente" | "vehiculo" | "yo";

// Shell móvil, mínimo, de una sola columna — se monta en lugar del shell de
// escritorio cuando el usuario logueado es un técnico de campo (ver
// utils/modoCampo.ts y App.tsx). Misma app, misma auth, mismo api/client,
// misma cola offline: solo cambia el "chrome". A propósito SIN position:fixed
// (layout flex-column con h-[100dvh]) por la nota de memoria sobre overlays
// fixed que a veces no pintan.
export function AppMovil({
  usuario,
  empresa,
  tema,
  alternarTema,
  onCerrarSesion,
}: {
  usuario: UsuarioAutenticado;
  empresa: EmpresaResumen | null;
  tema: Tema;
  alternarTema: () => void;
  onCerrarSesion: () => void;
}) {
  const [pantalla, setPantalla] = useState<PantallaMovil>("ruta");

  // Se monta acá (shell completo), no dentro de una pantalla puntual, para
  // que siga reportando la posición sin importar en qué pestaña esté parado
  // el técnico — ver hooks/useUbicacionTecnico.ts.
  useUbicacionTecnico(usuario.empleadoId != null);

  const tabs: { clave: PantallaMovil; etiqueta: string; icono: typeof MapPin }[] = [
    { clave: "ruta", etiqueta: "Mi ruta", icono: MapPin },
    { clave: "cliente", etiqueta: "Clientes", icono: Users },
    { clave: "vehiculo", etiqueta: "Vehículo", icono: Car },
    { clave: "yo", etiqueta: "Yo", icono: User },
  ];

  return (
    <ToastProvider>
      <ConfirmProvider>
        <AuthContext.Provider value={usuario}>
          <div className="flex flex-col h-[100dvh] bg-stone-100 dark:bg-gray-950">
            <header
              className="bg-brand-900 text-white px-4 py-3 flex justify-between items-center shrink-0"
              style={FONDO_CUADRICULA}
            >
              <div className="min-w-0">
                <h1>
                  <MarcaAmbross compacta />
                </h1>
                {empresa && (
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.15em] text-brand-300 truncate">
                    {empresa.nombre}
                  </p>
                )}
              </div>
              <BotonTema
                tema={tema}
                onAlternar={alternarTema}
                className="text-brand-200 hover:text-white hover:bg-white/10 p-2 rounded-sm shrink-0"
              />
            </header>

            <main className="flex-1 overflow-y-auto p-3">
              {pantalla === "ruta" && <SeccionMiRuta compacto />}
              {pantalla === "cliente" && <ClienteMovil />}
              {pantalla === "vehiculo" && <VehiculoMovil />}
              {pantalla === "yo" && (
                <YoMovil
                  nombreUsuario={usuario.nombre}
                  empresaId={empresa ? String(empresa.id) : ""}
                  compartiendoUbicacion={usuario.empleadoId != null}
                  onCerrarSesion={onCerrarSesion}
                />
              )}
            </main>

            <nav className="shrink-0 border-t border-stone-200 dark:border-gray-800 bg-white dark:bg-gray-900 grid grid-cols-4">
              {tabs.map(({ clave, etiqueta, icono: Icono }) => {
                const activa = pantalla === clave;
                return (
                  <button
                    key={clave}
                    onClick={() => setPantalla(clave)}
                    className={`flex flex-col items-center gap-1 pt-2 pb-2.5 border-t-2 -mt-px font-mono text-[10px] uppercase tracking-wider ${
                      activa
                        ? "border-brand-600 text-brand-700 dark:text-brand-300"
                        : "border-transparent text-gray-400 dark:text-gray-500"
                    }`}
                  >
                    <Icono className="w-5 h-5" strokeWidth={activa ? 2.25 : 1.75} />
                    {etiqueta}
                  </button>
                );
              })}
            </nav>
          </div>
        </AuthContext.Provider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
