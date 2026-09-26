FROM node:24-alpine
WORKDIR /service
COPY --chown=node:node server.mjs sanitize.mjs ./
USER node
CMD ["node", "server.mjs"]
