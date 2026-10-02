import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { MarcacionPage } from './pages/MarcacionPage.tsx'
import { manejarCambioMayusculas } from './utils/mayusculasAutomaticas'
import { registrarServiceWorker, guardarTokenParaServiceWorker } from './utils/serviceWorkerTecnico'

// Registra el Service Worker (ver public/sw.js) y le espeja el token de
// sesión que ya hubiera en localStorage en este instante (si la pestaña
// arranca con una sesión existente, ej. recarga de página) — ver el
// comentario grande de hooks/useUbicacionTecnico.ts sobre para qué sirve
// esto. Se hace acá, una sola vez al arrancar la app entera (no solo para
// técnicos): la instalación del Service Worker/PWA es igual de válida para
// cualquier usuario, y no tiene costo hacerlo siempre.
registrarServiceWorker()
guardarTokenParaServiceWorker(localStorage.getItem('token'))

// El QueryClient es el "cerebro" de React Query: guarda en caché las respuestas
// de la API, sabe cuándo volver a pedirlas, y evita pedir lo mismo dos veces.
const queryClient = new QueryClient()

// No hay router en este proyecto (ver App.tsx: las "pestañas" son estado en
// memoria, no rutas) — pero /marcar SÍ necesita ser una URL de verdad: un
// empleado la abre directo desde su celular (ej. un link fijo tipo QR
// pegado en la entrada del local), sin haber iniciado sesión nunca. Por eso
// esta es la ÚNICA revisión de "path" de toda la app, hecha acá, ANTES de
// montar <App/>, para que un empleado marcando entrada/salida nunca toque
// ninguno de los ~40 componentes de la app autenticada. Ambas ramas quedan
// dentro del mismo QueryClientProvider, así que MarcacionPage puede usar
// useQuery/useMutation con toda normalidad.
const partesRuta = window.location.pathname.split('/').filter(Boolean)
const esPantallaDeMarcacion = partesRuta[0] === 'marcar'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* onChangeCapture: ver el comentario en utils/mayusculasAutomaticas.ts
          sobre por qué esto vive acá (dentro del árbol de React) y no como
          un document.addEventListener aparte. "contents" saca este <div>
          del layout (no ocupa caja propia), es puramente un punto de
          enganche de eventos. */}
      <div onChangeCapture={manejarCambioMayusculas} className="contents">
        {esPantallaDeMarcacion ? <MarcacionPage empresaIdInicial={partesRuta[1] ?? null} /> : <App />}
      </div>
    </QueryClientProvider>
  </StrictMode>,
)
