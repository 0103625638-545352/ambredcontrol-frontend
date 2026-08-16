import { Sun, Moon } from "lucide-react";
import type { Tema } from "../hooks/useTema";

interface Props {
  tema: Tema;
  onAlternar: () => void;
  className?: string;
}

// Botón para alternar modo claro/oscuro. Íconos en SVG (no emoji) para que
// se vean nítidos y consistentes en cualquier sistema.
export function BotonTema({ tema, onAlternar, className = "" }: Props) {
  const esOscuro = tema === "oscuro";
  return (
    <button
      type="button"
      onClick={onAlternar}
      title={esOscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      aria-label={esOscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      className={className}
    >
      {esOscuro ? <Sun strokeWidth={2} className="w-4 h-4" /> : <Moon strokeWidth={2} className="w-4 h-4" />}
    </button>
  );
}
