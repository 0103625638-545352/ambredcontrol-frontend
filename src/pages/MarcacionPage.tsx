import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type EmpresaResumen } from "../api/client";
import { useTema } from "../hooks/useTema";
import { BotonTema } from "../components/BotonTema";
import { FormularioMarcacion } from "../components/FormularioMarcacion";

interface Props {
  // Viene de la URL (/marcar/:empresaId) para un link fijo tipo QR pegado
  // en la entrada del local — si no viene, se pregunta (y se recuerda en
  // localStorage para la próxima visita desde el mismo celular).
  empresaIdInicial: string | null;
}

const CLAVE_EMPRESA_MARCACION = "marcacion_empresaId";

export function MarcacionPage({ empresaIdInicial }: Props) {
  const { tema, alternarTema } = useTema();
  const [empresaId, setEmpresaId] = useState<string | null>(
    empresaIdInicial || localStorage.getItem(CLAVE_EMPRESA_MARCACION)
  );

  const { data: empresas } = useQuery({
    queryKey: ["marcacion-empresas"],
    queryFn: async () => (await api.get<EmpresaResumen[]>("/auth/empresas")).data,
    enabled: !empresaId,
  });

  function elegirEmpresa(id: string) {
    localStorage.setItem(CLAVE_EMPRESA_MARCACION, id);
    setEmpresaId(id);
  }

  function cambiarEmpresa() {
    localStorage.removeItem(CLAVE_EMPRESA_MARCACION);
    setEmpresaId(null);
  }

  return (
    <div className="min-h-screen bg-stone-100 dark:bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-50">Marcación de asistencia</h1>
          <BotonTema
            tema={tema}
            onAlternar={alternarTema}
            className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 p-1.5 rounded-md"
          />
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-sm border border-stone-300 dark:border-gray-700 p-5">
          {!empresaId ? (
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">Selecciona tu empresa</p>
              <div className="space-y-2">
                {empresas?.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => elegirEmpresa(e.id)}
                    className="w-full text-left border border-stone-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:border-sky-500 dark:hover:border-sky-400"
                  >
                    {e.nombre}
                  </button>
                ))}
                {!empresas && <p className="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>}
              </div>
            </div>
          ) : (
            <div>
              <FormularioMarcacion empresaId={empresaId} />
              <button
                onClick={cambiarEmpresa}
                className="w-full text-center text-xs text-gray-400 dark:text-gray-500 hover:underline pt-3"
              >
                Cambiar de empresa
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
