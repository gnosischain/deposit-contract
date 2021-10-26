FROM node:14-alpine

WORKDIR /app

COPY package.json yarn.lock ./

RUN yarn install

COPY . .

RUN yarn compile

ENTRYPOINT ["node", "./scripts/deposit.js"]
