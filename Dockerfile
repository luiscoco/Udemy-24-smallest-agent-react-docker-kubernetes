FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./frontend/
COPY backend/package.json backend/package-lock.json ./backend/
RUN npm --prefix frontend ci && npm --prefix backend ci
COPY frontend ./frontend
COPY backend ./backend
COPY scripts/generate-lesson.mjs ./scripts/generate-lesson.mjs
COPY k8s ./k8s
RUN node scripts/generate-lesson.mjs && npm --prefix frontend run build && npm --prefix backend run build && npm --prefix backend prune --omit=dev
FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends bash git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/frontend/dist ./frontend/dist
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/node_modules ./backend/node_modules
COPY --from=build /app/backend/package.json ./backend/package.json
COPY --from=build /app/backend/public ./backend/public
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=9900
USER node
EXPOSE 9900
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:9900/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","backend/dist/server.js"]
