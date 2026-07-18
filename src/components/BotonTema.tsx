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
      {esOscuro ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
        </svg>
      )}
    </button>
  );
}
