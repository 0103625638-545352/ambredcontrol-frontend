import { useEffect, useState } from "react";

// Retrasa la actualización de un valor hasta que dejen de llegar cambios
// por "delayMs". Lo usamos en los buscadores: así no disparamos una petición
// al backend en CADA tecla que el usuario escribe, solo cuando hace una
// pausa breve al teclear.
export function useDebounce<T>(valor: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(valor);

  useEffect(() => {
    const temporizador = setTimeout(() => setDebounced(valor), delayMs);
    return () => clearTimeout(temporizador);
  }, [valor, delayMs]);

  return debounced;
}
