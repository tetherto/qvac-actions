'use strict'

const fs = require('fs')
const path = require('path')

const logFile = fs.createWriteStream(path.join(__dirname, 'app.log'), { flags: 'a' })

const levels = {
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR'
}

function log (level, message) {
  const timestamp = new Date().toISOString()
  const logMessage = `[${timestamp}] [${level}] ${message}\n`
  process.stdout.write(logMessage)
  logFile.write(logMessage)
}

module.exports = {
  debug: (msg) => log(levels.debug, msg),
  info: (msg) => log(levels.info, msg),
  warn: (msg) => log(levels.warn, msg),
  error: (msg) => log(levels.error, msg)
}
