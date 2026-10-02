import { useState } from "react";
import { Monitor, LogOut, KeyRound, Check, LocateFixed } from "lucide-react";
import { FormularioMarcacion } from "../../components/FormularioMarcacion";
import { FormularioCambiarPassword } from "../../components/FormularioCambiarPassword";
import { useToast } from "../../components/ToastProvider";
import { fijarModo } from "../../utils/modoCampo";

// Pantalla "Yo" del shell móvil: marcar asistencia, cambiar contraseña,
// pasar a la versión completa y cerrar sesión. Los formularios se muestran
// EN FLUJO (no dentro de <Modal>, que usa position:fixed) — ver la nota de
// memoria sobre overlays fixed que a veces no pintan en la máquina del usuario.
export function YoMovil({
  nombreUsuario,
  empresaId,
  compartiendoUbicacion,
  onCerrarSesion,
}: {
  nombreUsuario: string;
  empresaId: string;
  compartiendoUbicacion: boolean;
  onCerrarSesion: () => void;
}) {
  const { mostrarToast } = useToast();
  const [mostrarPassword, setMostrarPassword] = useState(false);

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700 rounded-sm p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-3">
          Marcar asistencia
        </p>
        <FormularioMarcacion empresaId={empresaId} />
      </div>

      <div className="bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700 rounded-sm p-4">
        {!mostrarPassword ? (
          <button
            onClick={() => setMostrarPassword(true)}
            className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200"
          >
            <KeyRound className="w-4 h-4" />
            Cambiar mi contraseña
          </button>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-3">
              Cambiar mi contraseña
            </p>
            <FormularioCambiarPassword
              onExito={() => {
                setMostrarPassword(false);
                mostrarToast("Contraseña actualizada", "success");
              }}
            />
            <button
              onClick={() => setMostrarPassword(false)}
              className="mt-2 text-xs font-medium text-gray-500 dark:text-gray-400"
            >
              Cancelar
            </button>
          </>
        )}
      </div>

      {compartiendoUbicacion && (
        <div className="bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700 rounded-sm p-4 flex items-start gap-2.5">
          <LocateFixed className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0 mt-0.5" />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Mientras tenés la app abierta, se comparte tu ubicación con la empresa para poder dirigir eventos y ubicar el vehículo — se manda
            cada 2 minutos, y se guarda en el celular hasta poder mandarla si no hay señal.
          </p>
        </div>
      )}

      <button
        onClick={() => fijarModo("completo")}
        className="w-full flex items-center justify-center gap-2 bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700 rounded-sm p-3.5 text-sm font-medium text-gray-700 dark:text-gray-200"
      >
        <Monitor className="w-4 h-4" />
        Ver versión completa (escritorio)
      </button>

      <button
        onClick={onCerrarSesion}
        className="w-full flex items-center justify-center gap-2 bg-brand-700 text-white rounded-sm p-3.5 text-sm font-semibold"
      >
        <LogOut className="w-4 h-4" />
        Cerrar sesión
      </button>

      <p className="text-center text-xs text-gray-400 dark:text-gray-600 pt-2 flex items-center justify-center gap-1">
        <Check className="w-3 h-3" /> Sesión de {nombreUsuario}
      </p>
    </div>
  );
}
