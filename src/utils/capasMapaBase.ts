import L from "leaflet";

// Agrega las dos capas base (Calles/Satélite) con su selector a un mapa
// Leaflet recién creado — compartido por todos los mapas del sistema para no
// repetir la misma configuración en cada componente. Satelital vía Esri
// World Imagery: gratis, sin API key, buena cobertura global.
export function agregarCapasBase(mapa: L.Map): void {
  const capaCalles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(mapa);

  const capaSatelital = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    { attribution: "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics", maxZoom: 19 }
  );

  L.control.layers({ Calles: capaCalles, Satélite: capaSatelital }).addTo(mapa);
}
