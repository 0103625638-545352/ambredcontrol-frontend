import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../api/client";

interface Props {
  empresaId: string;
}

// Intenta obtener la ubicación del celular con un timeout corto — si el
// empleado niega el permiso, no hay GPS, o tarda demasiado, sigue igual SIN
// coordenadas: poder marcar importa más que forzar la ubicación (ver
// Alcance de esta ronda en el plan de Marcaciones — la geocerca es una
// señal, no un bloqueo).
function obtenerUbicacion(): Promise<{ latitud: number; longitud: number } | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) {
      resolve(null);
      return;
    }
    let resuelto = false;
    const terminar = (valor: { latitud: number; longitud: number } | null) => {
      if (resuelto) return;
      resuelto = true;
      resolve(valor);
    };
    const timeoutId = setTimeout(() => terminar(null), 8000);
    navigator.geolocation.getCurrentPosition(
      (posicion) => {
        clearTimeout(timeoutId);
        terminar({ latitud: posicion.coords.latitude, longitud: posicion.coords.longitude });
      },
      () => {
        clearTimeout(timeoutId);
        terminar(null);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });
}

// Formulario de marcación de entrada/salida (cédula + PIN) — compartido
// entre la pantalla pública standalone (pages/MarcacionPage.tsx, para el
// celular del empleado) y el modal accesible desde el encabezado de la app
// ya logueada (components/ModalMarcacion.tsx, para un mostrador/terminal
// compartido). Recibe "empresaId" ya resuelto — a diferencia de
// MarcacionPage, no sabe de dónde salió (URL, localStorage, o la sesión ya
// activa) ni le importa.
export function FormularioMarcacion({ empresaId }: Props) {
  const [cedula, setCedula] = useState("");
  const [pin, setPin] = useState("");
  const [confirmacion, setConfirmacion] = useState<{ tipo: "ENTRADA" | "SALIDA"; hora: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const marcar = useMutation({
    mutationFn: async (tipo: "ENTRADA" | "SALIDA") => {
      const ubicacion = await obtenerUbicacion();
      const respuesta = await api.post("/marcaciones/marcar", {
        empresaId,
        cedula: cedula.trim(),
        pin,
        tipo,
        latitud: ubicacion?.latitud,
        longitud: ubicacion?.longitud,
      });
      return respuesta.data as { tipo: "ENTRADA" | "SALIDA"; hora: string };
    },
    onSuccess: (data) => {
      setConfirmacion(data);
      setError(null);
      setPin("");
    },
    onError: (err: any) => {
      setError(err.response?.data?.error ?? "No se pudo registrar la marcación. Intenta de nuevo.");
      setPin("");
    },
  });

  const formularioValido = cedula.trim().length > 0 && /^\d{4,6}$/.test(pin);

  if (confirmacion) {
    return (
      <div className="text-center py-4">
        <div
          className={`w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center ${
            confirmacion.tipo === "ENTRADA" ? "bg-emerald-100 dark:bg-emerald-900/40" : "bg-sky-100 dark:bg-sky-900/40"
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`w-7 h-7 ${confirmacion.tipo === "ENTRADA" ? "text-emerald-600 dark:text-emerald-400" : "text-sky-600 dark:text-sky-400"}`}
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <p className="text-base font-semibold text-gray-800 dark:text-gray-100">
          {confirmacion.tipo === "ENTRADA" ? "Entrada registrada" : "Salida registrada"}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {new Date(confirmacion.hora).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" })}
        </p>
        <button
          onClick={() => setConfirmacion(null)}
          className="mt-5 w-full bg-slate-800 dark:bg-slate-700 text-white py-2.5 rounded-md text-sm font-medium hover:bg-slate-900 dark:hover:bg-slate-600"
        >
          Marcar otra vez
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Cédula</label>
        <input
          type="text"
          inputMode="numeric"
          value={cedula}
          onChange={(e) => setCedula(e.target.value)}
          className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2.5 text-base"
          placeholder="1710034065"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">PIN</label>
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2.5 text-base tracking-widest"
          placeholder="••••"
        />
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="grid grid-cols-2 gap-3 pt-2">
        <button
          disabled={!formularioValido || marcar.isPending}
          onClick={() => marcar.mutate("ENTRADA")}
          className="bg-emerald-600 text-white py-3 rounded-md text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40"
        >
          {marcar.isPending && marcar.variables === "ENTRADA" ? "..." : "Entrada"}
        </button>
        <button
          disabled={!formularioValido || marcar.isPending}
          onClick={() => marcar.mutate("SALIDA")}
          className="bg-sky-600 text-white py-3 rounded-md text-sm font-semibold hover:bg-sky-700 disabled:opacity-40"
        >
          {marcar.isPending && marcar.variables === "SALIDA" ? "..." : "Salida"}
        </button>
      </div>
    </div>
  );
}
