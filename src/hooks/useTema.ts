import { useEffect, useState } from "react";

export type Tema = "claro" | "oscuro";

const CLAVE_LOCALSTORAGE = "tema";

function leerTemaInicial(): Tema {
  const guardado = localStorage.getItem(CLAVE_LOCALSTORAGE);
  if (guardado === "claro" || guardado === "oscuro") return guardado;
  // Sin preferencia guardada todavía: partimos de la que ya tiene el sistema operativo.
  const prefiereOscuro = window.matchMedia("(prefers-color-scheme: dark)").matches;
  return prefiereOscuro ? "oscuro" : "claro";
}

// Controla la clase ".dark" en <html> (lo que activa las variantes "dark:"
// de Tailwind, ver index.css) y recuerda la elección del usuario para la
// próxima vez que abra la app.
export function useTema() {
  const [tema, setTema] = useState<Tema>(leerTemaInicial);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", tema === "oscuro");
    localStorage.setItem(CLAVE_LOCALSTORAGE, tema);
  }, [tema]);

  function alternarTema() {
    setTema((actual) => (actual === "oscuro" ? "claro" : "oscuro"));
  }

  return { tema, alternarTema };
}
