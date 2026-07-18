// Buscador dinámico de Reportes: interpreta frases sencillas en español
// ("clientes que no pagaron julio", "ventas de marzo") sin usar ninguna IA —
// solo reconoce palabras clave contra un vocabulario fijo. Si la frase no
// calza con ninguno de los patrones de abajo, devuelve null y la pantalla
// muestra un mensaje de "no entendí" en vez de inventar un resultado.
//
// El vocabulario tiene dos capas: los patrones "de fábrica" de acá abajo, y
// las palabras que el admin agrega a mano desde Ajustes → "Diccionario del
// buscador" (ver SinonimoBusqueda en schema.prisma) — así, cuando alguien
// pregunta de una forma que el sistema no reconoce, no hace falta pedir un
// cambio de código: el admin la agrega él mismo y queda aprendida para
// siempre. Las categorías (CategoriaSinonimo) son fijas a propósito — el
// admin no inventa categorías nuevas, solo agrega palabras a las que ya
// existen.
const MESES: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

export type CategoriaSinonimo = "ACTIVOS" | "SUSPENDIDOS" | "PAGARON" | "NO_PAGARON" | "VENTAS" | "CLIENTES";

export interface SinonimoBusqueda {
  id: number;
  categoria: CategoriaSinonimo;
  palabra: string;
}

export type ResultadoBusqueda =
  | { tipo: "clientes-internet-por-mes"; anio: number; mes: number; estado: "pagaron" | "no-pagaron" }
  | { tipo: "ventas-por-mes"; anio: number; mes: number }
  | { tipo: "clientes-por-estado"; estado: "activos" | "suspendidos" };

function sinTildes(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Patrones de fábrica: cada uno ya cubre varias formas comunes de decir lo
// mismo (ej. "suspendidos"/"cortados"/"sin servicio"). Las palabras que
// agrega el admin se suman a esto, no lo reemplazan — nunca se puede
// "desaprender" una palabra de fábrica desde la pantalla de Ajustes.
const PATRONES_DE_FABRICA: Record<CategoriaSinonimo, RegExp> = {
  CLIENTES: /client/,
  SUSPENDIDOS: /suspend|cortad|sin\s*servicio/,
  ACTIVOS: /activ|con\s*servicio|en\s*linea/,
  NO_PAGARON: /no\s*pag/,
  PAGARON: /\bpag/,
  VENTAS: /venta/,
};

function coincideCategoria(texto: string, categoria: CategoriaSinonimo, personalizados: SinonimoBusqueda[]): boolean {
  if (PATRONES_DE_FABRICA[categoria].test(texto)) return true;
  return personalizados.some((s) => s.categoria === categoria && texto.includes(sinTildes(s.palabra.toLowerCase())));
}

export function interpretarBusqueda(textoOriginal: string, personalizados: SinonimoBusqueda[] = []): ResultadoBusqueda | null {
  const texto = sinTildes(textoOriginal.toLowerCase().trim());
  if (!texto) return null;

  const coincide = (categoria: CategoriaSinonimo) => coincideCategoria(texto, categoria, personalizados);

  const mencionaClientes = coincide("CLIENTES");

  // Estado EN VIVO (activo/suspendido ahora mismo) — se revisa antes que
  // nada porque, a diferencia de los demás patrones, no lleva mes.
  const mencionaSuspendidos = coincide("SUSPENDIDOS");
  const mencionaActivos = coincide("ACTIVOS");
  if (mencionaClientes && (mencionaSuspendidos || mencionaActivos)) {
    return { tipo: "clientes-por-estado", estado: mencionaSuspendidos ? "suspendidos" : "activos" };
  }

  // De acá para abajo, todos los patrones que quedan necesitan un mes.
  let mesDetectado: number | null = null;
  for (const [nombre, numero] of Object.entries(MESES)) {
    if (texto.includes(nombre)) {
      mesDetectado = numero;
      break;
    }
  }
  if (mesDetectado === null) return null;

  // Año explícito ("julio 2025"); si no se menciona, se asume el año actual
  // — salvo que el mes mencionado todavía no haya llegado este año, en cuyo
  // caso lo más probable es que se refiera al año pasado (ej. decir
  // "diciembre" en marzo casi seguro es el diciembre anterior).
  const matchAnio = texto.match(/\b(20\d{2})\b/);
  const hoy = new Date();
  let anio = matchAnio ? Number(matchAnio[1]) : hoy.getFullYear();
  if (!matchAnio && mesDetectado > hoy.getMonth() + 1) {
    anio -= 1;
  }

  const mencionaNoPagaron = coincide("NO_PAGARON");
  const mencionaPagaron = coincide("PAGARON");
  const mencionaVentas = coincide("VENTAS");

  if (mencionaClientes && (mencionaNoPagaron || mencionaPagaron)) {
    return { tipo: "clientes-internet-por-mes", anio, mes: mesDetectado, estado: mencionaNoPagaron ? "no-pagaron" : "pagaron" };
  }

  if (mencionaVentas) {
    return { tipo: "ventas-por-mes", anio, mes: mesDetectado };
  }

  return null;
}

export const EJEMPLOS_BUSQUEDA = [
  "clientes que no pagaron julio",
  "clientes que pagaron marzo",
  "clientes suspendidos",
  "clientes activos",
  "ventas de junio",
];

export const CATEGORIAS_SINONIMO: { valor: CategoriaSinonimo; etiqueta: string }[] = [
  { valor: "ACTIVOS", etiqueta: "Clientes activos" },
  { valor: "SUSPENDIDOS", etiqueta: "Clientes suspendidos" },
  { valor: "PAGARON", etiqueta: "Clientes que pagaron" },
  { valor: "NO_PAGARON", etiqueta: "Clientes que no pagaron" },
  { valor: "VENTAS", etiqueta: "Ventas" },
  { valor: "CLIENTES", etiqueta: "Palabra \"clientes\" (para cualquiera de las anteriores)" },
];
