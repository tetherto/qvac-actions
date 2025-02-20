require('dotenv').config()

module.exports = {
  marianPocDir: process.env.MARIAN_POC_DIR,
  npmToken: process.env.NPM_TOKEN,
  corestoreDir: process.env.CORESTORE_DIR,
  socketPath: process.env.SOCKET_PATH
}
