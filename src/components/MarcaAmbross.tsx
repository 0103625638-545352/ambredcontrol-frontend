import type { CSSProperties } from "react";

// Marca del sistema ("AmbrossISP" + sello "PYMES"), compartida por el login,
// el encabezado de escritorio y el shell móvil para que se vean iguales.
// Toma el color del texto que la rodea (border-current), así sirve igual
// sobre fondo claro u oscuro.
export function MarcaAmbross({ className = "", compacta = false }: { className?: string; compacta?: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className={`${compacta ? "text-base" : "text-lg"} font-extrabold tracking-tight leading-none`}>
        AmbrossISP
      </span>
      <span className="font-mono text-[10px] tracking-[0.2em] border border-current px-1.5 py-px opacity-70 leading-tight">
        PYMES
      </span>
    </div>
  );
}

// Cuadrícula fina tipo "hoja de cuaderno" para los fondos oscuros de marca
// (panel del login, encabezados) — líneas de 1px, no un degradado de color.
export const FONDO_CUADRICULA: CSSProperties = {
  backgroundImage:
    "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
  backgroundSize: "28px 28px",
};
