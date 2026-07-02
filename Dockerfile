# syntax=docker/dockerfile:1
# Static production image: build the app with Vite, serve dist/ with nginx.
#
#   docker build -t sofa-so-good .
#   docker run --rm -p 8080:80 sofa-so-good      # → http://localhost:8080/
#
# The image serves the app at the root path (VITE_BASE=/), unlike the GitHub
# Pages deployment which lives under /sofa-so-good/. Override at build time to
# host under a sub-path: `docker build --build-arg VITE_BASE=/myapp/ .`
# (must end with `/`; nginx.conf assumes root — adjust it too for a sub-path).
#
# The nginx config also replicates the dev-only CC0 CORS proxies (/acg,
# /acg-cdn, /kenney), so the remote ambientCG/Kenney catalogs work from the
# container — the "production proxy" the vite.config.ts comment calls for.
#
# Note: the service worker (offline PWA) only activates on http://localhost or
# over HTTPS — put TLS in front for offline support on any other host.

FROM node:24.18.0-alpine AS build
WORKDIR /app

# Test-only browser downloads have no place in the image build.
ENV PUPPETEER_SKIP_DOWNLOAD=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_BASE=/
# Plain app build (no VitePress guide — see build:all for the full-offline
# bundle; the guide's base is hardcoded to the GitHub Pages sub-path).
RUN VITE_BASE=$VITE_BASE npm run build

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
