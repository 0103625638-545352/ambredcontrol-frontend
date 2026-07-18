import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useToast } from "./ToastProvider";
import { useConfirm } from "./ConfirmProvider";
import { CATEGORIAS_SINONIMO, type CategoriaSinonimo, type SinonimoBusqueda } from "../utils/interpretarBusqueda";

// Diccionario editable del "Buscador dinámico" de Reportes — ver
// utils/interpretarBusqueda.ts y BuscadorReportes.tsx. Cada palabra que se
// agrega acá queda disponible de inmediato en el buscador, sin tocar
// código: es la respuesta a "el buscador no entendió tal frase", para no
// tener que pedir un cambio cada vez.
export function DiccionarioBuscador() {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const confirmar = useConfirm();
  const [categoria, setCategoria] = useState<CategoriaSinonimo>(CATEGORIAS_SINONIMO[0].valor);
  const [palabra, setPalabra] = useState("");

  const { data: sinonimos, isLoading } = useQuery({
    queryKey: ["sinonimos-busqueda"],
    queryFn: async () => (await api.get<SinonimoBusqueda[]>("/sinonimos-busqueda")).data,
  });

  const agregar = useMutation({
    mutationFn: async () => api.post("/sinonimos-busqueda", { categoria, palabra }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sinonimos-busqueda"] });
      setPalabra("");
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al agregar la palabra"),
  });

  const eliminar = useMutation({
    mutationFn: async (id: number) => api.delete(`/sinonimos-busqueda/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sinonimos-busqueda"] }),
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al eliminar la palabra"),
  });

  async function confirmarEliminar(s: SinonimoBusqueda) {
    const ok = await confirmar(`¿Dejar de reconocer "${s.palabra}"? El buscador ya no la va a entender.`);
    if (ok) eliminar.mutate(s.id);
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-5 max-w-lg mt-4">
      <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">Diccionario del buscador</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Palabras adicionales que el "Buscador dinámico" de Reportes reconoce, más allá de las que ya trae de fábrica
        (ej. si alguien pregunta "sin señal" y quieres que cuente como "suspendidos"). No es inteligencia artificial
        — es una lista de palabras exactas que se comparan contra lo que se escribe o dicta.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (palabra.trim()) agregar.mutate();
        }}
        className="flex flex-wrap items-end gap-2 mb-4"
      >
        <div>
          <label className="block text-[10px] text-gray-500 dark:text-gray-400 mb-1">Categoría</label>
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value as CategoriaSinonimo)}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1.5 text-sm"
          >
            {CATEGORIAS_SINONIMO.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.etiqueta}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-[10px] text-gray-500 dark:text-gray-400 mb-1">Palabra o frase</label>
          <input
            type="text"
            value={palabra}
            onChange={(e) => setPalabra(e.target.value)}
            placeholder="ej. sin señal"
            className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1.5 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={agregar.isPending || !palabra.trim()}
          className="bg-emerald-600 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
        >
          {agregar.isPending ? "Agregando..." : "Agregar"}
        </button>
      </form>

      {isLoading && <p className="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>}
      {sinonimos && sinonimos.length === 0 && (
        <p className="text-sm text-gray-400 dark:text-gray-500">
          Todavía no se agregó ninguna palabra — el buscador solo usa su vocabulario de fábrica.
        </p>
      )}
      {sinonimos && sinonimos.length > 0 && (
        <div className="space-y-3">
          {CATEGORIAS_SINONIMO.map((c) => {
            const palabras = sinonimos.filter((s) => s.categoria === c.valor);
            if (palabras.length === 0) return null;
            return (
              <div key={c.valor}>
                <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{c.etiqueta}</p>
                <div className="flex flex-wrap gap-1.5">
                  {palabras.map((s) => (
                    <span
                      key={s.id}
                      className="inline-flex items-center gap-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs px-2 py-1 rounded-full"
                    >
                      {s.palabra}
                      <button
                        type="button"
                        onClick={() => confirmarEliminar(s)}
                        className="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                        title="Eliminar"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
