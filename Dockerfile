# The image the cluster runs (cluster-sec k8s/walk). Built by CI for
# linux/amd64 and tagged with the 12-char commit SHA; see .github/workflows.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine
ENV NODE_ENV=production
ARG WALK_TAG=dev
ENV WALK_TAG=$WALK_TAG
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY server ./server
COPY src ./src
# uid 1000 is the image's `node` user. The root filesystem is read-only in
# the cluster; only /tmp is writable.
USER 1000
EXPOSE 8080
CMD ["node", "server/main.ts"]
