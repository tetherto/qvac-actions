'use strict'

require('dotenv').config()

module.exports = {
  qvacExamplesDir: process.env.QVAC_EXAMPLES_DIR,
  corestoreDir: process.env.CORESTORE_DIR,
  socketPath: process.env.SOCKET_PATH
}
