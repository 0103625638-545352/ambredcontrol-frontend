import { Modal } from "./Modal";
import { FormularioMarcacion } from "./FormularioMarcacion";

interface Props {
  onCerrar: () => void;
  empresaId: string;
}

// Acceso a la marcación de entrada/salida desde DENTRO de la app ya
// logueada (botón en el encabezado, ver App.tsx) — para un mostrador o
// terminal compartido donde un cajero/admin le presta el dispositivo a un
// empleado para que marque, sin salir de la sesión ni depender de la URL
// pública /marcar (que sigue existiendo para el celular propio del
// empleado, ver pages/MarcacionPage.tsx — ambas reusan el mismo
// FormularioMarcacion).
export function ModalMarcacion({ onCerrar, empresaId }: Props) {
  return (
    <Modal titulo="Marcar asistencia" onCerrar={onCerrar}>
      <FormularioMarcacion empresaId={empresaId} />
    </Modal>
  );
}
