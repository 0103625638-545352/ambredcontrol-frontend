import { useState, useEffect, useMemo, Fragment } from "react";
import { useQuery, useQueries, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api, type Cliente, type TipoPrecio, type PlanInternet, type NodoRed, type VlanNodo, type RespuestaPaginada, OPCIONES_VIGENCIA_MESES } from "../api/client";
import { Paginacion } from "../components/Paginacion";
import { HistorialClienteModal } from "../components/HistorialClienteModal";
import { Modal } from "../components/Modal";
import { MapaPunto } from "../components/MapaPunto";
import { CampoPegarUbicacion } from "../components/CampoPegarUbicacion";
import { BotonWhatsapp } from "../components/BotonWhatsapp";
import { usePermiso } from "../context/AuthContext";
import { useToast } from "../components/ToastProvider";
import { urlMapa } from "../utils/parsearUbicacion";
import { useFiltrosListado, BarraBuscadorDocumentos } from "../components/BuscadorDocumentos";
import { EncabezadoListado, CLASE_BOTON_ENCABEZADO, CLASE_CAMPO, CLASE_ETIQUETA, Resaltar } from "../components/FormatoDocumento";

const TAMANO_PAGINA = 20;

export function ClientesPage() {
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const puedeMikrotik = usePermiso("mikrotik");
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const formVacio = {
    tipoIdentificacion: "CEDULA",
    identificacion: "",
    razonSocial: "",
    email: "",
    telefono: "",
    direccion: "",
    ciudad: "",
    tipoPrecioId: "",
    direccionIp: "",
    planInternetId: "",
    nodoId: "",
    vlanNodoId: "",
    latitud: "",
    longitud: "",
    fechaContrato: "",
    fechaInicioServicio: "",
    vigenciaContratoMeses: "",
  };
  const [form, setForm] = useState(formVacio);
  const [pagina, setPagina] = useState(1);
  // Buscador compartido de los listados (en el servidor: la lista pagina).
  // Estado, nodo y VLAN mantienen su propio estado y van como filtros de la barra.
  const filtros = useFiltrosListado(setPagina);
  // Filtro opcional por nodo / VLAN — pensado para poder ver "quiénes están
  // en la VLAN 10 del NODO MISICATA", ej. antes de hacer un cambio ahí.
  const [filtroNodoId, setFiltroNodoId] = useState("");
  const [filtroVlanNodoId, setFiltroVlanNodoId] = useState("");
  // "" = todos, "true" = solo activos, "false" = solo dados de baja — para
  // poder verificar de un vistazo quién fue dado de baja (ver PATCH
  // /clientes/:id/dar-de-baja).
  const [filtroActivo, setFiltroActivo] = useState("");

  // Categoría de precio del cliente — determina el margen que se le aplica
  // al facturar EQUIPOS/servicios fuera del plan de internet (que sigue
  // siendo precio fijo, sin margen — ver utils/precios.ts). Se autoasigna
  // "Consumidor Final" al crear un cliente nuevo (ver el useEffect de abajo),
  // pero queda editable en el formulario para poder cambiarla caso por caso.
  const { data: tiposPrecio } = useQuery({
    queryKey: ["tipos-precio"],
    queryFn: async () => (await api.get<TipoPrecio[]>("/tipos-precio")).data,
  });

  useEffect(() => {
    if (!tiposPrecio || tiposPrecio.length === 0 || form.tipoPrecioId) return;
    const porDefecto = tiposPrecio.find((tp) => tp.nombre.trim().toLowerCase() === "consumidor final") ?? tiposPrecio[0];
    setForm((f) => ({ ...f, tipoPrecioId: String(porDefecto.id) }));
  }, [tiposPrecio, form.tipoPrecioId]);

  // Solo se necesita si este usuario puede ver/editar el vínculo ISP —
  // evita pedirle esta lista a alguien sin el permiso "mikrotik".
  const { data: planesInternet } = useQuery({
    queryKey: ["planes-internet"],
    queryFn: async () => (await api.get<PlanInternet[]>("/planes-internet")).data,
    enabled: puedeMikrotik,
  });

  const { data: nodos } = useQuery({
    queryKey: ["nodos-red"],
    queryFn: async () => (await api.get<NodoRed[]>("/nodos-red")).data,
    enabled: puedeMikrotik,
  });

  // Controla qué cliente está en modo "edición". La identificación (cédula/RUC)
  // NO se puede editar aquí a propósito — es la clave de negocio del cliente.
  const [clienteEditandoId, setClienteEditandoId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({
    razonSocial: "",
    email: "",
    telefono: "",
    direccion: "",
    ciudad: "",
    tipoPrecioId: "",
    direccionIp: "",
    planInternetId: "",
    nodoId: "",
    vlanNodoId: "",
    latitud: "",
    longitud: "",
    fechaContrato: "",
    fechaInicioServicio: "",
    vigenciaContratoMeses: "",
  });

  // Controla para cuál cliente se está mostrando el modal de historial
  const [clienteHistorialId, setClienteHistorialId] = useState<number | null>(null);

  // Controla para cuál cliente se está mostrando el mapa de su ubicación —
  // mismo mapa (Leaflet/OpenStreetMap, ver components/MapaPunto.tsx) que ya
  // usa Visitas Técnicas para las rutas del día, en vez de mandar a abrir
  // Google Maps en una pestaña aparte.
  const [clienteMapaId, setClienteMapaId] = useState<number | null>(null);

  useEffect(() => {
    setPagina(1);
  }, [filtroNodoId, filtroVlanNodoId, filtroActivo]);

  const { data: respuesta, isLoading } = useQuery({
    queryKey: ["clientes", pagina, ...filtros.clave, filtroNodoId, filtroVlanNodoId, filtroActivo],
    queryFn: async () =>
      (
        await api.get<RespuestaPaginada<Cliente>>("/clientes", {
          params: {
            page: pagina,
            pageSize: TAMANO_PAGINA,
            ...filtros.params,
            nodoId: filtroNodoId || undefined,
            vlanNodoId: filtroVlanNodoId || undefined,
            activo: filtroActivo || undefined,
          },
        })
      ).data,
    placeholderData: keepPreviousData,
  });
  const clientes = respuesta?.datos;

  // Qué IPs están suspendidas EN VIVO, por nodo — cada nodo tiene su propio
  // Mikrotik, así que hay que consultar el estado por separado en el router
  // de CADA nodo que aparezca entre los clientes de esta página (ver
  // utils/mikrotik.ts en el backend: suspender agrega la IP a la lista
  // "Suspendido" de ESE router, sin quitarla de la lista de su plan).
  const nodoIdsEnPagina = puedeMikrotik
    ? [...new Set((clientes ?? []).map((c) => c.nodoId).filter((id): id is number => id != null))]
    : [];
  const resultadosSuspendidas = useQueries({
    queries: nodoIdsEnPagina.map((nodoId) => ({
      queryKey: ["mikrotik-ips-suspendidas", nodoId],
      queryFn: async () => (await api.get<string[]>(`/mikrotik/${nodoId}/ips-suspendidas`)).data,
    })),
  });
  const ipsSuspendidasPorNodo: Record<number, string[]> = {};
  nodoIdsEnPagina.forEach((nodoId, i) => {
    ipsSuspendidasPorNodo[nodoId] = resultadosSuspendidas[i]?.data ?? [];
  });

  // Orden de la tabla: SOLO reordena lo que ya está cargado en esta página
  // (20 clientes), nunca pide otra página distinta al backend. Para
  // Identificación/Razón Social eso ya alcanzaría para ordenar "todo" si no
  // hubiera paginación, pero como el Estado (Activo/Suspendido) es un dato
  // EN VIVO del Mikrotik que solo se consulta para los nodos de la página
  // actual (ver arriba), ordenar "de verdad" entre TODOS los clientes
  // implicaría consultar el Mikrotik de todos los nodos de golpe — se
  // decidió a propósito no hacer eso, por costo.
  type Columna = "identificacion" | "razonSocial" | "nodo" | "estado";
  const [ordenColumna, setOrdenColumna] = useState<Columna | null>(null);
  const [ordenDireccion, setOrdenDireccion] = useState<"asc" | "desc">("asc");

  function alternarOrden(columna: Columna) {
    if (ordenColumna === columna) {
      setOrdenDireccion((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setOrdenColumna(columna);
      setOrdenDireccion("asc");
    }
  }

  // 0 = Activo, 1 = Suspendido, 2 = sin IP/nodo vinculado (siempre al final,
  // sin importar la dirección — no tiene sentido que "sin vincular" quede
  // arriba de "Suspendido" solo por ordenar descendente).
  function rangoEstado(c: Cliente): number {
    if (!c.direccionIp || !c.nodoId) return 2;
    return ipsSuspendidasPorNodo[c.nodoId]?.includes(c.direccionIp) ? 1 : 0;
  }

  const clientesOrdenados = useMemo(() => {
    if (!clientes || !ordenColumna) return clientes;
    const signo = ordenDireccion === "asc" ? 1 : -1;
    return [...clientes].sort((a, b) => {
      switch (ordenColumna) {
        case "identificacion":
          return signo * a.identificacion.localeCompare(b.identificacion);
        case "razonSocial":
          return signo * a.razonSocial.localeCompare(b.razonSocial);
        case "nodo":
          return signo * (a.nodo?.nombre ?? "").localeCompare(b.nodo?.nombre ?? "");
        case "estado":
          return signo * (rangoEstado(a) - rangoEstado(b));
      }
    });
  }, [clientes, ordenColumna, ordenDireccion, ipsSuspendidasPorNodo]);

  const crearCliente = useMutation({
    // latitud/longitud vacíos ("") se mandan como undefined, no como texto
    // vacío — si no, el backend haría Number("") = 0 y guardaría (0,0)
    // como si fuera una ubicación real cada vez que nadie la carga.
    mutationFn: async () => api.post("/clientes", { ...form, latitud: form.latitud || undefined, longitud: form.longitud || undefined }),
    onSuccess: (respuesta) => {
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      queryClient.invalidateQueries({ queryKey: ["mikrotik-ips-suspendidas"] });
      if (respuesta.data?.advertenciaMikrotik) {
        mostrarToast(`Cliente creado, pero el Mikrotik no se pudo sincronizar: ${respuesta.data.advertenciaMikrotik}`);
      }
      setForm(formVacio);
      setMostrarFormulario(false);
    },
  });

  const editarCliente = useMutation({
    mutationFn: async (clienteId: number) =>
      api.put(`/clientes/${clienteId}`, { ...editForm, latitud: editForm.latitud || undefined, longitud: editForm.longitud || undefined }),
    onSuccess: (respuesta) => {
      if (respuesta.data?.advertenciaMikrotik) {
        mostrarToast(`Cliente actualizado, pero el Mikrotik no se pudo sincronizar: ${respuesta.data.advertenciaMikrotik}`);
      }
      queryClient.invalidateQueries({ queryKey: ["mikrotik-ips-suspendidas"] });
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      setClienteEditandoId(null);
    },
  });

  function abrirEdicion(c: Cliente) {
    setEditForm({
      razonSocial: c.razonSocial,
      email: c.email ?? "",
      telefono: c.telefono ?? "",
      direccion: c.direccion ?? "",
      ciudad: c.ciudad ?? "",
      tipoPrecioId: String(c.tipoPrecioId),
      direccionIp: c.direccionIp ?? "",
      planInternetId: c.planInternetId ? String(c.planInternetId) : "",
      nodoId: c.nodoId ? String(c.nodoId) : "",
      vlanNodoId: c.vlanNodoId ? String(c.vlanNodoId) : "",
      latitud: c.latitud ?? "",
      longitud: c.longitud ?? "",
      fechaContrato: c.fechaContrato ? c.fechaContrato.slice(0, 10) : "",
      fechaInicioServicio: c.fechaInicioServicio ? c.fechaInicioServicio.slice(0, 10) : "",
      vigenciaContratoMeses: c.vigenciaContratoMeses ? String(c.vigenciaContratoMeses) : "",
    });
    setClienteEditandoId(clienteEditandoId === c.id ? null : c.id);
  }

  // El estado Activo/Suspendido que se ve en la tabla sale de la cache
  // "mikrotik-ips-suspendidas" (estado EN VIVO del router), no de
  // "clientes" — hay que invalidar las dos, si no la UI se queda mostrando
  // el estado viejo hasta el próximo refetch espontáneo.
  const suspenderCliente = useMutation({
    mutationFn: async (c: Cliente) => api.patch(`/mikrotik/${c.nodoId}/direcciones/${c.direccionIp}/suspender`, { comentario: c.razonSocial }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      queryClient.invalidateQueries({ queryKey: ["mikrotik-ips-suspendidas"] });
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al suspender el servicio de este cliente"),
  });

  const reactivarCliente = useMutation({
    mutationFn: async (c: Cliente) => api.patch(`/mikrotik/${c.nodoId}/direcciones/${c.direccionIp}/reactivar`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      queryClient.invalidateQueries({ queryKey: ["mikrotik-ips-suspendidas"] });
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al reactivar el servicio de este cliente"),
  });

  // Prórroga manual de pago: a diferencia de "Reactivar" (que el job de
  // suspensión automática deshace solo en su próxima corrida si el cliente
  // sigue sin pagar), esto guarda una fecha límite que ese mismo job respeta
  // — ver backend/src/utils/gestionServicioInternet.ts. Solo un cliente a la
  // vez puede tener el selector de días abierto.
  const [clienteProrrogaId, setClienteProrrogaId] = useState<number | null>(null);
  const [diasProrroga, setDiasProrroga] = useState(2);
  const darProrroga = useMutation({
    mutationFn: async ({ id, dias }: { id: number; dias: number }) =>
      api.patch(`/clientes/${id}/prorroga`, { dias }),
    onSuccess: (respuesta) => {
      if (respuesta.data?.advertenciaMikrotik) {
        mostrarToast(respuesta.data.advertenciaMikrotik);
      }
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      queryClient.invalidateQueries({ queryKey: ["mikrotik-ips-suspendidas"] });
      setClienteProrrogaId(null);
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al otorgar la prórroga"),
  });

  // Baja definitiva del servicio (distinta de "Suspender", que es
  // reversible por falta de pago) — solo un cliente a la vez puede tener el
  // formulario abierto. El backend calcula "vigencia" (¿cumplió el plazo
  // mínimo pactado?) y la mostramos en el toast de resultado; el monto de
  // la multa, si procede, lo decide el admin a mano — el sistema no lo calcula.
  const [clienteBajaId, setClienteBajaId] = useState<number | null>(null);
  const [formBaja, setFormBaja] = useState({ fechaBaja: "", motivo: "" });
  const darDeBaja = useMutation({
    mutationFn: async (id: number) => api.patch(`/clientes/${id}/dar-de-baja`, formBaja),
    onSuccess: (respuesta) => {
      const vigencia = respuesta.data?.vigencia;
      if (vigencia) {
        mostrarToast(
          vigencia.cumplioVigencia
            ? "Cliente dado de baja — cumplió la vigencia mínima pactada, no procede multa."
            : `Cliente dado de baja — NO cumplió la vigencia mínima (faltaron ${vigencia.diasFaltantes} día(s)): procede evaluar multa por término injustificado/abandono.`
        );
      } else {
        mostrarToast("Cliente dado de baja.");
      }
      if (respuesta.data?.advertenciaMikrotik) {
        mostrarToast(respuesta.data.advertenciaMikrotik);
      }
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      queryClient.invalidateQueries({ queryKey: ["mikrotik-ips-suspendidas"] });
      setClienteBajaId(null);
      setFormBaja({ fechaBaja: "", motivo: "" });
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al dar de baja al cliente"),
  });

  // Cobra la multa por incumplimiento de vigencia como una Factura real (con
  // SRI) — ver POST /clientes/:id/imponer-multa. El sistema no calcula el
  // monto, lo decide el admin acá; solo un cliente a la vez puede tener el
  // formulario abierto.
  const [clienteMultaId, setClienteMultaId] = useState<number | null>(null);
  const [formMulta, setFormMulta] = useState({ monto: "", motivo: "" });
  const imponerMulta = useMutation({
    mutationFn: async (id: number) => api.post(`/clientes/${id}/imponer-multa`, { monto: Number(formMulta.monto), motivo: formMulta.motivo || undefined }),
    onSuccess: (respuesta) => {
      mostrarToast(`Multa facturada — comprobante ${respuesta.data?.secuencial ?? ""}, enviándose al SRI.`);
      queryClient.invalidateQueries({ queryKey: ["facturas"] });
      setClienteMultaId(null);
      setFormMulta({ monto: "", motivo: "" });
    },
    onError: (error: any) => mostrarToast(error.response?.data?.error ?? "Error al imponer la multa"),
  });

  return (
    <div>
      <div className="bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700 overflow-hidden">
        <EncabezadoListado
          titulo="Clientes"
          conteo={respuesta?.paginacion.total}
          singular="cliente"
          plural="clientes"
          acciones={
            <button onClick={() => setMostrarFormulario(!mostrarFormulario)} className={CLASE_BOTON_ENCABEZADO}>
              {mostrarFormulario ? "Cancelar" : "+ Nuevo cliente"}
            </button>
          }
        />
        {mostrarFormulario && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              crearCliente.mutate();
            }}
            className="p-4 bg-stone-50 dark:bg-gray-900/40 border-b border-stone-300 dark:border-gray-700 grid grid-cols-2 gap-3"
          >
            <select
              value={form.tipoIdentificacion}
              onChange={(e) => setForm({ ...form, tipoIdentificacion: e.target.value })}
              className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
            >
              <option value="CEDULA">Cédula</option>
              <option value="RUC">RUC</option>
              <option value="PASAPORTE">Pasaporte</option>
            </select>
            <input
              placeholder={form.tipoIdentificacion === "RUC" ? "RUC (13 dígitos)" : "Identificación"}
              required
              value={form.identificacion}
              onChange={(e) => setForm({ ...form, identificacion: e.target.value })}
              className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
            />
            <input
              placeholder="Razón social / Nombres"
              required
              value={form.razonSocial}
              onChange={(e) => setForm({ ...form, razonSocial: e.target.value })}
              className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm col-span-2"
            />
            <input
              type="email"
              placeholder="Correo electrónico (para enviarle el RIDE/XML)"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
            />
            <input
              placeholder="Teléfono"
              value={form.telefono}
              onChange={(e) => setForm({ ...form, telefono: e.target.value })}
              className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
            />
            <input
              placeholder="Dirección"
              value={form.direccion}
              onChange={(e) => setForm({ ...form, direccion: e.target.value })}
              className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
            />
            <input
              placeholder="Ciudad"
              value={form.ciudad}
              onChange={(e) => setForm({ ...form, ciudad: e.target.value })}
              className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
            />
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">
                Tipo de precio (margen al venderle equipos/servicios)
              </label>
              <select
                value={form.tipoPrecioId}
                onChange={(e) => setForm({ ...form, tipoPrecioId: e.target.value })}
                className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
              >
                {tiposPrecio?.map((tp) => (
                  <option key={tp.id} value={tp.id}>
                    {tp.nombre} (+{tp.porcentajeGanancia}%)
                  </option>
                ))}
              </select>
            </div>
            <CampoPegarUbicacion
              latitud={form.latitud}
              longitud={form.longitud}
              onDetectar={(lat, lng) => setForm({ ...form, latitud: lat, longitud: lng })}
              className="col-span-2"
            />
            {puedeMikrotik && (
              <>
                <select
                  value={form.nodoId}
                  onChange={(e) => setForm({ ...form, nodoId: e.target.value, vlanNodoId: "" })}
                  className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
                >
                  <option value="">Sin nodo de red</option>
                  {nodos?.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.nombre}
                    </option>
                  ))}
                </select>
                <VlanSelect nodoId={form.nodoId} value={form.vlanNodoId} onChange={(v) => setForm({ ...form, vlanNodoId: v })} />
                <div>
                  <input
                    list="ips-libres-nuevo"
                    placeholder="Dirección IP (opcional — vínculo con el Mikrotik, ej. 10.15.0.9)"
                    value={form.direccionIp}
                    onChange={(e) => setForm({ ...form, direccionIp: e.target.value })}
                    className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
                  />
                  <IpsLibresDatalist id="ips-libres-nuevo" nodoId={form.nodoId} />
                  <RangoIpSugerido nodoId={form.nodoId} nodos={nodos} />
                </div>
                <select
                  value={form.planInternetId}
                  onChange={(e) => setForm({ ...form, planInternetId: e.target.value })}
                  className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm col-span-2"
                >
                  <option value="">Sin plan de internet</option>
                  {planesInternet?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} ({p.velocidadSubida}/{p.velocidadBajada})
                    </option>
                  ))}
                </select>
                <div>
                  <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">
                    Fecha de firma del contrato (opcional)
                  </label>
                  <input
                    type="date"
                    value={form.fechaContrato}
                    onChange={(e) => setForm({ ...form, fechaContrato: e.target.value })}
                    className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
                  />
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                    El día del mes de esta fecha es su propio día de corte — sin esto, sigue con el día de corte general de la empresa (Ajustes).
                  </p>
                </div>
                <div>
                  <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">
                    Fecha de inicio del servicio (opcional)
                  </label>
                  <input
                    type="date"
                    value={form.fechaInicioServicio}
                    onChange={(e) => setForm({ ...form, fechaInicioServicio: e.target.value })}
                    className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">
                    Vigencia mínima del contrato (opcional)
                  </label>
                  <select
                    value={form.vigenciaContratoMeses}
                    onChange={(e) => setForm({ ...form, vigenciaContratoMeses: e.target.value })}
                    className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
                  >
                    <option value="">Sin plazo mínimo pactado</option>
                    {OPCIONES_VIGENCIA_MESES.map((meses) => (
                      <option key={meses} value={meses}>
                        {etiquetaVigencia(meses)}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                    Junto con la fecha de inicio, determina si al darlo de baja procede multa por abandono/término injustificado.
                  </p>
                </div>
              </>
            )}
            <button
              type="submit"
              disabled={crearCliente.isPending}
              className="col-span-2 bg-brand-700 text-white py-2 rounded-sm text-sm font-semibold hover:bg-brand-800 disabled:opacity-50"
            >
              {crearCliente.isPending ? "Guardando..." : "Guardar cliente"}
            </button>
            {crearCliente.isError && (
              <p className="col-span-2 text-red-600 dark:text-red-400 text-sm">
                {(crearCliente.error as any)?.response?.data?.error ?? "Error al guardar el cliente"}
              </p>
            )}
          </form>
        )}
        <BarraBuscadorDocumentos
          filtros={filtros}
          etiquetaBusqueda="Buscar · cédula/RUC o razón social"
          placeholder="Ej: 0102030405, Pérez..."
          mostrarPago={false}
          extras={
            <>
              <label className="flex flex-col gap-1 w-40">
                <span className={CLASE_ETIQUETA}>Estado</span>
                <select value={filtroActivo} onChange={(e) => setFiltroActivo(e.target.value)} className={CLASE_CAMPO}>
                  <option value="">Todos</option>
                  <option value="true">Activos</option>
                  <option value="false">Dados de baja</option>
                </select>
              </label>
              {puedeMikrotik && (
                <>
                  <label className="flex flex-col gap-1 w-44">
                    <span className={CLASE_ETIQUETA}>Nodo</span>
                    <select
                      value={filtroNodoId}
                      onChange={(e) => {
                        setFiltroNodoId(e.target.value);
                        setFiltroVlanNodoId("");
                      }}
                      className={CLASE_CAMPO}
                    >
                      <option value="">Todos los nodos</option>
                      {nodos?.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 w-44">
                    <span className={CLASE_ETIQUETA}>VLAN</span>
                    <VlanSelect nodoId={filtroNodoId} value={filtroVlanNodoId} onChange={setFiltroVlanNodoId} placeholder="Todas las VLANs" />
                  </label>
                </>
              )}
            </>
          }
        />
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-stone-100 dark:bg-gray-900/60 border-b border-stone-300 dark:border-gray-700 text-left font-mono text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 [&_th]:font-medium">
            <tr>
              <ThOrdenable etiqueta="Identificación" columna="identificacion" ordenColumna={ordenColumna} ordenDireccion={ordenDireccion} onClick={alternarOrden} />
              <ThOrdenable etiqueta="Razón Social" columna="razonSocial" ordenColumna={ordenColumna} ordenDireccion={ordenDireccion} onClick={alternarOrden} />
              <th className="px-4 py-2">Correo</th>
              <th className="px-4 py-2">Teléfono</th>
              {puedeMikrotik && (
                <>
                  <ThOrdenable etiqueta="Nodo" columna="nodo" ordenColumna={ordenColumna} ordenDireccion={ordenDireccion} onClick={alternarOrden} />
                  <ThOrdenable etiqueta="Estado" columna="estado" ordenColumna={ordenColumna} ordenDireccion={ordenDireccion} onClick={alternarOrden} />
                </>
              )}
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={puedeMikrotik ? 7 : 5} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">Cargando...</td>
              </tr>
            )}
            {!isLoading && clientes?.length === 0 && (
              <tr>
                <td colSpan={puedeMikrotik ? 7 : 5} className="px-4 py-4 text-center text-gray-400 dark:text-gray-500">
                  {filtros.hayFiltros || filtroActivo || filtroNodoId ? "Ningún cliente coincide con la búsqueda." : "No hay clientes"}
                </td>
              </tr>
            )}
            {clientesOrdenados?.map((c) => (
              <Fragment key={c.id}>
                <tr className={`border-t border-stone-100 dark:border-gray-700 hover:bg-stone-50 dark:hover:bg-gray-700/30 ${c.activo === false ? "text-gray-400 dark:text-gray-500" : ""}`}>
                  <td className="px-4 py-2 font-mono text-xs"><Resaltar texto={c.identificacion} termino={filtros.busquedaAplicada} /></td>
                  <td className="px-4 py-2">
                    <Resaltar texto={c.razonSocial} termino={filtros.busquedaAplicada} />
                    {c.latitud && c.longitud && (
                      <button
                        onClick={() => setClienteMapaId(c.id)}
                        title="Ver la ubicación de la vivienda en el mapa"
                        className="ml-1.5 text-sky-600 dark:text-sky-400 hover:underline text-xs"
                      >
                        📍
                      </button>
                    )}
                    {c.activo === false && (
                      <div
                        className="text-[10px] text-red-600 dark:text-red-400 font-medium mt-0.5"
                        title={c.motivoBaja ?? undefined}
                      >
                        Dado de baja{c.fechaBaja ? ` (${new Date(c.fechaBaja).toLocaleDateString("es-EC")})` : ""}
                      </div>
                    )}
                    {c.vigencia && (
                      <div
                        className={`text-[10px] font-medium mt-0.5 ${c.vigencia.cumplioVigencia ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}
                      >
                        {c.vigencia.cumplioVigencia
                          ? "Cumplió vigencia mínima"
                          : `Faltan ${c.vigencia.diasFaltantes} día(s) para la vigencia mínima`}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-600 dark:text-gray-300">
                    {c.email ?? <span className="text-gray-300 dark:text-gray-600 italic">sin correo</span>}
                  </td>
                  <td className="px-4 py-2 text-gray-600 dark:text-gray-300">
                    <div className="flex items-center gap-1.5">
                      {c.telefono ?? "—"}
                      <BotonWhatsapp telefono={c.telefono} mensaje={`Hola ${c.razonSocial}, te escribimos de tu proveedor de internet.`} />
                    </div>
                  </td>
                  {puedeMikrotik && (
                    <>
                      <td className="px-4 py-2">
                        {c.nodo ? (
                          <div>
                            <div className="font-medium text-gray-800 dark:text-gray-100">{c.nodo.nombre}</div>
                            {c.direccionIp && <div className="text-xs text-gray-500 dark:text-gray-400">{c.direccionIp}</div>}
                            {c.vlanNodo && <div className="text-xs text-sky-600 dark:text-sky-400">{c.vlanNodo.nombre}</div>}
                          </div>
                        ) : c.direccionIp ? (
                          <span className="text-amber-600 dark:text-amber-400 text-xs font-medium">{c.direccionIp} (sin nodo asignado)</span>
                        ) : (
                          <span className="text-gray-300 dark:text-gray-600 italic text-xs">sin vincular</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {c.direccionIp && c.nodoId ? (
                          (() => {
                            const suspendido = ipsSuspendidasPorNodo[c.nodoId!]?.includes(c.direccionIp!);
                            const prorrogaActiva = c.prorrogaHasta && new Date(c.prorrogaHasta) >= new Date();
                            return (
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs font-medium ${suspendido ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                                    {suspendido ? "Suspendido" : "Activo"}
                                  </span>
                                  {suspendido ? (
                                    <button
                                      onClick={() => reactivarCliente.mutate(c)}
                                      className="text-emerald-600 dark:text-emerald-400 hover:underline text-xs font-medium"
                                    >
                                      Reactivar
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => suspenderCliente.mutate(c)}
                                      className="text-amber-600 dark:text-amber-400 hover:underline text-xs font-medium"
                                    >
                                      Suspender
                                    </button>
                                  )}
                                  <button
                                    onClick={() => setClienteProrrogaId(clienteProrrogaId === c.id ? null : c.id)}
                                    className="text-sky-600 dark:text-sky-400 hover:underline text-xs font-medium"
                                  >
                                    Prórroga
                                  </button>
                                </div>
                                {prorrogaActiva && (
                                  <div className="text-[10px] text-sky-600 dark:text-sky-400 mt-0.5">
                                    Con prórroga hasta {new Date(c.prorrogaHasta!).toLocaleDateString("es-EC")}
                                  </div>
                                )}
                                {clienteProrrogaId === c.id && (
                                  <div className="flex items-center gap-1 mt-1">
                                    <select
                                      value={diasProrroga}
                                      onChange={(e) => setDiasProrroga(Number(e.target.value))}
                                      className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-1 py-0.5 text-xs"
                                    >
                                      <option value={1}>1 día</option>
                                      <option value={2}>2 días</option>
                                      <option value={3}>3 días</option>
                                      <option value={4}>4 días</option>
                                    </select>
                                    <button
                                      onClick={() => darProrroga.mutate({ id: c.id, dias: diasProrroga })}
                                      disabled={darProrroga.isPending}
                                      className="text-emerald-600 dark:text-emerald-400 hover:underline text-xs font-medium disabled:opacity-50"
                                    >
                                      {darProrroga.isPending ? "..." : "Dar"}
                                    </button>
                                    <button
                                      onClick={() => setClienteProrrogaId(null)}
                                      className="text-gray-400 dark:text-gray-500 hover:underline text-xs"
                                    >
                                      Cancelar
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })()
                        ) : (
                          <span className="text-gray-300 dark:text-gray-600 italic text-xs">—</span>
                        )}
                      </td>
                    </>
                  )}
                  <td className="px-4 py-2 text-right space-x-3">
                    <button
                      onClick={() => setClienteHistorialId(c.id)}
                      className="text-brand-700 dark:text-brand-300 hover:underline text-xs font-medium"
                    >
                      Historial
                    </button>
                    <button
                      onClick={() => abrirEdicion(c)}
                      className="text-brand-700 dark:text-brand-300 hover:underline text-xs font-medium"
                    >
                      {clienteEditandoId === c.id ? "Cancelar" : "Editar"}
                    </button>
                    {c.activo !== false && (
                      <button
                        onClick={() => {
                          setClienteBajaId(clienteBajaId === c.id ? null : c.id);
                          setFormBaja({ fechaBaja: "", motivo: "" });
                        }}
                        className="text-red-600 dark:text-red-400 hover:underline text-xs font-medium"
                      >
                        {clienteBajaId === c.id ? "Cancelar" : "Dar de baja"}
                      </button>
                    )}
                    {c.vigencia && !c.vigencia.cumplioVigencia && (
                      <button
                        onClick={() => {
                          setClienteMultaId(clienteMultaId === c.id ? null : c.id);
                          setFormMulta({ monto: "", motivo: "" });
                        }}
                        className="text-amber-600 dark:text-amber-400 hover:underline text-xs font-medium"
                      >
                        {clienteMultaId === c.id ? "Cancelar" : "Imponer multa"}
                      </button>
                    )}
                  </td>
                </tr>

                {clienteMultaId === c.id && (
                  <tr className="bg-amber-50 dark:bg-amber-950/20">
                    <td colSpan={puedeMikrotik ? 7 : 5} className="px-4 py-3">
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          imponerMulta.mutate(c.id);
                        }}
                        className="flex flex-wrap items-end gap-2"
                      >
                        <div>
                          <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Monto de la multa ($)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            required
                            autoFocus
                            value={formMulta.monto}
                            onChange={(e) => setFormMulta({ ...formMulta, monto: e.target.value })}
                            className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm w-28"
                          />
                        </div>
                        <div className="flex-1 min-w-[200px]">
                          <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Motivo (opcional, queda en Auditoría)</label>
                          <input
                            placeholder="Ej. abandono antes de cumplir la vigencia pactada"
                            value={formMulta.motivo}
                            onChange={(e) => setFormMulta({ ...formMulta, motivo: e.target.value })}
                            className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={imponerMulta.isPending}
                          className="bg-amber-600 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
                        >
                          {imponerMulta.isPending ? "Facturando..." : "Confirmar y facturar"}
                        </button>
                        <p className="basis-full text-[11px] text-gray-500 dark:text-gray-400">
                          Genera una Factura real por este monto a nombre de {c.razonSocial}, con IVA, firmada y enviada al SRI — no se puede deshacer una vez enviada (correspondería una Nota de Crédito).
                        </p>
                        {imponerMulta.isError && (
                          <p className="basis-full text-red-600 dark:text-red-400 text-xs">
                            {(imponerMulta.error as any)?.response?.data?.error ?? "Error al imponer la multa"}
                          </p>
                        )}
                      </form>
                    </td>
                  </tr>
                )}

                {clienteBajaId === c.id && (
                  <tr className="bg-red-50 dark:bg-red-950/20">
                    <td colSpan={puedeMikrotik ? 7 : 5} className="px-4 py-3">
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          darDeBaja.mutate(c.id);
                        }}
                        className="flex flex-wrap items-end gap-2"
                      >
                        <div>
                          <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Fecha de baja</label>
                          <input
                            type="date"
                            required
                            autoFocus
                            value={formBaja.fechaBaja}
                            onChange={(e) => setFormBaja({ ...formBaja, fechaBaja: e.target.value })}
                            className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
                          />
                        </div>
                        <div className="flex-1 min-w-[200px]">
                          <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Motivo (opcional)</label>
                          <input
                            placeholder="Ej. abandono del servicio, cambio de proveedor..."
                            value={formBaja.motivo}
                            onChange={(e) => setFormBaja({ ...formBaja, motivo: e.target.value })}
                            className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={darDeBaja.isPending}
                          className="bg-red-600 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                        >
                          {darDeBaja.isPending ? "Guardando..." : "Confirmar baja"}
                        </button>
                        {c.vigencia && (
                          <p className="basis-full text-[11px] text-gray-500 dark:text-gray-400">
                            {c.vigencia.cumplioVigencia
                              ? "Con la fecha de baja de hoy, ya cumplió la vigencia mínima — no procedería multa."
                              : `Con la fecha de baja de hoy, aún faltan ${c.vigencia.diasFaltantes} día(s) para la vigencia mínima — procedería evaluar multa por abandono/término injustificado.`}
                          </p>
                        )}
                        {darDeBaja.isError && (
                          <p className="basis-full text-red-600 dark:text-red-400 text-xs">
                            {(darDeBaja.error as any)?.response?.data?.error ?? "Error al dar de baja al cliente"}
                          </p>
                        )}
                      </form>
                    </td>
                  </tr>
                )}

                {clienteEditandoId === c.id && (
                  <tr className="bg-stone-50 dark:bg-gray-700/40">
                    <td colSpan={puedeMikrotik ? 7 : 5} className="px-4 py-3">
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          editarCliente.mutate(c.id);
                        }}
                        className="grid grid-cols-2 gap-2"
                      >
                        <input
                          placeholder="Razón social / Nombres"
                          required
                          autoFocus
                          value={editForm.razonSocial}
                          onChange={(e) => setEditForm({ ...editForm, razonSocial: e.target.value })}
                          className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm col-span-2"
                        />
                        <input
                          type="email"
                          placeholder="Correo electrónico"
                          value={editForm.email}
                          onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                          className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
                        />
                        <input
                          placeholder="Teléfono"
                          value={editForm.telefono}
                          onChange={(e) => setEditForm({ ...editForm, telefono: e.target.value })}
                          className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
                        />
                        <input
                          placeholder="Dirección"
                          value={editForm.direccion}
                          onChange={(e) => setEditForm({ ...editForm, direccion: e.target.value })}
                          className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
                        />
                        <input
                          placeholder="Ciudad"
                          value={editForm.ciudad}
                          onChange={(e) => setEditForm({ ...editForm, ciudad: e.target.value })}
                          className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
                        />
                        <div>
                          <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">
                            Tipo de precio (margen al venderle equipos/servicios)
                          </label>
                          <select
                            value={editForm.tipoPrecioId}
                            onChange={(e) => setEditForm({ ...editForm, tipoPrecioId: e.target.value })}
                            className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
                          >
                            {tiposPrecio?.map((tp) => (
                              <option key={tp.id} value={tp.id}>
                                {tp.nombre} (+{tp.porcentajeGanancia}%)
                              </option>
                            ))}
                          </select>
                        </div>
                        <CampoPegarUbicacion
                          latitud={editForm.latitud}
                          longitud={editForm.longitud}
                          onDetectar={(lat, lng) => setEditForm({ ...editForm, latitud: lat, longitud: lng })}
                          className="col-span-2"
                        />
                        {puedeMikrotik && (
                          <>
                            <select
                              value={editForm.nodoId}
                              onChange={(e) => setEditForm({ ...editForm, nodoId: e.target.value, vlanNodoId: "" })}
                              className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
                            >
                              <option value="">Sin nodo de red</option>
                              {nodos?.map((n) => (
                                <option key={n.id} value={n.id}>
                                  {n.nombre}
                                </option>
                              ))}
                            </select>
                            <VlanSelect nodoId={editForm.nodoId} value={editForm.vlanNodoId} onChange={(v) => setEditForm({ ...editForm, vlanNodoId: v })} />
                            <div>
                              <input
                                list={`ips-libres-editar-${c.id}`}
                                placeholder="Dirección IP (opcional, ej. 10.15.0.9)"
                                value={editForm.direccionIp}
                                onChange={(e) => setEditForm({ ...editForm, direccionIp: e.target.value })}
                                className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
                              />
                              <IpsLibresDatalist id={`ips-libres-editar-${c.id}`} nodoId={editForm.nodoId} />
                              <RangoIpSugerido nodoId={editForm.nodoId} nodos={nodos} />
                            </div>
                            <select
                              value={editForm.planInternetId}
                              onChange={(e) => setEditForm({ ...editForm, planInternetId: e.target.value })}
                              className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm col-span-2"
                            >
                              <option value="">Sin plan de internet</option>
                              {planesInternet?.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.nombre} ({p.velocidadSubida}/{p.velocidadBajada})
                                </option>
                              ))}
                            </select>
                            <div className="col-span-2">
                              <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">
                                Fecha de firma del contrato (opcional)
                              </label>
                              <input
                                type="date"
                                value={editForm.fechaContrato}
                                onChange={(e) => setEditForm({ ...editForm, fechaContrato: e.target.value })}
                                className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
                              />
                              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                                El día del mes de esta fecha es su propio día de corte — sin esto, sigue con el día de corte general de la empresa.
                              </p>
                            </div>
                            <div>
                              <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">
                                Fecha de inicio del servicio
                              </label>
                              <input
                                type="date"
                                value={editForm.fechaInicioServicio}
                                onChange={(e) => setEditForm({ ...editForm, fechaInicioServicio: e.target.value })}
                                className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">
                                Vigencia mínima del contrato
                              </label>
                              <select
                                value={editForm.vigenciaContratoMeses}
                                onChange={(e) => setEditForm({ ...editForm, vigenciaContratoMeses: e.target.value })}
                                className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm"
                              >
                                <option value="">Sin plazo mínimo pactado</option>
                                {OPCIONES_VIGENCIA_MESES.map((meses) => (
                                  <option key={meses} value={meses}>
                                    {etiquetaVigencia(meses)}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </>
                        )}
                        <div className="col-span-2 flex gap-2">
                          <button
                            type="submit"
                            disabled={editarCliente.isPending}
                            className="flex-1 bg-brand-700 text-white py-1.5 rounded-md text-sm font-semibold hover:bg-brand-800 disabled:opacity-50"
                          >
                            {editarCliente.isPending ? "Guardando..." : "Guardar cambios"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setClienteEditandoId(null)}
                            className="flex-1 bg-stone-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 py-1.5 rounded-md text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-500"
                          >
                            Cancelar
                          </button>
                        </div>
                        {editarCliente.isError && (
                          <p className="col-span-2 text-red-600 dark:text-red-400 text-xs">
                            {(editarCliente.error as any)?.response?.data?.error ?? "Error al guardar los cambios"}
                          </p>
                        )}
                      </form>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        </div>
        {respuesta && (
          <Paginacion
            page={respuesta.paginacion.page}
            totalPaginas={respuesta.paginacion.totalPaginas}
            total={respuesta.paginacion.total}
            onCambiarPagina={setPagina}
          />
        )}
      </div>

      {clienteHistorialId !== null && (
        <HistorialClienteModal
          clienteId={clienteHistorialId}
          nombreCliente={clientes?.find((c) => c.id === clienteHistorialId)?.razonSocial ?? ""}
          onCerrar={() => setClienteHistorialId(null)}
        />
      )}

      {clienteMapaId !== null &&
        (() => {
          const c = clientes?.find((cl) => cl.id === clienteMapaId);
          if (!c?.latitud || !c?.longitud) return null;
          const lat = Number(c.latitud);
          const lng = Number(c.longitud);
          return (
            <Modal titulo={`Ubicación — ${c.razonSocial}`} onCerrar={() => setClienteMapaId(null)} ancho="max-w-2xl">
              <MapaPunto latitud={lat} longitud={lng} etiqueta={c.razonSocial} alturaPx={360} />
              <a
                href={urlMapa({ lat, lng })}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-3 text-xs text-sky-600 dark:text-sky-400 hover:underline"
              >
                Abrir en Google Maps (para navegación desde el celular)
              </a>
            </Modal>
          );
        })()}
    </div>
  );
}

// Texto legible para cada plazo de OPCIONES_VIGENCIA_MESES (6/12/24/36).
function etiquetaVigencia(meses: number): string {
  if (meses === 6) return "6 meses";
  if (meses === 12) return "1 año";
  return `${meses / 12} años`;
}

// Debajo del campo de IP, un recordatorio del rango configurado para el
// nodo elegido — el sistema no reserva ni valida el rango de verdad (la IP
// la asigna a mano el técnico), es solo una ayuda visual para no perder de
// vista de qué sector es cada bloque de IPs.
function RangoIpSugerido({ nodoId, nodos }: { nodoId: string; nodos: NodoRed[] | undefined }) {
  if (!nodoId) return null;
  const nodo = nodos?.find((n) => String(n.id) === nodoId);
  if (!nodo?.rangoIpInicio || !nodo?.rangoIpFin) return null;
  return (
    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
      Rango de {nodo.nombre}: {nodo.rangoIpInicio} – {nodo.rangoIpFin}
    </p>
  );
}

// Sugerencias de autocompletado (IPs libres dentro del rango del nodo, ya
// descontando las que otros clientes tienen asignadas) — el campo de IP
// sigue siendo de texto libre, esto solo ahorra tener que ir probando IPs
// una por una hasta encontrar una que no esté repetida. Se pide solo
// cuando hay un nodo elegido, y con staleTime alto porque no hace falta
// recalcularla en cada tecla que se escribe en el formulario.
function IpsLibresDatalist({ id, nodoId }: { id: string; nodoId: string }) {
  const { data: ipsLibres } = useQuery({
    queryKey: ["nodo-ips-libres", nodoId],
    queryFn: async () => (await api.get<string[]>(`/nodos-red/${nodoId}/ips-libres`)).data,
    enabled: !!nodoId,
    staleTime: 30_000,
  });
  return (
    <datalist id={id}>
      {ipsLibres?.map((ip) => (
        <option key={ip} value={ip} />
      ))}
    </datalist>
  );
}

// Selector de VLAN dentro del nodo elegido — opcional, solo tiene sentido si
// el nodo tiene alguna VLAN guardada (ver "VLANs" en Nodos de Red). Se
// resetea a "" cada vez que cambia el nodo, para no arrastrar la VLAN de un
// nodo distinto.
function VlanSelect({
  nodoId,
  value,
  onChange,
  placeholder = "Sin VLAN específica",
}: {
  nodoId: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const { data: vlans } = useQuery({
    queryKey: ["vlans-nodo", nodoId],
    queryFn: async () => (await api.get<VlanNodo[]>(`/nodos-red/${nodoId}/vlans`)).data,
    enabled: !!nodoId,
  });
  if (!nodoId || !vlans || vlans.length === 0) return null;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm shrink-0"
    >
      <option value="">{placeholder}</option>
      {vlans.map((v) => (
        <option key={v.id} value={v.id}>
          {v.nombre} (VLAN {v.vlanId})
        </option>
      ))}
    </select>
  );
}

// Encabezado de columna clickeable para ordenar la tabla — ▲/▼ cuando esta
// columna es la que ordena ahora mismo, ⇅ tenue en el resto para indicar
// que también se puede. El orden solo reordena la página actual (ver el
// comentario junto a "clientesOrdenados" más arriba, sobre por qué).
function ThOrdenable<C extends string>({
  etiqueta,
  columna,
  ordenColumna,
  ordenDireccion,
  onClick,
}: {
  etiqueta: string;
  columna: C;
  ordenColumna: C | null;
  ordenDireccion: "asc" | "desc";
  onClick: (columna: C) => void;
}) {
  const activo = ordenColumna === columna;
  return (
    <th className="px-4 py-2">
      <button
        onClick={() => onClick(columna)}
        className="flex items-center gap-1 font-medium hover:text-gray-800 dark:hover:text-gray-100"
      >
        {etiqueta}
        <span className={`text-[10px] ${activo ? "text-sky-600 dark:text-sky-400" : "text-gray-300 dark:text-gray-600"}`}>
          {activo ? (ordenDireccion === "asc" ? "▲" : "▼") : "⇅"}
        </span>
      </button>
    </th>
  );
}

