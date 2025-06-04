# qvac-poc-rpchook-server

This RPC server listens for incoming rpchooks requests to stage and seed all PoC applications within [qvac-examples](https://github.com/tetherto/qvac-examples).

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

1. Clone the QVAC Examples Repository in the project root:

```bash
git clone https://github.com/tetherto/qvac-examples
```

2. Configure Environment Variables
   Create a `.env` file in the project root by copying the provided `.env.example` file:

```bash
cp .env.example .env
```

Then, update the following environment variables in the .env file with the appropriate values:

**QVAC_EXAMPLES_DIR** – Full path to the QVAC Examples directory.

Example: `/home/<user>/qvac-devops/poc-apps-rpchook-server/qvac-examples`

**CORESTORE_DIR** – Full path to the corestore directory.

Example: `/home/<user>/qvac-devops/poc-apps-rpchook-server/storage`

**SOCKET_PATH** – Full path to the Pear socket file.

• Linux: `/home/<user>/.config/pear/pear.sock`

• macOS: `/Users/<user>/Library/Application Support/pear/pear.sock`

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
hp-rpc-cli -s <server-public-key> -m triggerDeploy -d '{"apps": ["app-name"], "commit": "commit-hash", "prNumber": "pull-request-number",
"channel": "desired-channel-name"}' -t <timeout>
```

2. **Example**:
   To trigger the deployment of the `translation-app` and `assistant-app` PoC applications from commit `949f42191702d4e293fe8a2c909e36b3511f5ea4` on the `main` channel with a timeout of 300 seconds, run:

```bash
hp-rpc-cli -s 10d6a996238587fbed4842ab63d9ee64668497e34759921cb1cacedc64542683 \
  -m triggerDeploy \
  -d '{"apps": ["translation-app"], "commit": "949f42191702d4e293fe8a2c909e36b3511f5ea4", "prNumber": "123", "channel": "main"}' \
  -t 300000
```

The response should look similar to:

```json
{
  "message": "Deployment triggered successfully",
  "pocBeeKey": "a-bee-key",
  "uiPearKeys": [
    {
      "name": "assistant-app",
      "uiPearKey": "a-pear-key"
    },
    {
      "name": "transcription-app",
      "uiPearKey": "a-pear-key"
    },
    {
      "name": "translation-app",
      "uiPearKey": "a-pear-key"
    }
  ],
  "errors": ["some error message(s) if any"]
}
```

Note:

- If no apps are provided `apps: []`, all apps will be deployed.
- If no prNumber is provided, it will be assumed that the commit is from a branch and not a pull request.
- If no errors occur, the `errors` field will not be present in the response.
- If multiple errors occur, the `errors` field will contain an array of all error messages.

### Getting the State

1. In the terminal, send a getState request using hp-rpc-cli:

```bash
hp-rpc-cli -s <server-public-key> -m getState -d '{}' -t <timeout>
```

2. **Example**:
   To retrieve the open state of the autobase along with the UI pear keys of all currently seeded PoC applications, run:

```bash
hp-rpc-cli -s 5be567eef2dcb21160fffbcde173f72fc3c9eab83b7527162318deab0e423e8d \
  -m getState \
  -d '{}' \
  -t 150000
```

The response should look similar to:

```json
{
  "linearizedViewState": {
    "<poc>:<channel>": {
      "poc": "assistant-app",
      "channel": "main",
      "uiPearKey": "a-pear-key",
      "workerPearKey": "a-pear-key"
    },
    ...
  },
  "uiPearKeys": [
    "a-pear-key",
    ...
  ]
}
```

### Getting Deployment Keys for a given PoC and Channel

1. In the terminal, send a getPocDeploymentKeys request using hp-rpc-cli:

```bash
hp-rpc-cli -s <server-public-key> -m getDeploymentKeys -d '{"app": "poc-application-name", "channel": "channel-name"}' -t <timeout>
```

2. **Example**:
   To retrieve the deployment keys for the `translation-app` PoC application on the `main` channel, run:

```bash
hp-rpc-cli -s 10d6a996238587fbed4842ab63d9ee64668497e34759921cb1cacedc64542683 \
  -m getDeploymentKeys \
  -d '{"app": "translation-app", "channel": "main"}' \
  -t 150000
```

The response should look similar to:

```json
{
  "app": "translation-app",
  "channel": "main",
  "ui": "a-pear-key",
  "worker": "a-pear-key",
  "errors": ["some error message(s) if any"]
}
```

Note:

- If no deployment keys are found, the `errors` field will contain the message `No deployment keys found`.
- If multiple errors occur, the `errors` field will contain an array of all error messages.

## Usage with Docker

1. Create a `.env.docker` file in the project root by copying the provided `.env.example` file:

```bash
cp .env.example .env.docker
```

Then, update the configuration as needed. Ensure `CORESTORE_DIR` matches the volume mount path in the Docker run command.

2. Build the Docker image:

```bash
docker build \
  --build-arg NPM_TOKEN=<your-npm-token> \
  -t qvac-poc-rpchook-server \
  .
```

3. Run the Docker container:

```bash
docker run -d \
  -p 49737:49737/udp \
  --env-file .env.docker \
  -v qvac-corestore:/app/storage \
  --name qvac-poc-rpchook-server \
  qvac-poc-rpchook-server
```
