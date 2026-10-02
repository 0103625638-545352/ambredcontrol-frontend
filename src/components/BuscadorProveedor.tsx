import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type Proveedor } from "../api/client";
import { useDebounce } from "../hooks/useDebounce";
import { ModalNuevoProveedor } from "./ModalNuevoProveedor";

interface Props {
  proveedorId: number | "";
  onSeleccionar: (id: number | "") => void;
}

// Igual que BuscadorCliente, pero para proveedores en la pantalla de Compras.
export function BuscadorProveedor({ proveedorId, onSeleccionar }: Props) {
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [proveedorSeleccionado, setProveedorSeleccionado] = useState<Proveedor | null>(null);
  const textoDebounced = useDebounce(texto);
  const contenedorRef = useRef<HTMLDivElement>(null);

  const { data: resultados, isFetching } = useQuery({
    queryKey: ["proveedores-buscador", textoDebounced],
    queryFn: async () => (await api.get<Proveedor[]>("/proveedores", { params: { q: textoDebounced } })).data,
    enabled: textoDebounced.trim().length >= 2,
  });

  useEffect(() => {
    function manejarClickAfuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    }
    document.addEventListener("mousedown", manejarClickAfuera);
    return () => document.removeEventListener("mousedown", manejarClickAfuera);
  }, []);

  useEffect(() => {
    if (proveedorId === "" && proveedorSeleccionado) {
      setProveedorSeleccionado(null);
    }
  }, [proveedorId, proveedorSeleccionado]);

  function seleccionar(proveedor: Proveedor) {
    setProveedorSeleccionado(proveedor);
    setTexto("");
    setAbierto(false);
    onSeleccionar(proveedor.id);
  }

  return (
    <div ref={contenedorRef} className="relative mb-3">
      {proveedorSeleccionado ? (
        <div className="flex items-center justify-between border border-stone-300 dark:border-gray-600 bg-stone-50 dark:bg-gray-700 rounded-md px-3 py-2">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{proveedorSeleccionado.razonSocial}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{proveedorSeleccionado.identificacion}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setProveedorSeleccionado(null);
              onSeleccionar("");
            }}
            className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 text-xs font-medium"
          >
            Cambiar
          </button>
        </div>
      ) : (
        <>
          <input
            type="text"
            placeholder="Buscar proveedor por nombre, cédula o RUC..."
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setAbierto(true);
            }}
            onFocus={() => setAbierto(true)}
            className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm w-full"
          />
          {abierto && textoDebounced.trim().length >= 2 && (
            <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700 rounded-md shadow-lg max-h-56 overflow-y-auto">
              {isFetching && <p className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">Buscando...</p>}
              {!isFetching && resultados?.length === 0 && (
                <div className="px-3 py-2">
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
                    Sin resultados para "{textoDebounced}"
                  </p>
                  <button
                    type="button"
                    onClick={() => setMostrarModal(true)}
                    className="w-full bg-brand-700 text-white text-xs font-semibold py-1.5 rounded-md hover:bg-brand-800"
                  >
                    + Nuevo proveedor
                  </button>
                </div>
              )}
              {resultados?.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => seleccionar(p)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-stone-50 dark:hover:bg-gray-700 border-b border-stone-100 dark:border-gray-700 last:border-b-0"
                >
                  <p className="text-gray-800 dark:text-gray-100">{p.razonSocial}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{p.identificacion}</p>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {mostrarModal && (
        <ModalNuevoProveedor
          identificacionInicial={textoDebounced.trim()}
          onCerrar={() => setMostrarModal(false)}
          onCreado={(proveedor) => {
            setMostrarModal(false);
            seleccionar(proveedor);
          }}
        />
      )}
    </div>
  );
}
