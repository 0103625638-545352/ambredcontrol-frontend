import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Modal } from "./Modal";

interface PeticionConfirmacion {
  mensaje: string;
  resolver: (valor: boolean) => void;
}

type ConfirmFn = (mensaje: string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

// Reemplaza window.confirm() con una ventana flotante consistente con el
// resto de la interfaz. Se usa como "await confirmar(mensaje)" — misma idea
// que window.confirm, pero sin bloquear el hilo del navegador.
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [peticion, setPeticion] = useState<PeticionConfirmacion | null>(null);

  const confirmar = useCallback<ConfirmFn>((mensaje) => {
    return new Promise((resolver) => {
      setPeticion({ mensaje, resolver });
    });
  }, []);

  function responder(valor: boolean) {
    peticion?.resolver(valor);
    setPeticion(null);
  }

  return (
    <ConfirmContext.Provider value={confirmar}>
      {children}
      {peticion && (
        <Modal titulo="Confirmar" onCerrar={() => responder(false)}>
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-5 whitespace-pre-line">{peticion.mensaje}</p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => responder(false)}
              className="px-4 py-1.5 rounded-sm border border-stone-300 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-stone-50 dark:hover:bg-gray-700"
            >
              Cancelar
            </button>
            <button
              onClick={() => responder(true)}
              className="px-4 py-1.5 rounded-sm text-sm font-semibold bg-red-700 text-white hover:bg-red-800"
            >
              Confirmar
            </button>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const contexto = useContext(ConfirmContext);
  if (!contexto) throw new Error("useConfirm debe usarse dentro de <ConfirmProvider>");
  return contexto;
}
