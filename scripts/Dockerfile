FROM node:20 as build

LABEL org.opencontainers.image.source "https://github.com/gnosischain/deposit-contract"

WORKDIR /build

RUN yarn global add node-gyp

COPY package.json yarn.lock ./

RUN yarn install

FROM node:20 as app

WORKDIR /app

COPY package.json yarn.lock ./
COPY --from=build /build/node_modules /app/node_modules

COPY truffle-config.js .
COPY contracts contracts
COPY scripts/deposit.js scripts/

RUN yarn compile

ENTRYPOINT ["node", "./scripts/deposit.js"]
