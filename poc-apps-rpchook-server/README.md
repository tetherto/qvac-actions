# qvac-poc-rpchook-server

This RPC server listens for incoming rpchooks requests to stage and seed the desired PoC application.

## Installation

1. Install the following packages globally pear, simple-seeder and hp-rpc-cli:

```bash
npm install -g pear simple-seeder hp-rpc-cli
```

2. Install the local dependencies:

```bash
npm install
```

## Setup

1. Create the PoC Directory
   In the root directory of the project, create a folder named pocs to store the PoC application repositories.

```bash
mkdir pocs
cd pocs
```

2. Clone a PoC Application Repository
   For example, to clone the marian PoC application, run:

```bash
git clone https://github.com/tetherto/qvac-translation-poc.git
```

3. Configure Environment Variables
   Create a `.env` file in the project root by copying the provided `.env.example` file:

```bash
cp .env.example .env
```

Then, update the configuration as needed.

## Usage

### Starting the Server

1. Open a terminal in the project root and start the server:

```bash
npm start
```

You should see output similar to:

```bash
RPC server listening on public key: <public-key>
```

### Triggering a Deployment

1. In the terminal, send a deployment request using hp-rpc-cli:

```bash
hp-rpc-cli -s <server-public-key> -m triggerDeploy -d '{"commit": "commit-hash", "branch": "desired-channel-name", "poc": "poc-type"}' -t <timeout>
```

2. **Example**:
   To trigger the deployment of the `marian` PoC application from commit `54c851b8e5302e47bb792256968caeb4f41a28e7` on the `develop2` branch/channel with a timeout of 150 seconds, run:

```bash
hp-rpc-cli -s 3b6e501aaacfa506e16739841f9e6e042b7bd4b0107a34c9f61bcf5337a53f15 \
  -m triggerDeploy \
  -d '{"commit": "54c851b8e5302e47bb792256968caeb4f41a28e7", "branch": "develop2", "poc": "marian"}' \
  -t 150000
```

The response should look similar to:

```json
{
  "message": "Deployment triggered successfully",
  "pocBeeKey": "4d4e5e06eb5345491191711395c71f01d3f317fc0f49e0413eecf7588aab5a7f",
  "uiPearKey": "99ab8x7a43ss3tygsitiiw5b1kjog35u6zanmbhmse3rqn84pwco"
}
```

### Getting the State

1. In the terminal, send a getState request using hp-rpc-cli:

```bash
hp-rpc-cli -s <server-public-key> -m getState -d '{}' -t <timeout>
```

2. **Example**:
   To retrieve the open state of the autobase along with the UI pear keys of all currently seeded PoC applications, run:

```bash
hp-rpc-cli -s 3b6e501aaacfa506e16739841f9e6e042b7bd4b0107a34c9f61bcf5337a53f15 \
  -m getState \
  -d '{}' \
  -t 150000
```

The response should look similar to:

```json
{
  "linearizedViewState": {
    "poc:channel": {
      "poc": "marian",
      "channel": "develop2",
      "uiPearKey": "some-pear-key",
      "workerPearKey": "some-pear-key"
    },
    ...
  },
  "uiPearKeys": [
    "some-pear-key",
    ...
  ]
}
```

## Usage with Docker

1. Create a `.env.docker` file in the project root by copying the provided `.env.example` file:

```bash
cp .env.example .env.docker
```

Then, update the configuration as needed.

2. Build the Docker image:

```bash
docker build -t qvac-poc-rpchook-server .
```

3. Run the Docker container:

```bash
docker run -d -p 49737:49737/udp --env-file .env.docker --name qvac-poc-rpchook-server qvac-poc-rpchook-server
```
