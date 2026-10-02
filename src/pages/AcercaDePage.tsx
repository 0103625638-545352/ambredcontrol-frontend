import { useRef } from "react";
import { ChevronRight } from "lucide-react";

// Manual de usuario embebido en la aplicación — pensado para cualquier
// persona que use el sistema día a día (no solo para quien lo programó).
// Contenido en español simple, sin jerga técnica, organizado por área de
// trabajo (mismo agrupamiento que el menú lateral) más una sección de
// preguntas frecuentes al final.

interface Seccion {
  id: string;
  titulo: string;
  temas: { pregunta: string; respuesta: React.ReactNode }[];
}

const SECCIONES: Seccion[] = [
  {
    id: "primeros-pasos",
    titulo: "Primeros pasos",
    temas: [
      {
        pregunta: "¿Cómo inicio sesión?",
        respuesta: (
          <>
            <p>En la pantalla de inicio elige tu empresa del listado, luego escribe tu usuario y contraseña.</p>
            <p>
              Si tu empresa tiene más de un negocio registrado en el sistema (varias empresas independientes), asegúrate
              de elegir la correcta — cada una tiene su propia información y nunca se mezclan entre sí.
            </p>
          </>
        ),
      },
      {
        pregunta: "Olvidé mi contraseña, ¿qué hago?",
        respuesta: (
          <p>
            En la pantalla de inicio de sesión hay una opción para recuperarla por correo: se envía un código temporal
            al correo registrado en tu usuario. Si tu usuario no tiene un correo registrado, pide a un administrador
            que te la restablezca desde "Usuarios".
          </p>
        ),
      },
      {
        pregunta: "Un administrador me reseteó la contraseña, ¿y ahora?",
        respuesta: (
          <p>
            La próxima vez que inicies sesión, el sistema te va a pedir que elijas una contraseña nueva antes de dejarte
            usar cualquier otra pantalla — es obligatorio, no se puede omitir.
          </p>
        ),
      },
      {
        pregunta: "¿Cómo cambio entre modo claro y modo oscuro?",
        respuesta: <p>Con el ícono de sol/luna en la esquina superior derecha del encabezado, junto a tu nombre.</p>,
      },
      {
        pregunta: "¿Qué significa el badge de estado que aparece en muchas pantallas?",
        respuesta: (
          <p>
            Indica en qué etapa está un comprobante: <strong>CREADA</strong> (recién generada, todavía no se envió al
            SRI), <strong>ENVIADA</strong> (ya se mandó y se está esperando respuesta), <strong>AUTORIZADA</strong>{" "}
            (el SRI la aceptó, es válida legalmente), <strong>RECHAZADA</strong> (el SRI encontró un error) o{" "}
            <strong>ANULADA</strong> (se canceló antes de enviarla).
          </p>
        ),
      },
    ],
  },
  {
    id: "punto-de-venta",
    titulo: "Punto de Venta y Caja",
    temas: [
      {
        pregunta: "¿Cómo hago una venta?",
        respuesta: (
          <>
            <p>Ve a "Punto de Venta", busca los productos (por nombre o código), agrégalos al carrito y elige el cliente.</p>
            <p>
              Al confirmar, el sistema te deja elegir si el comprobante es una <strong>Factura</strong> (documento
              electrónico oficial del SRI, para clientes que necesitan crédito tributario) o una{" "}
              <strong>Nota de Venta</strong> (recibo interno, más simple, no se envía al SRI).
            </p>
            <p>El stock del producto se descuenta automáticamente al confirmar la venta.</p>
          </>
        ),
      },
      {
        pregunta: "¿Qué es la Caja y para qué sirve abrirla?",
        respuesta: (
          <>
            <p>
              Es el control de efectivo de un turno de trabajo. Al empezar el día, "Abrir caja" declarando cuánto
              efectivo hay al inicio. Todas las ventas en efectivo de ese turno se suman automáticamente.
            </p>
            <p>
              Al terminar, "Cerrar caja" contando el efectivo físico real — el sistema compara ese conteo contra lo
              que debería haber (el "efectivo esperado") y muestra si sobra o falta dinero (la "diferencia").
            </p>
            <p>También puedes registrar ingresos/egresos manuales de efectivo dentro de un turno abierto (ej. un retiro para un gasto menor).</p>
          </>
        ),
      },
      {
        pregunta: "Cobré una venta a crédito, ¿cómo registro el pago después?",
        respuesta: (
          <p>
            Desde Facturas o Notas de Venta, busca el comprobante y usa "Registrar pago" — puedes hacerlo en varios
            abonos parciales hasta completar el total. El estado de pago (Pendiente/Parcial/Pagada) se actualiza solo.
          </p>
        ),
      },
    ],
  },
  {
    id: "comprobantes",
    titulo: "Comprobantes de venta (Facturas, Notas de Crédito, Guías de Remisión)",
    temas: [
      {
        pregunta: "Me equivoqué en una factura, ¿cómo la corrijo?",
        respuesta: (
          <>
            <p>
              Depende de si ya se envió al SRI. Si sigue en estado <strong>CREADA</strong> (no enviada todavía), puedes
              anularla directamente desde Facturas — el stock se devuelve automáticamente.
            </p>
            <p>
              Si ya está <strong>AUTORIZADA</strong> por el SRI, ya NO se puede anular ni editar: hay que generar una{" "}
              <strong>Nota de Crédito</strong> contra esa factura, que es el documento legal correcto para corregir o
              anular una venta ya autorizada.
            </p>
          </>
        ),
      },
      {
        pregunta: "¿El sistema envía las facturas al SRI automáticamente?",
        respuesta: (
          <p>
            Sí — al crear una factura (o nota de crédito, retención, guía de remisión), el sistema intenta enviarla al
            SRI en segundo plano de inmediato, sin que tengas que hacer nada más. Si por algún motivo no se pudo enviar
            (ej. el SRI estaba caído), un proceso automático reintenta periódicamente. También puedes forzar el envío o
            consultar el estado manualmente desde el botón correspondiente en cada comprobante.
          </p>
        ),
      },
      {
        pregunta: "Una factura quedó RECHAZADA, ¿qué hago?",
        respuesta: (
          <p>
            El SRI siempre explica el motivo del rechazo (ej. un dato del cliente incorrecto). Corrige el dato y vuelve
            a intentar el envío. Si el error persiste y no lo entiendes, contacta a soporte o revisa la información del
            cliente/producto involucrado.
          </p>
        ),
      },
      {
        pregunta: "¿Qué es una Proforma?",
        respuesta: (
          <p>
            Es una cotización preliminar — tiene el mismo aspecto que una factura pero NO es un documento oficial del
            SRI y NO descuenta stock. Cuando el cliente la acepta, se "convierte" en una Factura o Nota de Venta real
            desde la misma pantalla de Proformas, sin tener que volver a digitar los productos.
          </p>
        ),
      },
      {
        pregunta: "¿Cuándo necesito una Guía de Remisión?",
        respuesta: (
          <p>
            Cuando la mercadería de una factura ya autorizada se transporta físicamente (ej. entrega a domicilio, envío
            entre ciudades) — es el documento que exige el SRI para justificar ese transporte ante un control en
            carretera. Se genera desde la factura ya autorizada, indicando transportista, placa y fechas del viaje.
          </p>
        ),
      },
    ],
  },
  {
    id: "compras",
    titulo: "Compras y Proveedores",
    temas: [
      {
        pregunta: "¿Cómo registro una compra a un proveedor?",
        respuesta: (
          <p>
            En "Compras", elige el proveedor, agrega los productos comprados con su costo y cantidad, y guarda. El
            número de factura que ingreses es el que el proveedor ya te entregó en papel o PDF — el sistema no genera
            uno propio, solo lo archiva. El stock de los productos aumenta automáticamente.
          </p>
        ),
      },
      {
        pregunta: "El proveedor me devolvió menos mercadería de la que pedí, o llegó dañada, ¿cómo lo registro?",
        respuesta: (
          <p>
            Con "Devoluciones a Proveedor", eligiendo la compra original y las líneas/cantidades que se devuelven. Se
            puede devolver una compra en varias partes a lo largo del tiempo, no todo de una vez.
          </p>
        ),
      },
      {
        pregunta: "¿Qué es una Retención y cuándo la genero?",
        respuesta: (
          <p>
            Si tu empresa es "agente de retención" autorizado por el SRI (se configura en Ajustes), al registrar una
            compra aparece el botón "Generar retención" para emitir el comprobante de retención de IVA/Renta que le
            corresponde retener a ese proveedor. Se envía al SRI igual que una factura.
          </p>
        ),
      },
    ],
  },
  {
    id: "catalogo",
    titulo: "Catálogo: Productos, Clientes, Categorías y Traslados",
    temas: [
      {
        pregunta: "¿Cómo creo un producto nuevo?",
        respuesta: (
          <p>
            En "Productos", con el botón de crear — código, nombre, categoría, IVA aplicable y stock mínimo (para que
            el sistema avise cuando se está agotando). El precio de venta NO se fija a mano por producto: se calcula
            automáticamente según el costo del producto y la categoría de precio del cliente (ver siguiente pregunta).
          </p>
        ),
      },
      {
        pregunta: "¿Cómo funcionan los precios de venta?",
        respuesta: (
          <p>
            Cada cliente pertenece a una "categoría de precio" (ej. Mayorista, Minorista) configurada en "Precios de
            Venta" con un porcentaje de ganancia. El precio que se le cobra a un cliente por cualquier producto sale de
            multiplicar el costo actual del producto por ese porcentaje — así, si el costo de compra cambia, el precio
            de venta se ajusta solo, sin tener que editar producto por producto.
          </p>
        ),
      },
      {
        pregunta: "Tengo productos que caducan (perecibles), ¿cómo los manejo?",
        respuesta: (
          <p>
            Al crear el producto, activa "maneja lotes". Cada vez que compras ese producto, ingresa la cantidad como un
            lote nuevo con su propia fecha de caducidad. Al vender, el sistema descuenta primero del lote que caduca
            más pronto, automáticamente.
          </p>
        ),
      },
      {
        pregunta: "Tengo varias sucursales o bodegas, ¿cómo muevo mercadería entre ellas?",
        respuesta: (
          <p>
            Con "Traslados" — eliges bodega de origen y destino (pueden ser de sucursales distintas) y los productos a
            mover. No existe "anular traslado": si te equivocaste, se corrige con un traslado igual pero en sentido
            contrario.
          </p>
        ),
      },
    ],
  },
  {
    id: "contabilidad",
    titulo: "Contabilidad",
    temas: [
      {
        pregunta: "¿Tengo que registrar manualmente cada venta o compra en Contabilidad?",
        respuesta: (
          <p>
            No. Cada venta, compra, devolución, pago y movimiento de caja genera su asiento contable automáticamente,
            con las cuentas correctas ya cuadradas (débito = crédito). Solo necesitas crear un asiento manual para
            cosas que el sistema no ve por sí solo (arriendo, servicios básicos, sueldos si no usas el módulo de
            Nómina, ajustes de fin de mes).
          </p>
        ),
      },
      {
        pregunta: "¿Qué es el Plan de Cuentas y cuándo tengo que tocarlo?",
        respuesta: (
          <p>
            Es el catálogo de cuentas contables de tu empresa (Caja, Bancos, Ventas, Gastos, etc.). Ya viene con las
            cuentas básicas creadas. Solo necesitas agregar una cuenta nueva ahí si vas a registrar un asiento manual
            que necesita una cuenta que todavía no existe (el sistema te avisa exactamente cuál falta si intentas usar
            una que no está creada).
          </p>
        ),
      },
      {
        pregunta: "¿Qué reportes contables puedo ver?",
        respuesta: (
          <p>
            Libro Diario (todos los asientos en orden), Libro Mayor (movimientos por cuenta), Balance de Comprobación,
            Balance General y Estado de Resultados (para saber si la empresa tuvo utilidad o pérdida en un período).
          </p>
        ),
      },
      {
        pregunta: "¿Qué es el 'cierre contable'?",
        respuesta: (
          <p>
            Una fecha límite que un administrador puede fijar para bloquear la creación de asientos con fecha anterior
            a esa — evita que se altere sin querer un período que ya se declaró o cerró oficialmente.
          </p>
        ),
      },
    ],
  },
  {
    id: "nomina",
    titulo: "Empleados y Nómina",
    temas: [
      {
        pregunta: "¿Cómo registro un empleado nuevo?",
        respuesta: (
          <p>
            En "Empleados": cédula, nombres, cargo, sueldo mensual y fecha de ingreso. Si el empleado tiene cargas
            familiares, regístralas — afectan el reparto de utilidades a fin de año.
          </p>
        ),
      },
      {
        pregunta: "¿Cómo genero el rol de pagos mensual?",
        respuesta: (
          <p>
            En "Nómina" → "Rol de Pagos", elige el empleado, mes y año. Si trabajó horas suplementarias o
            extraordinarias, o hay un bono/descuento puntual, agrégalo ahí — el sistema calcula automáticamente el
            aporte al IESS, el fondo de reserva (si aplica) y el neto a pagar. Al presionar "Pagar", se genera también
            el asiento contable correspondiente.
          </p>
        ),
      },
      {
        pregunta: "¿Cómo calculo décimo tercero, décimo cuarto, vacaciones y utilidades?",
        respuesta: (
          <p>
            Cada uno tiene su propia pestaña dentro de "Nómina", con un botón "Calcular" por empleado (o para todos a
            la vez en el caso de Utilidades). El sistema trae los datos que ya tiene registrados (sueldos, roles de
            pago pagados, antigüedad) para hacer el cálculo — solo necesitas confirmar el año o período.
          </p>
        ),
      },
      {
        pregunta: '¿Qué es una "Liquidación" y por qué tiene una advertencia en rojo?',
        respuesta: (
          <p>
            Es el finiquito que se calcula cuando un empleado deja de trabajar en la empresa. El sistema da un valor de{" "}
            <strong>referencia</strong>, pero las fórmulas legales de indemnización han cambiado varias veces con
            reformas laborales en Ecuador — por eso, antes de pagar una liquidación real, siempre hay que confirmar el
            monto con un contador o abogado laboral. Este valor calculado NUNCA debe pagarse a ciegas.
          </p>
        ),
      },
    ],
  },
  {
    id: "reportes",
    titulo: "Reportes",
    temas: [
      {
        pregunta: "¿Dónde veo cuánto se vendió en un período, o qué productos se agotan?",
        respuesta: (
          <p>
            En "Reportes" hay reportes ya armados (ventas por período, productos más vendidos, cuentas por cobrar/por
            pagar vencidas, stock bajo, etc.). En "Reporteador Principal" puedes armar consultas más flexibles
            combinando filtros propios.
          </p>
        ),
      },
    ],
  },
  {
    id: "administracion",
    titulo: "Administración del sistema",
    temas: [
      {
        pregunta: "¿Cómo creo un usuario nuevo y qué puede ver?",
        respuesta: (
          <p>
            Solo un Administrador puede hacerlo, desde "Usuarios". Cada usuario nuevo (que no sea Administrador) recibe
            permisos individuales marcados a mano — sin un permiso marcado, esa persona no ve esa pantalla ni puede
            hacer esa acción. Un Administrador siempre tiene acceso a todo, sin excepción.
          </p>
        ),
      },
      {
        pregunta: "¿Qué es la Auditoría?",
        respuesta: (
          <p>
            Un registro de quién hizo qué y cuándo, para acciones sensibles (anular, eliminar, desactivar). Sirve para
            reconstruir qué pasó si algo no cuadra.
          </p>
        ),
      },
      {
        pregunta: "¿Qué configuro en Ajustes?",
        respuesta: (
          <p>
            Los datos fiscales de la empresa (RUC, razón social, ambiente del SRI), el logo que sale en los documentos,
            el certificado digital (.p12) para firmar comprobantes electrónicos, si la empresa es agente de retención,
            y el respaldo automático de los comprobantes ya autorizados por el SRI.
          </p>
        ),
      },
      {
        pregunta: "Manejamos más de un negocio (empresas distintas), ¿cómo funciona eso acá?",
        respuesta: (
          <p>
            Este sistema soporta varias empresas independientes a la vez, cada una con su propia base de datos —
            nunca comparten productos, clientes ni comprobantes entre sí. Se elige la empresa al iniciar sesión. Un
            Administrador puede crear una empresa nueva o eliminar una existente desde la pantalla de inicio de
            sesión, con la clave maestra del sistema.
          </p>
        ),
      },
    ],
  },
  {
    id: "preguntas-frecuentes",
    titulo: "Preguntas frecuentes",
    temas: [
      {
        pregunta: "¿Por qué no puedo anular una factura?",
        respuesta: (
          <p>
            Porque ya fue autorizada por el SRI — legalmente ya no se puede deshacer. La corrección correcta es una
            Nota de Crédito contra esa factura, no una anulación.
          </p>
        ),
      },
      {
        pregunta: "¿Qué pasa si mi certificado digital (.p12) vence o se pierde?",
        respuesta: (
          <p>
            Sin un certificado válido, el sistema no puede firmar ni enviar ningún comprobante nuevo al SRI. El
            Dashboard muestra una alerta visible si detecta que el certificado no es válido — súbelo de nuevo desde
            Ajustes en cuanto la veas, para no acumular comprobantes sin enviar.
          </p>
        ),
      },
      {
        pregunta: "No veo una pestaña que sé que existe en el sistema, ¿por qué?",
        respuesta: (
          <p>
            Probablemente tu usuario no tiene el permiso correspondiente habilitado. Pide a un Administrador que
            revise tus permisos en "Usuarios".
          </p>
        ),
      },
      {
        pregunta: "¿Los montos en dólares llevan decimales exactos?",
        respuesta: (
          <p>
            Sí, todos los cálculos de dinero en este sistema usan precisión decimal exacta (nunca redondeo aproximado
            de calculadora), tal como lo exige el SRI para comprobantes electrónicos.
          </p>
        ),
      },
    ],
  },
];

export function AcercaDePage() {
  const refs = useRef<Record<string, HTMLDivElement | null>>({});

  function irASeccion(id: string) {
    refs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-50 mb-1">Acerca de / Manual de Usuario</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          AmbrossISP PYMES es un sistema de facturación e inventario para negocios ecuatorianos, que cumple con los
          requisitos de facturación electrónica del SRI (Servicio de Rentas Internas). Esta guía explica, en lenguaje
          simple, cómo usar cada parte del sistema.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-5">
        {SECCIONES.map((s) => (
          <button
            key={s.id}
            onClick={() => irASeccion(s.id)}
            className="px-3 py-1.5 rounded-md text-xs font-medium border border-stone-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500"
          >
            {s.titulo}
          </button>
        ))}
      </div>

      <div className="space-y-6">
        {SECCIONES.map((seccion) => (
          <div
            key={seccion.id}
            ref={(el) => {
              refs.current[seccion.id] = el;
            }}
            className="bg-white dark:bg-gray-800 rounded-sm border border-stone-300 dark:border-gray-700 p-4 scroll-mt-4"
          >
            <h3 className="font-mono text-[11px] uppercase tracking-[0.15em] text-gray-600 dark:text-gray-300 mb-3">{seccion.titulo}</h3>
            <div className="space-y-2">
              {seccion.temas.map((tema, i) => (
                <details key={i} className="group border border-stone-300 dark:border-gray-700 rounded-md">
                  <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 flex items-center justify-between hover:bg-stone-50 dark:hover:bg-gray-900/40 rounded-md">
                    {tema.pregunta}
                    <ChevronRight strokeWidth={2} className="w-3.5 h-3.5 shrink-0 text-gray-400 transition-transform group-open:rotate-90" />
                  </summary>
                  <div className="px-3 pb-3 pt-1 text-sm text-gray-600 dark:text-gray-300 space-y-2 border-t border-stone-100 dark:border-gray-700">
                    {tema.respuesta}
                  </div>
                </details>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500 mt-6 text-center">
        ¿No encuentras respuesta a tu duda acá? Consulta con un administrador del sistema.
      </p>
    </div>
  );
}
