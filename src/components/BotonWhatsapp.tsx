import { MessageCircle } from "lucide-react";
import { enlaceWhatsapp } from "../utils/whatsapp";

interface Props {
  telefono?: string | null;
  mensaje?: string;
  titulo?: string;
  className?: string;
  // Cuando es true, se muestra como texto+ícono (para filas de tabla,
  // acciones); cuando es false, solo el ícono (para lugares angostos).
  conTexto?: boolean;
}

// Enlace "click to chat" de WhatsApp — no manda nada por sí solo, abre el
// WhatsApp del usuario con el número y el mensaje ya escritos, listo para
// que la persona lo revise y lo mande. Ver frontend/src/utils/whatsapp.ts.
export function BotonWhatsapp({ telefono, mensaje, titulo = "Escribir por WhatsApp", className = "", conTexto = false }: Props) {
  const enlace = telefono ? enlaceWhatsapp(telefono, mensaje) : null;
  if (!enlace) return null;

  return (
    <a
      href={enlace}
      target="_blank"
      rel="noopener noreferrer"
      title={titulo}
      aria-label={titulo}
      className={
        className ||
        `inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 hover:underline text-xs font-medium`
      }
    >
      <MessageCircle strokeWidth={1.75} className="w-3.5 h-3.5" />
      {conTexto && "WhatsApp"}
    </a>
  );
}
