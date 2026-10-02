import { useEffect, useRef, useState } from "react";
import { Palette, Check } from "lucide-react";
import { COLORES_TEMA, type ColorTema } from "../hooks/useColorTema";

interface Props {
  colorTema: ColorTema;
  onElegir: (color: ColorTema) => void;
  className?: string;
}

// Selector del color de marca — junto a BotonTema en el header. Un panel
// ".absolute" anclado a este mismo botón (nunca ".fixed": en esta máquina
// los overlays fixed a veces no pintan, ver Modal.tsx/useConfirm()), que se
// cierra solo al hacer click afuera, mismo patrón que BuscadorCliente.tsx.
export function SelectorColor({ colorTema, onElegir, className = "" }: Props) {
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function manejarClickAfuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    }
    document.addEventListener("mousedown", manejarClickAfuera);
    return () => document.removeEventListener("mousedown", manejarClickAfuera);
  }, []);

  return (
    <div className="relative" ref={contenedorRef}>
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        title="Elegir color de la aplicación"
        aria-label="Elegir color de la aplicación"
        className={className}
      >
        <Palette strokeWidth={1.75} className="w-4 h-4" />
      </button>
      {abierto && (
        <div className="absolute right-0 z-20 mt-2 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg p-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 px-1 pb-1.5">Color de la app</p>
          <div className="grid grid-cols-3 gap-1.5">
            {COLORES_TEMA.map((c) => (
              <button
                key={c.valor}
                type="button"
                onClick={() => {
                  onElegir(c.valor);
                  setAbierto(false);
                }}
                title={c.etiqueta}
                className="flex flex-col items-center gap-1 p-1.5 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center shadow-sm"
                  style={{ backgroundColor: c.swatch }}
                >
                  {colorTema === c.valor && <Check strokeWidth={3} className="w-3.5 h-3.5 text-white" />}
                </span>
                <span className="text-[10px] text-gray-600 dark:text-gray-300">{c.etiqueta}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
