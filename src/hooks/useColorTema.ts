import { useEffect, useState } from "react";

export type ColorTema = "petroleo" | "morado" | "azul" | "verde" | "vino" | "naranja" | "turquesa";

export const COLORES_TEMA: { valor: ColorTema; etiqueta: string; swatch: string }[] = [
  { valor: "petroleo", etiqueta: "Petróleo", swatch: "#1f6f68" },
  { valor: "morado", etiqueta: "Morado", swatch: "#7a2589" },
  { valor: "azul", etiqueta: "Azul", swatch: "#2563eb" },
  { valor: "verde", etiqueta: "Verde", swatch: "#059669" },
  { valor: "vino", etiqueta: "Vino", swatch: "#b8244a" },
  { valor: "naranja", etiqueta: "Naranja", swatch: "#ea580c" },
  { valor: "turquesa", etiqueta: "Turquesa", swatch: "#0d9488" },
];

const CLAVE_LOCALSTORAGE = "colorTema";
// "Petróleo" es el nuevo look por defecto del sistema (2026-09) — quien ya
// tenía "morado" guardado en su navegador lo sigue viendo igual, porque
// sigue siendo un valor válido con su propio override en index.css.
const COLOR_POR_DEFECTO: ColorTema = "petroleo";

function leerColorTemaInicial(): ColorTema {
  const guardado = localStorage.getItem(CLAVE_LOCALSTORAGE);
  return COLORES_TEMA.some((c) => c.valor === guardado) ? (guardado as ColorTema) : COLOR_POR_DEFECTO;
}

// Controla el atributo "data-color-tema" en <html> (ver los overrides de
// --color-brand-* en index.css) y recuerda la elección del usuario para la
// próxima vez que abra la app — mismo mecanismo que useTema.ts, pero para el
// color de marca en vez de claro/oscuro.
export function useColorTema() {
  const [colorTema, setColorTema] = useState<ColorTema>(leerColorTemaInicial);

  useEffect(() => {
    if (colorTema === COLOR_POR_DEFECTO) {
      document.documentElement.removeAttribute("data-color-tema");
    } else {
      document.documentElement.setAttribute("data-color-tema", colorTema);
    }
    localStorage.setItem(CLAVE_LOCALSTORAGE, colorTema);
  }, [colorTema]);

  return { colorTema, setColorTema };
}
