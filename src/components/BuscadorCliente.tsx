import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type Cliente } from "../api/client";
import { useDebounce } from "../hooks/useDebounce";
import { ModalNuevoCliente } from "./ModalNuevoCliente";

interface Props {
  clienteId: number | "";
  // El segundo parámetro (cliente completo) es opcional: la mayoría de las
  // pantallas solo necesita el id, pero el Punto de Venta y Proformas lo usan
  // para saber el tipoCliente (minorista/mayorista) y estimar el precio en
  // pantalla sin pedirlo aparte al backend.
  onSeleccionar: (id: number | "", cliente?: Cliente) => void;
}

// Reemplaza el <select> con TODOS los clientes cargados de una vez por un
// buscador dinámico (por nombre, cédula o RUC) — con el catálogo de clientes
// creciendo, un <select> gigante se vuelve inmanejable en el mostrador.
// Si la búsqueda no encuentra a nadie, ofrece crear el cliente ahí mismo
// en una ventana flotante, sin perder lo que ya se armó en el carrito.
export function BuscadorCliente({ clienteId, onSeleccionar }: Props) {
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);
  const textoDebounced = useDebounce(texto);
  const contenedorRef = useRef<HTMLDivElement>(null);

  const { data: resultados, isFetching } = useQuery({
    queryKey: ["clientes-buscador", textoDebounced],
    queryFn: async () => (await api.get<Cliente[]>("/clientes", { params: { q: textoDebounced } })).data,
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

  // Si algo externo resetea el clienteId (ej. tras confirmar la venta), refleja el estado acá también.
  useEffect(() => {
    if (clienteId === "" && clienteSeleccionado) {
      setClienteSeleccionado(null);
    }
  }, [clienteId, clienteSeleccionado]);

  function seleccionar(cliente: Cliente) {
    setClienteSeleccionado(cliente);
    setTexto("");
    setAbierto(false);
    onSeleccionar(cliente.id, cliente);
  }

  return (
    <div ref={contenedorRef} className="relative mb-3">
      {clienteSeleccionado ? (
        <div className="flex items-center justify-between border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-md px-3 py-2">
          <div>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{clienteSeleccionado.razonSocial}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{clienteSeleccionado.identificacion}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setClienteSeleccionado(null);
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
            placeholder="Buscar cliente por nombre, cédula o RUC..."
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setAbierto(true);
            }}
            onFocus={() => setAbierto(true)}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm w-full"
          />
          {abierto && textoDebounced.trim().length >= 2 && (
            <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg max-h-56 overflow-y-auto">
              {isFetching && <p className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">Buscando...</p>}
              {!isFetching && resultados?.length === 0 && (
                <div className="px-3 py-2">
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
                    Sin resultados para "{textoDebounced}"
                  </p>
                  <button
                    type="button"
                    onClick={() => setMostrarModal(true)}
                    className="w-full bg-emerald-600 text-white text-xs font-medium py-1.5 rounded-md hover:bg-emerald-700"
                  >
                    + Nuevo cliente
                  </button>
                </div>
              )}
              {resultados?.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => seleccionar(c)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                >
                  <p className="text-gray-800 dark:text-gray-100">{c.razonSocial}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{c.identificacion}</p>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {mostrarModal && (
        <ModalNuevoCliente
          identificacionInicial={textoDebounced.trim()}
          onCerrar={() => setMostrarModal(false)}
          onCreado={(cliente) => {
            setMostrarModal(false);
            seleccionar(cliente);
          }}
        />
      )}
    </div>
  );
}
