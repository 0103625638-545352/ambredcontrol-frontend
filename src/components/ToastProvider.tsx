import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { registrarNotificadorError } from "../api/client";

type TipoToast = "error" | "success" | "info";
interface ToastItem {
  id: number;
  mensaje: string;
  tipo: TipoToast;
}

interface ToastContextValor {
  mostrarToast: (mensaje: string, tipo?: TipoToast) => void;
}

const ToastContext = createContext<ToastContextValor | null>(null);

let siguienteId = 1;

const estilosPorTipo: Record<TipoToast, string> = {
  error: "bg-red-600 text-white",
  success: "bg-emerald-600 text-white",
  info: "bg-slate-800 text-white",
};

// Reemplaza los alert()/window.confirm() del navegador — no bloquean el
// hilo de JS y se ven consistentes con el resto de la interfaz. Vive en la
// raíz de la app (ver App.tsx) para que cualquier pantalla pueda llamar a
// useToast() sin volver a montar el proveedor cada vez.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const mostrarToast = useCallback((mensaje: string, tipo: TipoToast = "error") => {
    const id = siguienteId++;
    setToasts((actual) => [...actual, { id, mensaje, tipo }]);
    setTimeout(() => {
      setToasts((actual) => actual.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  // api/client.ts no es un componente de React (no puede usar hooks), pero
  // igual necesita poder avisar errores (ej. "no se pudo abrir el PDF") —
  // se registra acá, una sola vez, como puente hacia este mismo sistema.
  useEffect(() => {
    registrarNotificadorError((mensaje) => mostrarToast(mensaje, "error"));
  }, [mostrarToast]);

  function cerrar(id: number) {
    setToasts((actual) => actual.filter((t) => t.id !== id));
  }

  return (
    <ToastContext.Provider value={{ mostrarToast }}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rounded-md shadow-lg px-4 py-3 text-sm flex items-start justify-between gap-3 pointer-events-auto ${estilosPorTipo[t.tipo]}`}
          >
            <span>{t.mensaje}</span>
            <button onClick={() => cerrar(t.id)} className="opacity-70 hover:opacity-100 text-lg leading-none shrink-0">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const contexto = useContext(ToastContext);
  if (!contexto) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return contexto;
}
