import { FormularioCambiarPassword } from "../components/FormularioCambiarPassword";

interface Props {
  nombreUsuario: string;
  onCambiada: () => void;
}

// Pantalla completa y SIN forma de saltarla — se muestra en vez de todo el
// resto del sistema mientras usuario.debeCambiarPassword sea true (ver
// App.tsx), típicamente justo después de que un admin le reseteó la
// contraseña a alguien (ver el botón "Resetear contraseña" en UsuariosPage.tsx).
export function CambiarPasswordObligatorioPage({ nombreUsuario, onCambiada }: Props) {
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950 flex items-center justify-center py-8">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 w-full max-w-sm">
        <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-1 text-center">
          Cambia tu contraseña
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-6">
          Hola {nombreUsuario} — un administrador reseteó tu contraseña. Elige una nueva para continuar.
        </p>
        <FormularioCambiarPassword esCambioObligatorio onExito={onCambiada} />
      </div>
    </div>
  );
}
