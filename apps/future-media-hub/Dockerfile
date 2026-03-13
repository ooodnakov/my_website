FROM node:20-bookworm-slim AS build

WORKDIR /workspace

COPY apps/future-media-hub/package.json apps/future-media-hub/package-lock.json ./apps/future-media-hub/
COPY apps/cv-site/package.json apps/cv-site/package-lock.json ./apps/cv-site/
COPY apps/legacy-links-site/package.json apps/legacy-links-site/package-lock.json ./apps/legacy-links-site/

WORKDIR /workspace/apps/future-media-hub
RUN npm ci

WORKDIR /workspace/apps/cv-site
RUN npm ci

WORKDIR /workspace/apps/legacy-links-site
RUN npm ci

WORKDIR /workspace
COPY . .

WORKDIR /workspace/apps/future-media-hub
RUN npm run build

FROM node:20-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

COPY --from=build /workspace/apps/future-media-hub/package.json /workspace/apps/future-media-hub/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /workspace/apps/future-media-hub/dist ./dist

EXPOSE 5000

CMD ["npm", "start"]
