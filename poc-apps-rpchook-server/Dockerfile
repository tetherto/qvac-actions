FROM node:20.15.0-slim

WORKDIR /app

COPY package*.json ./

RUN npm install --production
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        git \
        openssh-client \
    && git config --global url."https://github.com/".insteadOf "ssh://git@github.com/" \
    && git config --global http.sslVerify false \
    && npm install -g hp-rpc-cli simple-seeder pear hyperdht \
    && rm -rf /var/lib/apt/lists/*

COPY . .

EXPOSE 49737/udp

CMD ["npm", "start"]
