import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

interface Props {
  titulo: string;
  onCerrar: () => void;
  children: ReactNode;
  ancho?: string; // clase de max-width, ej. "max-w-md" (default) o "max-w-3xl"
  accionExtra?: ReactNode; // ej. un botón "Exportar a Excel", entre el título y el botón de cerrar
}

// Ventana flotante genérica (overlay + panel + botón cerrar + Escape para
// cerrar). Los modales de creación de cliente/proveedor tienen su propia
// copia de este "chrome" (se escribieron antes de que hiciera falta un
// tercer caso) — este wrapper es para los modales de historial, que sí
// comparten exactamente la misma estructura entre sí.
export function Modal({ titulo, onCerrar, children, ancho = "max-w-md", accionExtra }: Props) {
  useEffect(() => {
    function manejarEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    document.addEventListener("keydown", manejarEscape);
    return () => document.removeEventListener("keydown", manejarEscape);
  }, [onCerrar]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onCerrar}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 shadow-lg w-full ${ancho} max-h-[85vh] overflow-y-auto`}
      >
        <div className="flex justify-between items-center gap-3 px-5 py-3.5 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2.5">
            <span className="w-1 h-4 rounded-full bg-brand-600 shrink-0" aria-hidden="true" />
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">{titulo}</h3>
          </div>
          <div className="flex items-center gap-3">
            {accionExtra}
            <button
              onClick={onCerrar}
              aria-label="Cerrar"
              className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="w-5 h-5" strokeWidth={1.75} />
            </button>
          </div>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
