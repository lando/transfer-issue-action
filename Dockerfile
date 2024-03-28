FROM node:20-alpine
COPY . .
RUN npm clean-install --production
ENTRYPOINT [ "node", "/lib/index.js" ]
