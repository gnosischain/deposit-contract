FROM node:20

LABEL org.opencontainers.image.source "https://github.com/gnosischain/deposit-contract"

WORKDIR /app

COPY package.json yarn.lock ./

RUN yarn install

COPY truffle-config.js .
COPY contracts contracts
COPY scripts/deposit.js scripts/

RUN yarn compile

ENTRYPOINT ["node", "./scripts/deposit.js"]
