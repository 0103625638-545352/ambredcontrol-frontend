import { useState, useEffect, Fragment } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Camera } from "lucide-react";
import { api, abrirPdfEnNuevaPestana, type Producto, type Categoria, type TipoPrecio, type Bodega, type RespuestaPaginada } from "../api/client";
import { usePermiso, useMiSucursal } from "../context/AuthContext";
import { Paginacion } from "../components/Paginacion";
import { ImagenProducto } from "../components/ImagenProducto";
import { HistorialProductoModal } from "../components/HistorialProductoModal";
import { ModalLotesProducto } from "../components/ModalLotesProducto";
import { EscanerCodigoBarras } from "../components/EscanerCodigoBarras";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmProvider";
import { useDebounce } from "../hooks/useDebounce";

const TAMANO_PAGINA = 20;

const TAMANOS_ETIQUETA = [
  { valor: "A4_4X9", etiqueta: "Hoja A4 (4×9)" },
  { valor: "ROLLO_50X25", etiqueta: "Rollo 50×25mm" },
  { valor: "ROLLO_40X30", etiqueta: "Rollo 40×30mm" },
];

function IconoCamara() {
  return <Camera strokeWidth={1.75} className="w-4 h-4" />;
}

export function ProductosPage() {
  const puedeProductos = usePermiso("productos");
  const puedeInventario = usePermiso("inventario");
  const miSucursal = useMiSucursal();
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const confirmar = useConfirm();
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [busqueda, setBusqueda] = useState("");
  const busquedaDebounced = useDebounce(busqueda);

  // Si el usuario cambia lo que busca, siempre volvemos a la página 1 —
  // si nos quedáramos en, digamos, la página 3, podría no haber resultados
  // ahí aunque sí existan en la página 1 de la nueva búsqueda.
  useEffect(() => {
    setPagina(1);
  }, [busquedaDebounced]);

  // Controla qué producto tiene abierto su mini-formulario de "entrada de stock"
  const [productoEntradaId, setProductoEntradaId] = useState<number | null>(null);
  const [entradaForm, setEntradaForm] = useState({ cantidad: "", motivo: "", numeroLote: "", fechaCaducidad: "", bodegaId: "" });

  // Bodegas de la sucursal del usuario — obligatoria para el stock inicial
  // de un producto sin lote y para cada entrada manual de stock.
  const { data: bodegas } = useQuery({
    queryKey: ["bodegas", miSucursal?.id],
    queryFn: async () => (await api.get<Bodega[]>("/bodegas", { params: { sucursalId: miSucursal!.id } })).data,
    enabled: !!miSucursal,
  });

  // Controla qué producto está en modo "edición"
  const [productoEditandoId, setProductoEditandoId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({
    nombre: "",
    codigoBarras: "",
    marca: "",
    modelo: "",
    descripcion: "",
    ivaPorcentaje: "15",
    stockMinimo: "",
    categoriaId: "",
    manejaLotes: false,
    fechaCaducidad: "",
    controlaNumeroSerie: false,
  });

  // Controla si hay un escáner de cámara abierto y para cuál formulario
  // (creación o edición) debe llenar el campo "Código de barras" al detectar uno.
  const [escaneando, setEscaneando] = useState<"crear" | "editar" | null>(null);
  const [imagenEditando, setImagenEditando] = useState<File | null>(null);

  // Controla para cuál producto se está mostrando el modal de historial
  const [productoHistorialId, setProductoHistorialId] = useState<number | null>(null);
  // Controla para cuál producto (perecible) se está mostrando el modal de lotes
  const [productoLotesId, setProductoLotesId] = useState<number | null>(null);

  // Controla el mini-formulario de "cuántas etiquetas imprimir" (código de barras + nombre)
  const [productoEtiquetaId, setProductoEtiquetaId] = useState<number | null>(null);
  const [cantidadEtiquetas, setCantidadEtiquetas] = useState("1");
  const [tamanoEtiqueta, setTamanoEtiqueta] = useState("A4_4X9");

  // useQuery: le pide la lista de productos al backend, y la mantiene
  // en caché. Si algo invalida esta consulta (como crear un producto nuevo),
  // React Query vuelve a pedirla automáticamente.
  // "placeholderData: keepPreviousData" evita el parpadeo de "Cargando..."
  // al cambiar de página: mientras llega la nueva, se ve la anterior.
  const { data: respuesta, isLoading } = useQuery({
    queryKey: ["productos", pagina, busquedaDebounced],
    queryFn: async () =>
      (
        await api.get<RespuestaPaginada<Producto>>("/productos", {
          params: { page: pagina, pageSize: TAMANO_PAGINA, q: busquedaDebounced || undefined },
        })
      ).data,
    placeholderData: keepPreviousData,
  });
  const productos = respuesta?.datos;

  const { data: categorias } = useQuery({
    queryKey: ["categorias"],
    queryFn: async () => (await api.get<Categoria[]>("/categorias")).data,
  });

  // Para mostrar (solo lectura) el precio calculado de cada categoría cuando
  // un producto ya tiene costo — el precio nunca se edita a mano acá, ver
  // utils/precios.ts en el backend.
  const { data: tiposPrecio } = useQuery({
    queryKey: ["tipos-precio"],
    queryFn: async () => (await api.get<TipoPrecio[]>("/tipos-precio")).data,
  });

  const FORM_INICIAL = {
    codigoBarras: "",
    nombre: "",
    marca: "",
    modelo: "",
    descripcion: "",
    ivaPorcentaje: "15",
    stockActual: "0",
    categoriaId: "",
    manejaLotes: false,
    fechaCaducidad: "",
    bodegaId: "",
    controlaNumeroSerie: false,
  };
  const [form, setForm] = useState(FORM_INICIAL);
  const [imagenSeleccionada, setImagenSeleccionada] = useState<File | null>(null);

  // Sube (o reemplaza) la foto de un producto. Va separada de crear/editar
  // porque el backend la recibe como multipart/form-data, no JSON — y para
  // subirla hace falta que el producto ya exista (necesita su id).
  const subirImagenProducto = useMutation({
    mutationFn: async ({ productoId, archivo }: { productoId: number; archivo: File }) => {
      const datosFormulario = new FormData();
      datosFormulario.append("imagen", archivo);
      return api.post(`/productos/${productoId}/imagen`, datosFormulario);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["productos"] });
    },
    onError: (error: any) => {
      mostrarToast(error.response?.data?.error ?? "Error al subir la imagen");
    },
  });

  // useMutation: para operaciones que CAMBIAN datos (crear, editar, borrar),
  // a diferencia de useQuery que es solo para LEER.
  const crearProducto = useMutation({
    mutationFn: async () => {
      return api.post("/productos", {
        codigoBarras: form.codigoBarras.trim() || undefined,
        nombre: form.nombre,
        marca: form.marca.trim() || undefined,
        modelo: form.modelo.trim() || undefined,
        descripcion: form.descripcion || undefined,
        ivaPorcentaje: parseFloat(form.ivaPorcentaje),
        stockActual: parseInt(form.stockActual, 10),
        categoriaId: form.categoriaId ? Number(form.categoriaId) : undefined,
        manejaLotes: form.manejaLotes,
        fechaCaducidad: !form.manejaLotes && form.fechaCaducidad ? form.fechaCaducidad : undefined,
        // Solo hace falta bodega si hay stock inicial (mismo criterio que el backend).
        bodegaId: !form.manejaLotes && parseInt(form.stockActual, 10) > 0 ? Number(form.bodegaId) : undefined,
        controlaNumeroSerie: form.controlaNumeroSerie,
      });
    },
    onSuccess: (respuesta) => {
      // Le decimos a React Query: "la lista de productos ya no es válida,
      // vuelve a pedirla" — así la tabla se actualiza sola sin recargar la página.
      queryClient.invalidateQueries({ queryKey: ["productos"] });
      if (imagenSeleccionada) {
        subirImagenProducto.mutate({ productoId: respuesta.data.id, archivo: imagenSeleccionada });
      }
      setForm(FORM_INICIAL);
      setImagenSeleccionada(null);
      setMostrarFormulario(false);
    },
    onError: (error: any) => {
      mostrarToast(error.response?.data?.error ?? "Error al crear el producto");
    },
  });

  // Registra una ENTRADA de stock (una compra a proveedor), usando la misma
  // ruta /movimientos que ya construimos en el backend en una lección anterior.
  const registrarEntrada = useMutation({
    mutationFn: async ({ productoId, manejaLotes }: { productoId: number; manejaLotes: boolean }) => {
      return api.post("/movimientos", {
        productoId,
        tipo: "ENTRADA",
        cantidad: parseInt(entradaForm.cantidad, 10),
        motivo: entradaForm.motivo || "Compra a proveedor",
        fechaCaducidad: entradaForm.fechaCaducidad || undefined,
        numeroLote: entradaForm.numeroLote || undefined,
        bodegaId: manejaLotes ? undefined : Number(entradaForm.bodegaId),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["productos"] });
      queryClient.invalidateQueries({ queryKey: ["lotes-producto"] });
      setProductoEntradaId(null);
      setEntradaForm({ cantidad: "", motivo: "", numeroLote: "", fechaCaducidad: "", bodegaId: "" });
    },
    onError: (error: any) => {
      mostrarToast(error.response?.data?.error ?? "Error al registrar la entrada");
    },
  });

  // Edita los datos de un producto (nombre, precio, stock mínimo).
  // El "codigo" y el "stockActual" NO se pueden tocar desde aquí a propósito.
  const editarProducto = useMutation({
    mutationFn: async (productoId: number) => {
      return api.put(`/productos/${productoId}`, {
        nombre: editForm.nombre,
        codigoBarras: editForm.codigoBarras.trim() || undefined,
        marca: editForm.marca.trim() || undefined,
        modelo: editForm.modelo.trim() || undefined,
        descripcion: editForm.descripcion || undefined,
        ivaPorcentaje: parseFloat(editForm.ivaPorcentaje),
        stockMinimo: parseInt(editForm.stockMinimo, 10),
        categoriaId: editForm.categoriaId ? Number(editForm.categoriaId) : null,
        manejaLotes: editForm.manejaLotes,
        fechaCaducidad: !editForm.manejaLotes && editForm.fechaCaducidad ? editForm.fechaCaducidad : undefined,
        controlaNumeroSerie: editForm.controlaNumeroSerie,
      });
    },
    onSuccess: (_respuesta, productoId) => {
      queryClient.invalidateQueries({ queryKey: ["productos"] });
      if (imagenEditando) {
        subirImagenProducto.mutate({ productoId, archivo: imagenEditando });
      }
      setProductoEditandoId(null);
      setImagenEditando(null);
    },
    onError: (error: any) => {
      mostrarToast(error.response?.data?.error ?? "Error al editar el producto");
    },
  });

  // Desactiva un producto (borrado suave: deja de aparecer en las listas,
  // pero su historial de facturas y movimientos sigue intacto).
  const desactivarProducto = useMutation({
    mutationFn: async (productoId: number) => api.delete(`/productos/${productoId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["productos"] });
    },
  });

  function abrirEdicion(p: Producto) {
    setProductoEntradaId(null); // cerramos el otro mini-formulario si estaba abierto
    setProductoEtiquetaId(null);
    setEditForm({
      nombre: p.nombre,
      codigoBarras: p.codigoBarras ?? "",
      marca: p.marca ?? "",
      modelo: p.modelo ?? "",
      descripcion: p.descripcion ?? "",
      ivaPorcentaje: p.ivaPorcentaje,
      stockMinimo: String(p.stockMinimo),
      categoriaId: p.categoriaId ? String(p.categoriaId) : "",
      manejaLotes: p.manejaLotes,
      fechaCaducidad: p.fechaCaducidad ? p.fechaCaducidad.slice(0, 10) : "",
      controlaNumeroSerie: p.controlaNumeroSerie ?? false,
    });
    setImagenEditando(null);
    setProductoEditandoId(productoEditandoId === p.id ? null : p.id);
  }

  async function confirmarDesactivar(p: Producto) {
    const ok = await confirmar(`¿Desactivar "${p.nombre}"? Ya no aparecerá en las listas, pero su historial se conserva.`);
    if (ok) desactivarProducto.mutate(p.id);
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Productos</h2>
        {puedeProductos && (
          <button
            onClick={() => setMostrarFormulario(!mostrarFormulario)}
            className="bg-slate-800 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-slate-700"
          >
            {mostrarFormulario ? "Cancelar" : "+ Nuevo producto"}
          </button>
        )}
      </div>

      <input
        type="text"
        placeholder="Buscar por nombre, código o modelo..."
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm w-full mb-4"
      />

      {puedeProductos && mostrarFormulario && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            crearProducto.mutate();
          }}
          className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm mb-4 grid grid-cols-2 gap-3"
        >
          <div className="flex gap-1">
            <input
              placeholder="Código de barras (opcional)"
              value={form.codigoBarras}
              onChange={(e) => setForm({ ...form, codigoBarras: e.target.value })}
              className="flex-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => setEscaneando("crear")}
              title="Escanear con la cámara"
              className="shrink-0 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-md px-2.5 hover:bg-gray-50 dark:hover:bg-gray-600"
            >
              <IconoCamara />
            </button>
          </div>
          <input
            placeholder="Marca (opcional, ej. Mikrotik, TP-Link)"
            value={form.marca}
            onChange={(e) => setForm({ ...form, marca: e.target.value })}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
          />
          <input
            placeholder="Modelo (opcional, ej. RB750Gr3)"
            value={form.modelo}
            onChange={(e) => setForm({ ...form, modelo: e.target.value })}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
          />
          <input
            placeholder="Nombre"
            required
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
          />
          <div className="flex items-center gap-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-md px-3 py-2">
            <input
              type="checkbox"
              id="crear-aplica-iva"
              checked={form.ivaPorcentaje !== "0"}
              onChange={(e) => setForm({ ...form, ivaPorcentaje: e.target.checked ? "15" : "0" })}
            />
            <label htmlFor="crear-aplica-iva" className="text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
              Aplica IVA
            </label>
            {form.ivaPorcentaje !== "0" && (
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={form.ivaPorcentaje}
                onChange={(e) => setForm({ ...form, ivaPorcentaje: e.target.value })}
                className="w-16 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1 text-sm"
              />
            )}
          </div>
          {!form.manejaLotes && (
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Stock inicial (opcional)</label>
              <input
                placeholder="Cantidad de unidades con las que arranca este producto"
                type="number"
                min="0"
                value={form.stockActual}
                onChange={(e) => setForm({ ...form, stockActual: e.target.value })}
                className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
              />
            </div>
          )}
          {!form.manejaLotes && parseInt(form.stockActual, 10) > 0 && (
            <select
              required
              value={form.bodegaId}
              onChange={(e) => setForm({ ...form, bodegaId: e.target.value })}
              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
            >
              <option value="">Bodega del stock inicial...</option>
              {bodegas?.map((b) => (
                <option key={b.id} value={b.id}>{b.nombre}</option>
              ))}
            </select>
          )}
          <select
            value={form.categoriaId}
            onChange={(e) => setForm({ ...form, categoriaId: e.target.value })}
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
          >
            <option value="">Sin categoría</option>
            {categorias?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          <label className="col-span-2 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={form.manejaLotes}
              onChange={(e) => setForm({ ...form, manejaLotes: e.target.checked, stockActual: "0" })}
            />
            Es perecible: manejar por lotes (cada entrada de stock tendrá su propia caducidad)
          </label>
          {form.manejaLotes ? (
            <p className="col-span-2 text-xs text-gray-500 dark:text-gray-400 -mt-2">
              El stock se ingresa después con "+ Stock", asignando un lote y su caducidad.
            </p>
          ) : (
            <div className="col-span-2">
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Fecha de caducidad (opcional)</label>
              <input
                type="date"
                value={form.fechaCaducidad}
                onChange={(e) => setForm({ ...form, fechaCaducidad: e.target.value })}
                className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
              />
            </div>
          )}
          <label className="col-span-2 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={form.controlaNumeroSerie}
              onChange={(e) => setForm({ ...form, controlaNumeroSerie: e.target.checked })}
            />
            Controla número de serie (bodega capturará un serial por cada unidad que entre por Compras)
          </label>
          <textarea
            placeholder="Detalle del producto (opcional)"
            value={form.descripcion}
            onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
            rows={2}
            className="col-span-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm resize-none"
          />
          <div className="col-span-2">
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Imagen (opcional)</label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setImagenSeleccionada(e.target.files?.[0] ?? null)}
              className="text-sm text-gray-700 dark:text-gray-300 w-full"
            />
          </div>
          <button
            type="submit"
            disabled={crearProducto.isPending || (!form.manejaLotes && parseInt(form.stockActual, 10) > 0 && !form.bodegaId)}
            className="col-span-2 bg-brand-600 text-white py-2 rounded-md text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
          >
            {crearProducto.isPending ? "Guardando..." : "Guardar producto"}
          </button>
          {crearProducto.isError && (
            <p className="col-span-2 text-red-600 dark:text-red-400 text-sm">
              Error al guardar. ¿El código ya existe?
            </p>
          )}
        </form>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-gray-600 dark:text-gray-300">
            <tr>
              <th className="px-4 py-2"></th>
              <th className="px-4 py-2">Código</th>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2">Categoría</th>
              <th className="px-4 py-2 text-right">Costo</th>
              <th className="px-4 py-2 text-right">Stock</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">
                  Cargando...
                </td>
              </tr>
            )}
            {!isLoading && productos?.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">
                  {busquedaDebounced ? `Sin resultados para "${busquedaDebounced}"` : "No hay productos"}
                </td>
              </tr>
            )}
            {productos?.map((p) => (
              <Fragment key={p.id}>
                <tr className="border-t border-gray-100 dark:border-gray-700">
                  <td className="px-4 py-2">
                    <ImagenProducto producto={p} tamano={40} />
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{p.codigo}</td>
                  <td className="px-4 py-2">
                    {p.nombre}
                    {(p.marca || p.modelo) && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {[p.marca, p.modelo].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-500 dark:text-gray-400 text-xs">
                    {p.categoria?.nombre ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {p.esServicio ? (
                      // Un servicio no tiene "costo de compra" del que calcular margen — el
                      // precio ya viene fijo (ver precioFijo), así que "Sin costo" acá no es
                      // una alerta real (no bloquea nada), a diferencia de un producto físico.
                      <span className="text-xs text-gray-400 dark:text-gray-500">Servicio (${Number(p.precioFijo ?? 0).toFixed(2)})</span>
                    ) : p.costoPromedioActual ? (
                      `$${Number(p.costoPromedioActual).toFixed(2)}`
                    ) : (
                      <span className="text-xs text-amber-600 dark:text-amber-400">Sin costo</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {p.esServicio ? (
                      <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
                    ) : p.manejaLotes ? (
                      <span className={p.stockActual <= p.stockMinimo ? "text-red-600 dark:text-red-400 font-semibold" : ""}>
                        {p.stockActual}
                      </span>
                    ) : p.stockPorSucursal.length === 0 ? (
                      <span className="text-red-600 dark:text-red-400 font-semibold">0</span>
                    ) : (
                      <span className="text-xs">
                        {p.stockPorSucursal.map((s, i) => (
                          <span key={s.sucursalId} className={s.cantidad <= p.stockMinimo ? "text-red-600 dark:text-red-400 font-semibold" : ""}>
                            {i > 0 && " · "}
                            {s.sucursal.nombre}: {s.cantidad}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right space-x-3">
                    <button
                      onClick={() => setProductoHistorialId(p.id)}
                      className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium"
                    >
                      Historial
                    </button>
                    {p.manejaLotes && (
                      <button
                        onClick={() => setProductoLotesId(p.id)}
                        className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium"
                      >
                        Lotes
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setProductoEntradaId(null);
                        setProductoEditandoId(null);
                        setProductoEtiquetaId(productoEtiquetaId === p.id ? null : p.id);
                      }}
                      className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium"
                    >
                      {productoEtiquetaId === p.id ? "Cancelar" : "Etiquetas"}
                    </button>
                    {puedeProductos && (
                      <>
                        <button
                          onClick={() => abrirEdicion(p)}
                          className="text-slate-700 dark:text-slate-300 hover:underline text-xs font-medium"
                        >
                          {productoEditandoId === p.id ? "Cancelar" : "Editar"}
                        </button>
                        <button
                          onClick={() => confirmarDesactivar(p)}
                          className="text-red-600 dark:text-red-400 hover:underline text-xs font-medium"
                        >
                          Desactivar
                        </button>
                      </>
                    )}
                    {/* Separado de "productos" a propósito: alguien puede administrar el
                        catálogo (crear/editar productos) sin poder tocar el stock — ajustar
                        cantidades es más sensible (puede usarse para inflar/desinflar
                        inventario sin ningún documento de respaldo), así que tiene su
                        propio permiso ("inventario", el mismo que ya exige el backend en
                        POST /movimientos). */}
                    {puedeInventario && (
                      <button
                        onClick={() => {
                          setProductoEditandoId(null);
                          setProductoEtiquetaId(null);
                          setProductoEntradaId(productoEntradaId === p.id ? null : p.id);
                        }}
                        className="text-emerald-700 dark:text-emerald-400 hover:underline text-xs font-medium"
                      >
                        {productoEntradaId === p.id ? "Cancelar" : "+ Stock"}
                      </button>
                    )}
                  </td>
                </tr>

                {productoEditandoId === p.id && (
                  <tr className="bg-slate-50 dark:bg-gray-700/40">
                    <td colSpan={7} className="px-4 py-3">
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          editarProducto.mutate(p.id);
                        }}
                        className="flex flex-wrap items-end gap-2"
                      >
                        <div>
                          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Nombre</label>
                          <input
                            type="text"
                            required
                            autoFocus
                            value={editForm.nombre}
                            onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })}
                            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1 text-sm w-56"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Código de barras</label>
                          <div className="flex gap-1">
                            <input
                              type="text"
                              placeholder="Opcional"
                              value={editForm.codigoBarras}
                              onChange={(e) => setEditForm({ ...editForm, codigoBarras: e.target.value })}
                              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1 text-sm w-40"
                            />
                            <button
                              type="button"
                              onClick={() => setEscaneando("editar")}
                              title="Escanear con la cámara"
                              className="shrink-0 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-md px-2 hover:bg-gray-50 dark:hover:bg-gray-600"
                            >
                              <IconoCamara />
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Marca</label>
                          <input
                            type="text"
                            placeholder="Opcional"
                            value={editForm.marca}
                            onChange={(e) => setEditForm({ ...editForm, marca: e.target.value })}
                            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1 text-sm w-40"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Modelo</label>
                          <input
                            type="text"
                            placeholder="Opcional"
                            value={editForm.modelo}
                            onChange={(e) => setEditForm({ ...editForm, modelo: e.target.value })}
                            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1 text-sm w-40"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                            Precios de venta (calculados, no editables)
                          </label>
                          {!p.costoPromedioActual ? (
                            <p className="text-xs text-amber-600 dark:text-amber-400">
                              Sin costo todavía — se calculan recién después de la primera compra.
                            </p>
                          ) : (
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-300">
                              <span>Costo: ${Number(p.costoPromedioActual).toFixed(2)}</span>
                              {tiposPrecio?.map((tp) => (
                                <span key={tp.id}>
                                  {tp.nombre}: ${(Number(p.costoPromedioActual) * (1 + Number(tp.porcentajeGanancia) / 100)).toFixed(2)}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">IVA</label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              id={`editar-aplica-iva-${p.id}`}
                              checked={editForm.ivaPorcentaje !== "0"}
                              onChange={(e) => setEditForm({ ...editForm, ivaPorcentaje: e.target.checked ? "15" : "0" })}
                            />
                            {editForm.ivaPorcentaje !== "0" && (
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                max="100"
                                value={editForm.ivaPorcentaje}
                                onChange={(e) => setEditForm({ ...editForm, ivaPorcentaje: e.target.value })}
                                className="w-16 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1 text-sm"
                              />
                            )}
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Stock mínimo</label>
                          <input
                            type="number"
                            required
                            value={editForm.stockMinimo}
                            onChange={(e) => setEditForm({ ...editForm, stockMinimo: e.target.value })}
                            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1 text-sm w-24"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Categoría</label>
                          <select
                            value={editForm.categoriaId}
                            onChange={(e) => setEditForm({ ...editForm, categoriaId: e.target.value })}
                            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1 text-sm"
                          >
                            <option value="">Sin categoría</option>
                            {categorias?.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.nombre}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="w-full flex items-center gap-4">
                          <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                            <input
                              type="checkbox"
                              checked={editForm.manejaLotes}
                              onChange={(e) => setEditForm({ ...editForm, manejaLotes: e.target.checked })}
                            />
                            Es perecible (maneja lotes)
                          </label>
                          {!editForm.manejaLotes && (
                            <div>
                              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Fecha de caducidad</label>
                              <input
                                type="date"
                                value={editForm.fechaCaducidad}
                                onChange={(e) => setEditForm({ ...editForm, fechaCaducidad: e.target.value })}
                                className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1 text-sm"
                              />
                            </div>
                          )}
                          <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                            <input
                              type="checkbox"
                              checked={editForm.controlaNumeroSerie}
                              onChange={(e) => setEditForm({ ...editForm, controlaNumeroSerie: e.target.checked })}
                            />
                            Controla número de serie
                          </label>
                        </div>
                        <div className="w-full">
                          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Detalle del producto</label>
                          <textarea
                            value={editForm.descripcion}
                            onChange={(e) => setEditForm({ ...editForm, descripcion: e.target.value })}
                            rows={2}
                            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1 text-sm w-full resize-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Cambiar imagen</label>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={(e) => setImagenEditando(e.target.files?.[0] ?? null)}
                            className="text-sm text-gray-700 dark:text-gray-300"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="submit"
                            disabled={editarProducto.isPending}
                            className="bg-slate-800 text-white px-4 py-1.5 rounded-md text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
                          >
                            {editarProducto.isPending ? "Guardando..." : "Guardar cambios"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setProductoEditandoId(null)}
                            className="bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 px-4 py-1.5 rounded-md text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-500"
                          >
                            Cancelar
                          </button>
                        </div>
                      </form>
                      {editarProducto.isError && (
                        <p className="text-red-600 dark:text-red-400 text-xs mt-2">Error al guardar los cambios.</p>
                      )}
                    </td>
                  </tr>
                )}

                {productoEntradaId === p.id && (
                  <tr className="bg-emerald-50 dark:bg-emerald-900/20">
                    <td colSpan={7} className="px-4 py-3">
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          registrarEntrada.mutate({ productoId: p.id, manejaLotes: p.manejaLotes });
                        }}
                        className="flex flex-wrap items-end gap-2"
                      >
                        <div>
                          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Cantidad recibida</label>
                          <input
                            type="number"
                            min={1}
                            required
                            autoFocus
                            value={entradaForm.cantidad}
                            onChange={(e) => setEntradaForm({ ...entradaForm, cantidad: e.target.value })}
                            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1 text-sm w-28"
                          />
                        </div>
                        {p.manejaLotes ? (
                          <>
                            <div>
                              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">N° de lote (opcional)</label>
                              <input
                                type="text"
                                value={entradaForm.numeroLote}
                                onChange={(e) => setEntradaForm({ ...entradaForm, numeroLote: e.target.value })}
                                className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1 text-sm w-32"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Fecha de caducidad</label>
                              <input
                                type="date"
                                required
                                value={entradaForm.fechaCaducidad}
                                onChange={(e) => setEntradaForm({ ...entradaForm, fechaCaducidad: e.target.value })}
                                className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1 text-sm"
                              />
                            </div>
                          </>
                        ) : (
                          <div>
                            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Bodega</label>
                            <select
                              required
                              value={entradaForm.bodegaId}
                              onChange={(e) => setEntradaForm({ ...entradaForm, bodegaId: e.target.value })}
                              className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1 text-sm"
                            >
                              <option value="">Elige una bodega...</option>
                              {bodegas?.map((b) => (
                                <option key={b.id} value={b.id}>{b.nombre}</option>
                              ))}
                            </select>
                          </div>
                        )}
                        <div className="flex-1">
                          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Motivo (opcional)</label>
                          <input
                            type="text"
                            placeholder="Ej: Compra a Distribuidora XYZ"
                            value={entradaForm.motivo}
                            onChange={(e) => setEntradaForm({ ...entradaForm, motivo: e.target.value })}
                            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1 text-sm w-full"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={registrarEntrada.isPending || (!p.manejaLotes && !entradaForm.bodegaId)}
                          className="bg-brand-600 text-white px-4 py-1.5 rounded-md text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
                        >
                          {registrarEntrada.isPending ? "Guardando..." : "Confirmar entrada"}
                        </button>
                      </form>
                      {registrarEntrada.isError && (
                        <p className="text-red-600 dark:text-red-400 text-xs mt-2">Error al registrar la entrada.</p>
                      )}
                    </td>
                  </tr>
                )}

                {productoEtiquetaId === p.id && (
                  <tr className="bg-slate-50 dark:bg-gray-700/40">
                    <td colSpan={7} className="px-4 py-3">
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          abrirPdfEnNuevaPestana(`/productos/${p.id}/etiqueta?cantidad=${cantidadEtiquetas}&tamano=${tamanoEtiqueta}`);
                        }}
                        className="flex items-end gap-2"
                      >
                        <div>
                          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Cantidad de etiquetas</label>
                          <input
                            type="number"
                            min={1}
                            max={200}
                            required
                            autoFocus
                            value={cantidadEtiquetas}
                            onChange={(e) => setCantidadEtiquetas(e.target.value)}
                            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1 text-sm w-32"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Tamaño de etiqueta</label>
                          <select
                            value={tamanoEtiqueta}
                            onChange={(e) => setTamanoEtiqueta(e.target.value)}
                            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md px-2 py-1 text-sm"
                          >
                            {TAMANOS_ETIQUETA.map((t) => (
                              <option key={t.valor} value={t.valor}>
                                {t.etiqueta}
                              </option>
                            ))}
                          </select>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 flex-1">
                          Genera un PDF con código de barras (código: {p.codigoBarras || p.codigo}) + nombre, listo para imprimir.
                        </p>
                        <button
                          type="submit"
                          className="bg-slate-800 text-white px-4 py-1.5 rounded-md text-sm font-medium hover:bg-slate-700"
                        >
                          Generar PDF
                        </button>
                      </form>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        {respuesta && (
          <Paginacion
            page={respuesta.paginacion.page}
            totalPaginas={respuesta.paginacion.totalPaginas}
            total={respuesta.paginacion.total}
            onCambiarPagina={setPagina}
          />
        )}
      </div>

      {productoHistorialId !== null && (
        <HistorialProductoModal
          productoId={productoHistorialId}
          nombreProducto={productos?.find((p) => p.id === productoHistorialId)?.nombre ?? ""}
          onCerrar={() => setProductoHistorialId(null)}
        />
      )}

      {productoLotesId !== null && (
        <ModalLotesProducto
          productoId={productoLotesId}
          nombreProducto={productos?.find((p) => p.id === productoLotesId)?.nombre ?? ""}
          onCerrar={() => setProductoLotesId(null)}
        />
      )}

      {escaneando && (
        <EscanerCodigoBarras
          onDetectado={(codigo) => {
            if (escaneando === "crear") setForm((actual) => ({ ...actual, codigoBarras: codigo }));
            else setEditForm((actual) => ({ ...actual, codigoBarras: codigo }));
            setEscaneando(null);
          }}
          onCerrar={() => setEscaneando(null)}
        />
      )}
    </div>
  );
}
