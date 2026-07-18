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
        className={`flex items-center justify-center rounded-md bg-gray-100 dark:bg-gray-700 text-gray-300 dark:text-gray-500 shrink-0 ${className}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-1/2 h-1/2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
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
