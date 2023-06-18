FROM node:16-alpine
COPY . .
RUN yarn install --production
ENTRYPOINT [ "node", "/lib/index.js" ]
