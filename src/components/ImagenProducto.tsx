import { ImageOff } from "lucide-react";
import { urlImagenProducto, type Producto } from "../api/client";

interface Props {
  producto: Producto;
  tamano?: number; // en px, cuadrado
  className?: string;
}

// Miniatura de producto con un placeholder consistente cuando no tiene foto
// (en vez de un <img> roto o un espacio vacío).
export function ImagenProducto({ producto, tamano = 40, className = "" }: Props) {
  const url = urlImagenProducto(producto);
  const estiloTamano = { width: tamano, height: tamano };

  if (!url) {
    return (
      <div
        style={estiloTamano}
        className={`flex items-center justify-center rounded-md bg-stone-100 dark:bg-gray-700 text-gray-300 dark:text-gray-500 shrink-0 ${className}`}
      >
        <ImageOff strokeWidth={1.5} className="w-1/2 h-1/2" />
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={producto.nombre}
      style={estiloTamano}
      className={`rounded-md object-cover shrink-0 ${className}`}
    />
  );
}
