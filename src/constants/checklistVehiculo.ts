import type { UsoVehiculo } from "../api/client";

// Compartido entre pages/movil/VehiculoMovil.tsx (formulario de entrega) y
// pages/VehiculosPage.tsx (reporte impreso) — un solo lugar con las
// etiquetas de cada rubro del checklist de entrega del vehículo (ver
// UsoVehiculo.golpesCarroceria..equiposHerramientas en schema.prisma).
export const CAMPOS_CHECKLIST_ENTREGA: {
  clave: keyof Pick<
    UsoVehiculo,
    "golpesCarroceria" | "vidrios" | "llantas" | "lucesVisibles" | "accesorios" | "llaves" | "documentacion" | "equiposHerramientas"
  >;
  etiqueta: string;
  placeholder: string;
}[] = [
  { clave: "golpesCarroceria", etiqueta: "Golpes / carrocería", placeholder: "Ej. sin novedad, o raspón en puerta trasera derecha" },
  { clave: "vidrios", etiqueta: "Vidrios", placeholder: "Ej. todos en buen estado" },
  { clave: "llantas", etiqueta: "Llantas", placeholder: "Ej. buen estado, o delantera izq. gastada" },
  { clave: "lucesVisibles", etiqueta: "Luces visibles", placeholder: "Ej. todas funcionan" },
  { clave: "accesorios", etiqueta: "Accesorios", placeholder: "Ej. gata, llanta de emergencia, triángulos" },
  { clave: "llaves", etiqueta: "Llaves", placeholder: "Ej. 1 juego completo" },
  { clave: "documentacion", etiqueta: "Documentación", placeholder: "Ej. matrícula y SOAT vigentes" },
  { clave: "equiposHerramientas", etiqueta: "Equipos / herramientas asociados", placeholder: "Ej. caja de herramientas completa" },
];
