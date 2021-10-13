FROM node:14-alpine
COPY . .
RUN yarn install --production
ENTRYPOINT [ "node", "/lib/index.js" ]