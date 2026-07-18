# Imagen de la prueba local en Docker — ver docker-compose.yml en la raíz
# del repo. Build multi-stage: compila la SPA y la sirve con nginx (archivos
# estáticos, no necesita Node corriendo en producción).
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite incrusta esta variable en el bundle EN TIEMPO DE COMPILACIÓN (no se
# puede cambiar después sin reconstruir la imagen) — frontend/src/api/client.ts
# ya la lee vía import.meta.env.VITE_API_URL, sin necesidad de tocar código.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
