import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, URL_BASE_API, type Sucursal, type CodigosSri } from "../api/client";
import { useToast } from "../components/ToastProvider";
import { useConfirm } from "../components/ConfirmProvider";
import { MapaGeocerca } from "../components/MapaGeocerca";
import { DiccionarioBuscador } from "../components/DiccionarioBuscador";
import { normalizarTexto } from "../components/BuscadorDocumentos";
import { CLASE_CAMPO, CLASE_ETIQUETA } from "../components/FormatoDocumento";

interface RespuestaLogo {
  logoUrl: string | null;
}

interface DatosEmpresa {
  nombre: string;
  ruc: string;
  razonSocial: string;
  direccionMatriz: string;
  ambienteSri: "1" | "2";
  establecimiento: string;
  puntoEmision: string;
  obligadoContabilidad: boolean;
  emailResumenDestinatario: string;
  agenteRetencion: boolean;
  diaInicioCorte: number;
  diaFinCorte: number;
  tieneCertificado: boolean;
}

interface SecuencialInicial {
  tipoComprobante: string;
  etiqueta: string;
  ultimoNumero: number;
  totalDocumentos: number;
  editable: boolean;
}

interface RespuestaBackupComprobantes {
  configurado: boolean;
  carpetaBackup: string | null;
  totalPrincipal: number;
  totalBackup: number;
}

interface RespuestaBackupDb {
  configurado: boolean;
  ultimoExitoso: string | null;
  ultimoError: string | null;
  ultimoIntento: string | null;
  archivo: string | null;
  atrasado: boolean;
}

interface DatosWhatsapp {
  configurado: boolean;
  tieneAccessToken: boolean;
  whatsappPhoneNumberId: string;
  whatsappTemplateRecordatorio: string;
  whatsappTemplateIdioma: string;
  whatsappRecordatorioDiasAntes: number;
  whatsappRecordatorioHora: number | null;
  whatsappTemplateEncuesta: string;
}

// Índice de secciones para el buscador de Ajustes (esta pantalla no tiene
// listados: el buscador lleva directo a la sección que se busca).
const SECCIONES_AJUSTES: { id: string; titulo: string; palabras: string }[] = [
  { id: "ajuste-empresa", titulo: "Datos de la empresa", palabras: "RUC razón social dirección nombre comercial contabilidad agente retención ambiente" },
  { id: "ajuste-certificado", titulo: "Certificado de firma electrónica", palabras: "firma p12 clave contraseña SRI vencimiento" },
  { id: "ajuste-logo", titulo: "Logo de la empresa", palabras: "imagen RIDE PDF" },
  { id: "ajuste-respaldo-comprobantes", titulo: "Respaldo de comprobantes autorizados", palabras: "backup XML carpeta" },
  { id: "ajuste-respaldo-db", titulo: "Respaldo de base de datos", palabras: "backup copia seguridad" },
  { id: "ajuste-geocercas", titulo: "Geocercas de sucursales", palabras: "sucursal ubicación GPS marcación radio" },
  { id: "ajuste-numeracion", titulo: "Numeración inicial", palabras: "secuencial número factura nota" },
  { id: "ajuste-codigos-sri", titulo: "Códigos SRI", palabras: "forma de pago tipo identificación" },
  { id: "ajuste-whatsapp", titulo: "Recordatorio de vencimiento por WhatsApp", palabras: "mensaje cobro recordatorio" },
];

// El logo se sube tal cual se ve en el RIDE (PDF de factura/nota de crédito)
// — no hay vista previa "simulada", la imagen mostrada acá ES el archivo que
// generarRide.ts va a incrustar arriba a la izquierda del PDF.
export function AjustesPage() {
  const [busquedaAjuste, setBusquedaAjuste] = useState("");
  const queryClient = useQueryClient();
  const { mostrarToast } = useToast();
  const confirmar = useConfirm();
  const [archivo, setArchivo] = useState<File | null>(null);

  // --- Datos de la empresa (RUC, ambiente SRI, etc.) ---
  const { data: empresa, isLoading: cargandoEmpresa } = useQuery({
    queryKey: ["configuracion-empresa"],
    queryFn: async () => (await api.get<DatosEmpresa>("/configuracion/empresa")).data,
  });

  const [formEmpresa, setFormEmpresa] = useState<Omit<DatosEmpresa, "tieneCertificado"> | null>(null);

  // El formulario se llena una vez que llega la respuesta del servidor — así
  // el usuario nunca ve campos vacíos "parpadear" antes de tener los datos reales.
  useEffect(() => {
    if (empresa) {
      const { tieneCertificado: _tieneCertificado, ...editable } = empresa;
      setFormEmpresa(editable);
    }
  }, [empresa]);

  const guardarEmpresa = useMutation({
    mutationFn: async () => (await api.put<DatosEmpresa>("/configuracion/empresa", formEmpresa)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["configuracion-empresa"] });
      mostrarToast("Datos de la empresa actualizados", "success");
    },
    onError: (error: any) => {
      mostrarToast(error.response?.data?.error ?? "Error al guardar los datos de la empresa");
    },
  });

  async function confirmarGuardarEmpresa(e: React.FormEvent) {
    e.preventDefault();
    if (!formEmpresa) return;
    if (formEmpresa.ambienteSri === "2" && empresa?.ambienteSri !== "2") {
      const ok = await confirmar(
        "Vas a pasar esta empresa a ambiente de PRODUCCIÓN: de ahora en adelante, cada factura y nota de " +
          "crédito que envíes va en serio al SRI. Necesitas un certificado de firma real (no el de pruebas) " +
          "para poder enviarlas. ¿Continuar?"
      );
      if (!ok) return;
    }
    guardarEmpresa.mutate();
  }

  // --- Certificado de firma electrónica (.p12) ---
  const [archivoCertificado, setArchivoCertificado] = useState<File | null>(null);
  const [passwordCertificado, setPasswordCertificado] = useState("");

  const subirCertificado = useMutation({
    mutationFn: async () => {
      const datosFormulario = new FormData();
      datosFormulario.append("certificado", archivoCertificado!);
      datosFormulario.append("password", passwordCertificado);
      return api.post("/configuracion/certificado", datosFormulario);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["configuracion-empresa"] });
      setArchivoCertificado(null);
      setPasswordCertificado("");
      mostrarToast("Certificado actualizado", "success");
    },
    onError: (error: any) => {
      mostrarToast(error.response?.data?.error ?? "Error al subir el certificado");
    },
  });

  // --- WhatsApp Business (recordatorio de vencimiento de internet) ---
  const { data: whatsapp, isLoading: cargandoWhatsapp } = useQuery({
    queryKey: ["configuracion-whatsapp"],
    queryFn: async () => (await api.get<DatosWhatsapp>("/configuracion/whatsapp")).data,
  });

  const [formWhatsapp, setFormWhatsapp] = useState<{
    accessToken: string;
    phoneNumberId: string;
    plantilla: string;
    idioma: string;
    diasAntes: string;
    hora: string;
    plantillaEncuesta: string;
  } | null>(null);

  // El Access Token NUNCA llega del servidor (es un secreto) — el campo
  // siempre arranca vacío, "dejar vacío" significa "no lo cambies" (ver
  // PUT /configuracion/whatsapp en el backend).
  useEffect(() => {
    if (whatsapp) {
      setFormWhatsapp({
        accessToken: "",
        phoneNumberId: whatsapp.whatsappPhoneNumberId,
        plantilla: whatsapp.whatsappTemplateRecordatorio,
        idioma: whatsapp.whatsappTemplateIdioma,
        diasAntes: String(whatsapp.whatsappRecordatorioDiasAntes),
        hora: whatsapp.whatsappRecordatorioHora === null ? "" : String(whatsapp.whatsappRecordatorioHora),
        plantillaEncuesta: whatsapp.whatsappTemplateEncuesta ?? "",
      });
    }
  }, [whatsapp]);

  const guardarWhatsapp = useMutation({
    mutationFn: async () => (await api.put<DatosWhatsapp>("/configuracion/whatsapp", formWhatsapp)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["configuracion-whatsapp"] });
      setFormWhatsapp((f) => (f ? { ...f, accessToken: "" } : f));
      mostrarToast("Configuración de WhatsApp guardada", "success");
    },
    onError: (error: any) => {
      mostrarToast(error.response?.data?.error ?? "Error al guardar la configuración de WhatsApp");
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["configuracion-logo"],
    queryFn: async () => (await api.get<RespuestaLogo>("/configuracion/logo")).data,
  });

  const subirLogo = useMutation({
    mutationFn: async () => {
      const datosFormulario = new FormData();
      datosFormulario.append("logo", archivo!);
      return api.post<RespuestaLogo>("/configuracion/logo", datosFormulario);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["configuracion-logo"] });
      setArchivo(null);
    },
    onError: (error: any) => {
      mostrarToast(error.response?.data?.error ?? "Error al subir el logo");
    },
  });

  const quitarLogo = useMutation({
    mutationFn: async () => api.delete("/configuracion/logo"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["configuracion-logo"] });
    },
  });

  async function confirmarQuitar() {
    const ok = await confirmar("¿Quitar el logo? Las próximas facturas y notas de crédito se generarán sin logo.");
    if (ok) quitarLogo.mutate();
  }

  const { data: backup, isLoading: cargandoBackup } = useQuery({
    queryKey: ["backup-comprobantes"],
    queryFn: async () => (await api.get<RespuestaBackupComprobantes>("/configuracion/backup-comprobantes")).data,
  });

  const ejecutarBackup = useMutation({
    mutationFn: async () => (await api.post("/configuracion/backup-comprobantes/ejecutar")).data as { mensaje: string },
    onSuccess: (respuesta) => {
      queryClient.invalidateQueries({ queryKey: ["backup-comprobantes"] });
      mostrarToast(respuesta.mensaje, "success");
    },
    onError: (error: any) => {
      mostrarToast(error.response?.data?.error ?? "Error al ejecutar el respaldo");
    },
  });

  // --- Respaldo automático de base de datos ---
  const { data: backupDb, isLoading: cargandoBackupDb } = useQuery({
    queryKey: ["backup-db"],
    queryFn: async () => (await api.get<RespuestaBackupDb>("/configuracion/backup-db")).data,
  });

  const ejecutarBackupDb = useMutation({
    mutationFn: async () => (await api.post("/configuracion/backup-db/ejecutar")).data as { mensaje: string },
    onSuccess: (respuesta) => {
      queryClient.invalidateQueries({ queryKey: ["backup-db"] });
      mostrarToast(respuesta.mensaje, "success");
    },
    onError: (error: any) => {
      mostrarToast(error.response?.data?.error ?? "Error al ejecutar el respaldo");
    },
  });

  // --- Geocercas de sucursales (marcaciones de asistencia) ---
  const { data: sucursales, isLoading: cargandoSucursales } = useQuery({
    queryKey: ["sucursales"],
    queryFn: async () => (await api.get<Sucursal[]>("/sucursales")).data,
  });

  const [geocercaForms, setGeocercaForms] = useState<Record<number, { latitud: string; longitud: string; radioGeocercaMetros: string }>>({});

  useEffect(() => {
    if (!sucursales) return;
    setGeocercaForms((actual) => {
      const nuevo = { ...actual };
      for (const s of sucursales) {
        if (!nuevo[s.id]) {
          nuevo[s.id] = {
            latitud: s.latitud ?? "",
            longitud: s.longitud ?? "",
            radioGeocercaMetros: s.radioGeocercaMetros != null ? String(s.radioGeocercaMetros) : "",
          };
        }
      }
      return nuevo;
    });
  }, [sucursales]);

  const guardarGeocerca = useMutation({
    mutationFn: async (sucursalId: number) => {
      const form = geocercaForms[sucursalId];
      return api.patch(`/sucursales/${sucursalId}/geocerca`, {
        latitud: form.latitud ? Number(form.latitud) : null,
        longitud: form.longitud ? Number(form.longitud) : null,
        radioGeocercaMetros: form.radioGeocercaMetros ? Number(form.radioGeocercaMetros) : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sucursales"] });
      mostrarToast("Geocerca actualizada", "success");
    },
    onError: (error: any) => {
      mostrarToast(error.response?.data?.error ?? "Error al guardar la geocerca");
    },
  });

  function usarUbicacionActual(sucursalId: number) {
    if (!("geolocation" in navigator)) {
      mostrarToast("Este navegador no puede obtener tu ubicación");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (posicion) => {
        setGeocercaForms((actual) => ({
          ...actual,
          [sucursalId]: {
            ...actual[sucursalId],
            latitud: String(posicion.coords.latitude),
            longitud: String(posicion.coords.longitude),
          },
        }));
      },
      () => mostrarToast("No se pudo obtener tu ubicación — revisa el permiso de ubicación del navegador"),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  // --- Numeración inicial de comprobantes (go-live: continuar la
  // numeración que el negocio ya tenía verificada por el SRI antes de usar
  // este sistema) ---
  const { data: secuenciales, isLoading: cargandoSecuenciales } = useQuery({
    queryKey: ["configuracion-secuenciales"],
    queryFn: async () => (await api.get<SecuencialInicial[]>("/configuracion/secuenciales")).data,
  });
  const [formSecuenciales, setFormSecuenciales] = useState<Record<string, string>>({});

  useEffect(() => {
    if (secuenciales) {
      setFormSecuenciales(Object.fromEntries(secuenciales.map((s) => [s.tipoComprobante, String(s.ultimoNumero)])));
    }
  }, [secuenciales]);

  const guardarSecuencial = useMutation({
    mutationFn: async (tipoComprobante: string) =>
      (
        await api.put<SecuencialInicial>(`/configuracion/secuenciales/${tipoComprobante}`, {
          ultimoNumero: Number(formSecuenciales[tipoComprobante]),
        })
      ).data,
    onSuccess: (respuesta) => {
      queryClient.invalidateQueries({ queryKey: ["configuracion-secuenciales"] });
      mostrarToast(`${respuesta.etiqueta}: el próximo comprobante será el Nº ${respuesta.ultimoNumero + 1}`, "success");
    },
    onError: (error: any) => {
      mostrarToast(error.response?.data?.error ?? "Error al guardar la numeración inicial");
    },
  });

  async function confirmarGuardarSecuencial(tipoComprobante: string, etiqueta: string) {
    const ok = await confirmar(
      `El próximo ${etiqueta.toLowerCase()} emitido en este sistema será el Nº ${
        Number(formSecuenciales[tipoComprobante] || 0) + 1
      }. Verifica que coincida exactamente con lo que ya tienes autorizado por el SRI antes de continuar — ` +
        "una vez que emitas el primero, este número ya no se puede volver a editar. ¿Guardar?"
    );
    if (ok) guardarSecuencial.mutate(tipoComprobante);
  }

  // --- Códigos SRI (tipo de identificación / forma de pago / % IVA) ---
  // No es por empresa (ver GET /configuracion/codigos-sri) — un solo
  // conjunto de códigos, editable acá para cuando el SRI actualiza alguna
  // de estas tablas, sin tocar código ni volver a desplegar (ver el aviso
  // rojo en la pantalla ATS).
  const { data: codigosSri } = useQuery({
    queryKey: ["configuracion-codigos-sri"],
    queryFn: async () => (await api.get<CodigosSri>("/configuracion/codigos-sri")).data,
  });
  const [formTipoIdentificacion, setFormTipoIdentificacion] = useState<Record<string, string> | null>(null);
  const [formFormaPago, setFormFormaPago] = useState<Record<string, string> | null>(null);
  const [filasIva, setFilasIva] = useState<{ porcentaje: string; codigo: string }[]>([]);

  useEffect(() => {
    if (codigosSri) {
      setFormTipoIdentificacion({ ...codigosSri.tipoIdentificacion });
      setFormFormaPago({ ...codigosSri.formaPago });
      setFilasIva(Object.entries(codigosSri.porcentajeIva).map(([porcentaje, codigo]) => ({ porcentaje, codigo })));
    }
  }, [codigosSri]);

  const guardarCodigosSri = useMutation({
    mutationFn: async () => {
      const porcentajeIva: Record<string, string> = {};
      for (const fila of filasIva) {
        if (fila.porcentaje.trim()) porcentajeIva[fila.porcentaje.trim()] = fila.codigo.trim();
      }
      return (
        await api.put<CodigosSri>("/configuracion/codigos-sri", {
          tipoIdentificacion: formTipoIdentificacion,
          formaPago: formFormaPago,
          porcentajeIva,
        })
      ).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["configuracion-codigos-sri"] });
      mostrarToast("Códigos SRI actualizados", "success");
    },
    onError: (error: any) => {
      mostrarToast(error.response?.data?.error ?? "Error al guardar los códigos SRI");
    },
  });

  const ETIQUETAS_TIPO_IDENTIFICACION: Record<string, string> = {
    RUC: "RUC",
    CEDULA: "Cédula",
    PASAPORTE: "Pasaporte",
    CONSUMIDOR_FINAL: "Consumidor final",
  };
  const ETIQUETAS_FORMA_PAGO: Record<string, string> = {
    EFECTIVO: "Efectivo",
    TRANSFERENCIA: "Transferencia",
    CHEQUE: "Cheque",
    OTRO: "Otro",
    TARJETA_DEBITO: "Tarjeta débito",
    TARJETA_CREDITO: "Tarjeta crédito",
  };

  // Buscador de secciones: filtra el índice y, con Enter o clic, lleva a la
  // sección (scroll suave). No oculta nada: todas las secciones siguen ahí.
  const seccionesEncontradas = SECCIONES_AJUSTES.filter((sec) => {
    const t = normalizarTexto(busquedaAjuste.trim());
    return !t || normalizarTexto(`${sec.titulo} ${sec.palabras}`).includes(t);
  });
  function irASeccion(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="space-y-4">
      <div className="max-w-4xl bg-white dark:bg-gray-800 border border-stone-300 dark:border-gray-700">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-stone-300 dark:border-gray-700">
        <h2 className="text-base font-bold text-gray-900 dark:text-gray-50">Ajustes</h2>
        <span className="font-mono text-[11px] text-gray-400 dark:text-gray-500">{SECCIONES_AJUSTES.length} secciones</span>
      </div>

      <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-stone-300 dark:border-gray-700">
        <div className="flex items-end gap-2 p-3 bg-stone-50 dark:bg-gray-900/40 border-b border-stone-300 dark:border-gray-700">
          <label className="flex flex-col gap-1 flex-1 min-w-0">
            <span className={CLASE_ETIQUETA}>Buscar ajuste · ej. certificado, logo, secuencial, WhatsApp</span>
            <input
              type="text"
              value={busquedaAjuste}
              onChange={(e) => setBusquedaAjuste(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && seccionesEncontradas[0]) irASeccion(seccionesEncontradas[0].id);
                if (e.key === "Escape") setBusquedaAjuste("");
              }}
              placeholder="Escribe y presiona Enter para ir a la sección..."
              className={CLASE_CAMPO}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5 px-3 py-2">
          {seccionesEncontradas.length === 0 && (
            <span className="text-xs text-gray-400 dark:text-gray-500">Ninguna sección coincide con la búsqueda.</span>
          )}
          {seccionesEncontradas.map((sec) => (
            <button
              key={sec.id}
              type="button"
              onClick={() => irASeccion(sec.id)}
              className="font-mono text-[10px] uppercase tracking-wider border border-stone-300 dark:border-gray-600 px-2 py-1 rounded-sm text-gray-600 dark:text-gray-300 hover:border-brand-600 hover:text-brand-700 dark:hover:text-brand-300"
            >
              {sec.titulo}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5 [&>*:not(h3)]:max-w-2xl">
        <h3 id="ajuste-empresa" className="scroll-mt-44 -mx-5 -mt-5 mb-3 px-5 py-2.5 bg-stone-50 dark:bg-gray-900/40 border-b border-stone-200 dark:border-gray-700 font-mono text-[11px] uppercase tracking-[0.15em] text-gray-700 dark:text-gray-200">Datos de la empresa</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          RUC, razón social y ambiente SRI usados al firmar y enviar facturas y notas de crédito.
        </p>

        {cargandoEmpresa || !formEmpresa ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>
        ) : (
          <form onSubmit={confirmarGuardarEmpresa} className="space-y-3">
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Nombre</label>
              <input
                type="text"
                value={formEmpresa.nombre}
                onChange={(e) => setFormEmpresa({ ...formEmpresa, nombre: e.target.value })}
                required
                className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-3 py-1.5 text-sm"
              />
            </div>

            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">RUC</label>
              <input
                type="text"
                value={formEmpresa.ruc}
                onChange={(e) => setFormEmpresa({ ...formEmpresa, ruc: e.target.value })}
                required
                className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-3 py-1.5 text-sm"
              />
            </div>

            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Razón social</label>
              <input
                type="text"
                value={formEmpresa.razonSocial}
                onChange={(e) => setFormEmpresa({ ...formEmpresa, razonSocial: e.target.value })}
                required
                className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-3 py-1.5 text-sm"
              />
            </div>

            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Dirección matriz</label>
              <input
                type="text"
                value={formEmpresa.direccionMatriz}
                onChange={(e) => setFormEmpresa({ ...formEmpresa, direccionMatriz: e.target.value })}
                className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-3 py-1.5 text-sm"
              />
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Establecimiento</label>
                <input
                  type="text"
                  value={formEmpresa.establecimiento}
                  onChange={(e) => setFormEmpresa({ ...formEmpresa, establecimiento: e.target.value })}
                  className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-3 py-1.5 text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Punto de emisión</label>
                <input
                  type="text"
                  value={formEmpresa.puntoEmision}
                  onChange={(e) => setFormEmpresa({ ...formEmpresa, puntoEmision: e.target.value })}
                  className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-3 py-1.5 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Ambiente SRI</label>
              <select
                value={formEmpresa.ambienteSri}
                onChange={(e) => setFormEmpresa({ ...formEmpresa, ambienteSri: e.target.value as "1" | "2" })}
                className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-3 py-1.5 text-sm"
              >
                <option value="1">Ambiente: Pruebas</option>
                <option value="2">Ambiente: Producción</option>
              </select>
              {formEmpresa.ambienteSri === "2" && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  En producción, cada comprobante enviado va en serio al SRI. Verifica que el certificado
                  cargado abajo sea el real, no el de pruebas.
                </p>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={formEmpresa.obligadoContabilidad}
                onChange={(e) => setFormEmpresa({ ...formEmpresa, obligadoContabilidad: e.target.checked })}
              />
              Obligado a llevar contabilidad
            </label>

            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={formEmpresa.agenteRetencion}
                onChange={(e) => setFormEmpresa({ ...formEmpresa, agenteRetencion: e.target.checked })}
              />
              Agente de retención autorizado por el SRI
            </label>

            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">
                Ciclo de corte de internet por falta de pago
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 dark:text-gray-300">Del día</span>
                <input
                  type="number"
                  min={1}
                  max={28}
                  value={formEmpresa.diaInicioCorte}
                  onChange={(e) => setFormEmpresa({ ...formEmpresa, diaInicioCorte: Number(e.target.value) })}
                  className="w-16 border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm text-center"
                />
                <span className="text-sm text-gray-600 dark:text-gray-300">al día</span>
                <input
                  type="number"
                  min={1}
                  max={28}
                  value={formEmpresa.diaFinCorte}
                  onChange={(e) => setFormEmpresa({ ...formEmpresa, diaFinCorte: Number(e.target.value) })}
                  className="w-16 border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm text-center"
                />
                <span className="text-sm text-gray-600 dark:text-gray-300">de cada mes</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Ventana para pagar la factura del plan de internet sin que se suspenda el servicio. Pasado el día{" "}
                {formEmpresa.diaFinCorte || 5}, el sistema corta solo a quien no pagó — el día{" "}
                {(formEmpresa.diaFinCorte || 5) + 1} arranca, en la práctica, el corte/facturación del mes. Editable
                cada mes si hace falta.
              </p>
            </div>

            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">
                Correo para el resumen diario
              </label>
              <input
                type="text"
                data-no-mayus="true"
                value={formEmpresa.emailResumenDestinatario}
                onChange={(e) => setFormEmpresa({ ...formEmpresa, emailResumenDestinatario: e.target.value })}
                placeholder="correo@negocio.com, otro@negocio.com"
                className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-3 py-1.5 text-sm"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Cuentas por cobrar pendientes, stock bajo, comprobantes sin autorizar y aviso de certificado
                por caducar, una vez al día. Admite varios correos separados por coma. Vacío = no se envía
                nada.
              </p>
            </div>

            <button
              type="submit"
              disabled={guardarEmpresa.isPending}
              className="bg-brand-700 text-white px-4 py-1.5 rounded-sm text-sm font-semibold hover:bg-brand-800 disabled:opacity-50"
            >
              {guardarEmpresa.isPending ? "Guardando..." : "Guardar cambios"}
            </button>
          </form>
        )}
      </div>

      <div className="p-5 border-t border-stone-300 dark:border-gray-700 [&>*:not(h3)]:max-w-2xl">
        <h3 id="ajuste-certificado" className="scroll-mt-44 -mx-5 -mt-5 mb-3 px-5 py-2.5 bg-stone-50 dark:bg-gray-900/40 border-b border-stone-200 dark:border-gray-700 font-mono text-[11px] uppercase tracking-[0.15em] text-gray-700 dark:text-gray-200">Certificado de firma electrónica</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Archivo <code>.p12</code>/<code>.pfx</code> usado para firmar los comprobantes antes de enviarlos al
          SRI. Subir uno nuevo reemplaza al anterior.
        </p>

        <p className="text-sm mb-4">
          Estado actual:{" "}
          {cargandoEmpresa ? (
            <span className="text-gray-400 dark:text-gray-500">Cargando...</span>
          ) : empresa?.tieneCertificado ? (
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">Certificado configurado</span>
          ) : (
            <span className="text-red-600 dark:text-red-400 font-medium">Sin certificado — no se pueden enviar comprobantes</span>
          )}
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (archivoCertificado && passwordCertificado) subirCertificado.mutate();
          }}
          className="space-y-3"
        >
          <input
            type="file"
            accept=".p12,.pfx"
            onChange={(e) => setArchivoCertificado(e.target.files?.[0] ?? null)}
            className="text-sm text-gray-700 dark:text-gray-300"
          />
          <input
            type="password"
            placeholder="Contraseña del certificado"
            value={passwordCertificado}
            onChange={(e) => setPasswordCertificado(e.target.value)}
            className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={!archivoCertificado || !passwordCertificado || subirCertificado.isPending}
            className="bg-brand-700 text-white px-4 py-1.5 rounded-sm text-sm font-semibold hover:bg-brand-800 disabled:opacity-50"
          >
            {subirCertificado.isPending ? "Subiendo..." : "Subir certificado"}
          </button>
        </form>
      </div>

      <div className="p-5 border-t border-stone-300 dark:border-gray-700 [&>*:not(h3)]:max-w-2xl">
        <h3 id="ajuste-logo" className="scroll-mt-44 -mx-5 -mt-5 mb-3 px-5 py-2.5 bg-stone-50 dark:bg-gray-900/40 border-b border-stone-200 dark:border-gray-700 font-mono text-[11px] uppercase tracking-[0.15em] text-gray-700 dark:text-gray-200">Logo de la empresa</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Aparece en la esquina superior izquierda del PDF (RIDE) de facturas y notas de crédito. Formatos
          admitidos: PNG o JPG, máximo 2MB.
        </p>

        <div className="flex items-center gap-4 mb-4">
          <div className="w-28 h-20 border border-dashed border-stone-300 dark:border-gray-600 rounded-md flex items-center justify-center bg-stone-50 dark:bg-gray-900/40 shrink-0">
            {isLoading ? (
              <span className="text-xs text-gray-400 dark:text-gray-500">Cargando...</span>
            ) : data?.logoUrl ? (
              <img src={`${URL_BASE_API}${data.logoUrl}`} alt="Logo de la empresa" className="max-w-full max-h-full object-contain" />
            ) : (
              <span className="text-xs text-gray-400 dark:text-gray-500 text-center px-2">Sin logo configurado</span>
            )}
          </div>

          {data?.logoUrl && (
            <button
              onClick={confirmarQuitar}
              disabled={quitarLogo.isPending}
              className="text-red-600 dark:text-red-400 hover:underline text-xs font-medium disabled:opacity-50"
            >
              {quitarLogo.isPending ? "Quitando..." : "Quitar logo"}
            </button>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (archivo) subirLogo.mutate();
          }}
          className="flex items-center gap-3"
        >
          <input
            type="file"
            accept="image/png,image/jpeg"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            className="text-sm text-gray-700 dark:text-gray-300"
          />
          <button
            type="submit"
            disabled={!archivo || subirLogo.isPending}
            className="bg-brand-700 text-white px-4 py-1.5 rounded-sm text-sm font-semibold hover:bg-brand-800 disabled:opacity-50"
          >
            {subirLogo.isPending ? "Subiendo..." : "Subir logo"}
          </button>
        </form>
      </div>

      <div className="p-5 border-t border-stone-300 dark:border-gray-700 [&>*:not(h3)]:max-w-2xl">
        <h3 id="ajuste-respaldo-comprobantes" className="scroll-mt-44 -mx-5 -mt-5 mb-3 px-5 py-2.5 bg-stone-50 dark:bg-gray-900/40 border-b border-stone-200 dark:border-gray-700 font-mono text-[11px] uppercase tracking-[0.15em] text-gray-700 dark:text-gray-200">Respaldo de comprobantes autorizados</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          El SRI exige conservar los XML autorizados varios años. Configura <code>BACKUP_COMPROBANTES_PATH</code> en
          el <code>.env</code> del backend (otro disco, una unidad de red, una carpeta sincronizada a la nube) para
          que cada comprobante nuevo se guarde también ahí, además de la carpeta principal.
        </p>

        {cargandoBackup ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>
        ) : !backup?.configurado ? (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            No hay una ruta de respaldo configurada todavía.
          </p>
        ) : (
          <div className="text-sm space-y-1 mb-4">
            <p className="text-gray-500 dark:text-gray-400">
              Ruta: <span className="font-mono text-xs text-gray-700 dark:text-gray-300">{backup.carpetaBackup}</span>
            </p>
            <p className="text-gray-700 dark:text-gray-300">
              Principal: <span className="font-semibold">{backup.totalPrincipal}</span> archivo(s) · Respaldo:{" "}
              <span className={`font-semibold ${backup.totalBackup < backup.totalPrincipal ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                {backup.totalBackup}
              </span>{" "}
              archivo(s)
            </p>
          </div>
        )}

        {backup?.configurado && (
          <button
            onClick={() => ejecutarBackup.mutate()}
            disabled={ejecutarBackup.isPending}
            className="bg-brand-700 dark:bg-brand-700 text-white px-4 py-1.5 rounded-sm text-sm font-semibold hover:bg-brand-800 dark:hover:bg-brand-800 disabled:opacity-50"
          >
            {ejecutarBackup.isPending ? "Respaldando..." : "Ejecutar respaldo ahora"}
          </button>
        )}
      </div>

      <div className="p-5 border-t border-stone-300 dark:border-gray-700 [&>*:not(h3)]:max-w-2xl">
        <h3 id="ajuste-respaldo-db" className="scroll-mt-44 -mx-5 -mt-5 mb-3 px-5 py-2.5 bg-stone-50 dark:bg-gray-900/40 border-b border-stone-200 dark:border-gray-700 font-mono text-[11px] uppercase tracking-[0.15em] text-gray-700 dark:text-gray-200">Respaldo de base de datos</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          El propio sistema hace un respaldo (dump) diario de la base de datos. Configura{" "}
          <code>BACKUP_DB_PATH</code> en el <code>.env</code> del backend (otro disco, una unidad de red, una
          carpeta sincronizada a la nube) para activarlo.
        </p>

        {cargandoBackupDb ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>
        ) : !backupDb?.configurado ? (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            No hay una ruta de respaldo configurada todavía.
          </p>
        ) : (
          <div className="text-sm space-y-1 mb-4">
            <p className={backupDb.atrasado ? "text-red-600 dark:text-red-400 font-semibold" : "text-emerald-600 dark:text-emerald-400 font-semibold"}>
              {backupDb.atrasado ? "ATRASADO" : "Al día"}
            </p>
            <p className="text-gray-500 dark:text-gray-400">
              Último exitoso:{" "}
              {backupDb.ultimoExitoso ? new Date(backupDb.ultimoExitoso).toLocaleString("es-EC") : "nunca"}
            </p>
            {backupDb.ultimoError && (
              <p className="text-gray-500 dark:text-gray-400">
                Último error: <span className="text-red-600 dark:text-red-400">{backupDb.ultimoError}</span>
              </p>
            )}
          </div>
        )}

        {backupDb?.configurado && (
          <button
            onClick={() => ejecutarBackupDb.mutate()}
            disabled={ejecutarBackupDb.isPending}
            className="bg-brand-700 dark:bg-brand-700 text-white px-4 py-1.5 rounded-sm text-sm font-semibold hover:bg-brand-800 dark:hover:bg-brand-800 disabled:opacity-50"
          >
            {ejecutarBackupDb.isPending ? "Respaldando..." : "Ejecutar respaldo ahora"}
          </button>
        )}
      </div>

      <div className="p-5 border-t border-stone-300 dark:border-gray-700 [&>*:not(h3)]:max-w-2xl">
        <h3 id="ajuste-geocercas" className="scroll-mt-44 -mx-5 -mt-5 mb-3 px-5 py-2.5 bg-stone-50 dark:bg-gray-900/40 border-b border-stone-200 dark:border-gray-700 font-mono text-[11px] uppercase tracking-[0.15em] text-gray-700 dark:text-gray-200">Geocercas de sucursales</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Ubicación y radio permitido para las marcaciones de entrada/salida de cada sucursal (ver la pestaña
          "Marcaciones" en Nómina). Una marcación fuera de este radio igual se registra, solo queda marcada
          para que la revises. Deja los tres campos vacíos para quitar la geocerca de una sucursal.
        </p>

        {cargandoSucursales ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>
        ) : (
          <div className="space-y-4">
            {sucursales?.map((s) => {
              const form = geocercaForms[s.id];
              if (!form) return null;
              return (
                <div key={s.id} className="border border-stone-300 dark:border-gray-700 rounded-md p-3">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">{s.nombre}</p>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-2">
                    Haz clic en el mapa (o arrastra el marcador) para ubicar el punto central de la geocerca.
                  </p>
                  <MapaGeocerca
                    latitud={form.latitud}
                    longitud={form.longitud}
                    radioMetros={form.radioGeocercaMetros}
                    onCambiarUbicacion={(lat, lng) =>
                      setGeocercaForms({ ...geocercaForms, [s.id]: { ...form, latitud: lat, longitud: lng } })
                    }
                  />
                  <div className="grid grid-cols-3 gap-2 mt-2 mb-2 items-end">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Lat: <span className="font-mono">{form.latitud || "—"}</span>
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Lng: <span className="font-mono">{form.longitud || "—"}</span>
                    </p>
                    <div>
                      <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Radio (metros)</label>
                      <input
                        type="number"
                        min="1"
                        value={form.radioGeocercaMetros}
                        onChange={(e) => setGeocercaForms({ ...geocercaForms, [s.id]: { ...form, radioGeocercaMetros: e.target.value } })}
                        className="border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1.5 text-sm w-full"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => usarUbicacionActual(s.id)}
                      className="text-xs font-medium text-brand-700 dark:text-brand-300 hover:underline"
                    >
                      Usar mi ubicación actual
                    </button>
                    <button
                      onClick={() => guardarGeocerca.mutate(s.id)}
                      disabled={guardarGeocerca.isPending}
                      className="ml-auto bg-brand-700 text-white px-3 py-1 rounded-md text-xs font-semibold hover:bg-brand-800 disabled:opacity-50"
                    >
                      {guardarGeocerca.isPending ? "Guardando..." : "Guardar"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="p-5 border-t border-stone-300 dark:border-gray-700 [&>*:not(h3)]:max-w-2xl">
        <h3 id="ajuste-numeracion" className="scroll-mt-44 -mx-5 -mt-5 mb-3 px-5 py-2.5 bg-stone-50 dark:bg-gray-900/40 border-b border-stone-200 dark:border-gray-700 font-mono text-[11px] uppercase tracking-[0.15em] text-gray-700 dark:text-gray-200">Numeración inicial</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Si el negocio ya emitía comprobantes (numeración verificada por el SRI) antes de usar este sistema,
          ingresa acá el último número usado de cada tipo para que el primero que generes acá continúe esa
          numeración, en vez de arrancar desde 1. Solo editable mientras no exista ningún comprobante de ese
          tipo creado en este sistema.
        </p>

        {cargandoSecuenciales || !secuenciales ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>
        ) : (
          <div className="space-y-3">
            {secuenciales.map((s) => (
              <div key={s.tipoComprobante} className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">{s.etiqueta}</label>
                  {s.editable ? (
                    <input
                      type="number"
                      min={0}
                      value={formSecuenciales[s.tipoComprobante] ?? ""}
                      onChange={(e) => setFormSecuenciales({ ...formSecuenciales, [s.tipoComprobante]: e.target.value })}
                      className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-3 py-1.5 text-sm"
                    />
                  ) : (
                    <p className="text-sm text-gray-700 dark:text-gray-300 px-3 py-1.5">
                      {s.ultimoNumero} usado —{" "}
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {s.totalDocumentos} comprobante(s) ya emitido(s) acá, ya no editable
                      </span>
                    </p>
                  )}
                </div>
                {s.editable && (
                  <button
                    type="button"
                    onClick={() => confirmarGuardarSecuencial(s.tipoComprobante, s.etiqueta)}
                    disabled={guardarSecuencial.isPending}
                    className="bg-brand-700 text-white px-3 py-1.5 rounded-md text-sm font-semibold hover:bg-brand-800 disabled:opacity-50"
                  >
                    Guardar
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-5 border-t border-stone-300 dark:border-gray-700 [&>*:not(h3)]:max-w-2xl">
        <h3 id="ajuste-codigos-sri" className="scroll-mt-44 -mx-5 -mt-5 mb-3 px-5 py-2.5 bg-stone-50 dark:bg-gray-900/40 border-b border-stone-200 dark:border-gray-700 font-mono text-[11px] uppercase tracking-[0.15em] text-gray-700 dark:text-gray-200">Códigos SRI</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Códigos de las tablas oficiales del SRI que se usan al armar el XML de facturas, notas de crédito, guías de
          remisión y retenciones. El SRI las actualiza de tanto en tanto — si eso pasa, actualízalos acá (no hace
          falta tocar código ni volver a desplegar).
        </p>

        {formTipoIdentificacion && formFormaPago ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              guardarCodigosSri.mutate();
            }}
            className="space-y-4"
          >
            <div>
              <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">Tipo de identificación</p>
              <div className="grid grid-cols-2 gap-2">
                {Object.keys(formTipoIdentificacion).map((clave) => (
                  <div key={clave}>
                    <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">
                      {ETIQUETAS_TIPO_IDENTIFICACION[clave] ?? clave}
                    </label>
                    <input
                      type="text"
                      required
                      value={formTipoIdentificacion[clave]}
                      onChange={(e) => setFormTipoIdentificacion({ ...formTipoIdentificacion, [clave]: e.target.value })}
                      className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1 text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">Forma de pago</p>
              <div className="grid grid-cols-3 gap-2">
                {Object.keys(formFormaPago).map((clave) => (
                  <div key={clave}>
                    <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">{ETIQUETAS_FORMA_PAGO[clave] ?? clave}</label>
                    <input
                      type="text"
                      required
                      value={formFormaPago[clave]}
                      onChange={(e) => setFormFormaPago({ ...formFormaPago, [clave]: e.target.value })}
                      className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1 text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-600 dark:text-gray-300">Porcentaje de IVA</p>
                <button
                  type="button"
                  onClick={() => setFilasIva([...filasIva, { porcentaje: "", codigo: "" }])}
                  className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline"
                >
                  + Agregar porcentaje
                </button>
              </div>
              <div className="space-y-2">
                {filasIva.map((fila, indice) => (
                  <div key={indice} className="flex items-center gap-2">
                    <div className="flex-1">
                      <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">% IVA</label>
                      <input
                        type="text"
                        required
                        placeholder="Ej: 15"
                        value={fila.porcentaje}
                        onChange={(e) =>
                          setFilasIva(filasIva.map((f, i) => (i === indice ? { ...f, porcentaje: e.target.value } : f)))
                        }
                        className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1 text-sm"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Código SRI</label>
                      <input
                        type="text"
                        required
                        placeholder="Ej: 4"
                        value={fila.codigo}
                        onChange={(e) =>
                          setFilasIva(filasIva.map((f, i) => (i === indice ? { ...f, codigo: e.target.value } : f)))
                        }
                        className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-2 py-1 text-sm"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setFilasIva(filasIva.filter((_, i) => i !== indice))}
                      className="text-red-600 dark:text-red-400 hover:underline text-xs font-medium mt-4"
                    >
                      Quitar
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={guardarCodigosSri.isPending}
              className="bg-brand-700 text-white px-4 py-2 rounded-sm text-sm font-semibold hover:bg-brand-800 disabled:opacity-50"
            >
              {guardarCodigosSri.isPending ? "Guardando..." : "Guardar códigos SRI"}
            </button>
          </form>
        ) : (
          <p className="text-sm text-gray-400 dark:text-gray-500">Cargando...</p>
        )}
      </div>

      <div className="p-5 border-t border-stone-300 dark:border-gray-700 [&>*:not(h3)]:max-w-2xl">
        <h3 id="ajuste-whatsapp" className="scroll-mt-44 -mx-5 -mt-5 mb-3 px-5 py-2.5 bg-stone-50 dark:bg-gray-900/40 border-b border-stone-200 dark:border-gray-700 font-mono text-[11px] uppercase tracking-[0.15em] text-gray-700 dark:text-gray-200">Recordatorio de vencimiento por WhatsApp</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Avisa a un cliente de internet antes de que llegue a su fecha de corte por falta de pago. Requiere tu
          propia cuenta de WhatsApp Business API (Meta Cloud API) — nunca se comparte con otras empresas del
          sistema.
        </p>

        <p className="text-sm mb-4">
          Estado actual:{" "}
          {cargandoWhatsapp ? (
            <span className="text-gray-400 dark:text-gray-500">Cargando...</span>
          ) : whatsapp?.configurado ? (
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">Activo</span>
          ) : (
            <span className="text-amber-600 dark:text-amber-400 font-medium">Sin configurar — no se manda ningún recordatorio</span>
          )}
        </p>

        {formWhatsapp && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              guardarWhatsapp.mutate();
            }}
            className="space-y-3"
          >
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">
                Access Token{" "}
                {whatsapp?.tieneAccessToken && (
                  <span className="text-gray-400 dark:text-gray-500 font-normal">(dejar vacío para no cambiarlo)</span>
                )}
              </label>
              <input
                type="password"
                value={formWhatsapp.accessToken}
                onChange={(e) => setFormWhatsapp({ ...formWhatsapp, accessToken: e.target.value })}
                placeholder={whatsapp?.tieneAccessToken ? "••••••••••••••••" : "Token permanente del System User"}
                className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-3 py-1.5 text-sm"
              />
            </div>

            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Phone Number ID</label>
              <input
                type="text"
                value={formWhatsapp.phoneNumberId}
                onChange={(e) => setFormWhatsapp({ ...formWhatsapp, phoneNumberId: e.target.value })}
                placeholder="Ej: 1383168738203522"
                className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-3 py-1.5 text-sm"
              />
            </div>

            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Nombre de la plantilla</label>
              <input
                type="text"
                value={formWhatsapp.plantilla}
                onChange={(e) => setFormWhatsapp({ ...formWhatsapp, plantilla: e.target.value })}
                placeholder="Ej: recordatorio_vencimiento_de_pago"
                className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-3 py-1.5 text-sm"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Nombre exacto aprobado en Meta Business Manager → WhatsApp Manager → Plantillas de mensajes. Debe
                tener 5 variables, en este orden: nombre del cliente, plan, precio, días restantes, fecha límite.
              </p>
            </div>

            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Plantilla de encuesta (opcional)</label>
              <input
                type="text"
                value={formWhatsapp.plantillaEncuesta}
                onChange={(e) => setFormWhatsapp({ ...formWhatsapp, plantillaEncuesta: e.target.value })}
                placeholder="Ej: encuesta_visita_tecnica"
                className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-3 py-1.5 text-sm"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Encuesta de satisfacción que se manda sola 1 hora después de cada visita técnica (ver Centro de Control →
                Encuestas). Debe tener 2 variables: nombre del cliente y nombre del técnico, y pedir responder con un
                número del 1 al 5. Mismo idioma que la plantilla de arriba. Vacío = no se mandan encuestas.
              </p>
            </div>

            <div>
              <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Idioma de la plantilla</label>
              <input
                type="text"
                value={formWhatsapp.idioma}
                onChange={(e) => setFormWhatsapp({ ...formWhatsapp, idioma: e.target.value })}
                placeholder="Ej: es_EC"
                className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-3 py-1.5 text-sm"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                El código exacto de la columna "Idioma" de esa plantilla en Meta — si no coincide, Meta rechaza el envío.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Días de anticipación</label>
                <input
                  type="number"
                  min={1}
                  value={formWhatsapp.diasAntes}
                  onChange={(e) => setFormWhatsapp({ ...formWhatsapp, diasAntes: e.target.value })}
                  className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block font-mono text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Hora del día (0-23)</label>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={formWhatsapp.hora}
                  onChange={(e) => setFormWhatsapp({ ...formWhatsapp, hora: e.target.value })}
                  placeholder="Usa el default del sistema"
                  className="w-full border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 px-3 py-1.5 text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={guardarWhatsapp.isPending}
              className="bg-brand-700 text-white px-4 py-1.5 rounded-sm text-sm font-semibold hover:bg-brand-800 disabled:opacity-50"
            >
              {guardarWhatsapp.isPending ? "Guardando..." : "Guardar configuración de WhatsApp"}
            </button>
          </form>
        )}
      </div>
      </div>

      <DiccionarioBuscador />
    </div>
  );
}
