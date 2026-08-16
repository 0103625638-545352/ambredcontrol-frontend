import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../api/client";

interface Props {
  onExito: () => void;
  // Cuando viene de un reseteo, "la actual" es la temporal que le dieron —
  // el texto del campo cambia para que quede claro qué hay que escribir ahí.
  esCambioObligatorio?: boolean;
}

// Formulario compartido por los dos flujos: el cambio OBLIGATORIO tras un
// reseteo (ver CambiarPasswordObligatorioPage.tsx) y el cambio VOLUNTARIO
// desde el encabezado (ver App.tsx) — ambos pegan al mismo
// POST /auth/cambiar-password.
export function FormularioCambiarPassword({ onExito, esCambioObligatorio }: Props) {
  const [passwordActual, setPasswordActual] = useState("");
  const [passwordNueva, setPasswordNueva] = useState("");
  const [passwordConfirmar, setPasswordConfirmar] = useState("");
  const [error, setError] = useState<string | null>(null);

  const cambiarPassword = useMutation({
    mutationFn: async () => api.post("/auth/cambiar-password", { passwordActual, passwordNueva }),
    onSuccess: () => onExito(),
    onError: (err: any) => setError(err.response?.data?.error ?? "Error al cambiar la contraseña"),
  });

  function manejarSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (passwordNueva.length < 8) {
      setError("La contraseña nueva debe tener al menos 8 caracteres");
      return;
    }
    if (passwordNueva !== passwordConfirmar) {
      setError("Las contraseñas nuevas no coinciden");
      return;
    }
    cambiarPassword.mutate();
  }

  return (
    <form onSubmit={manejarSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
          {esCambioObligatorio ? "Contraseña temporal" : "Contraseña actual"}
        </label>
        <input
          type="password"
          required
          value={passwordActual}
          onChange={(e) => setPasswordActual(e.target.value)}
          className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Contraseña nueva</label>
        <input
          type="password"
          required
          value={passwordNueva}
          onChange={(e) => setPasswordNueva(e.target.value)}
          className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Confirmar contraseña nueva</label>
        <input
          type="password"
          required
          value={passwordConfirmar}
          onChange={(e) => setPasswordConfirmar(e.target.value)}
          className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
        />
      </div>
      {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={cambiarPassword.isPending}
        className="w-full bg-brand-600 text-white py-2 rounded-md text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
      >
        {cambiarPassword.isPending ? "Guardando..." : "Cambiar contraseña"}
      </button>
    </form>
  );
}
