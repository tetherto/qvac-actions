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

const debug = process?.env?.debug ?? false

function log (level, message) {
  if (level === levels.debug && !debug) return

  const timestamp = new Date().toISOString()
  const logMessage = `[${timestamp}] [${level}] ${message}\n`
  process.stdout.write(logMessage)
  logFile.write(logMessage)
}

function table (data, columns) {
  const options = { index: false }
  console.table(data, columns, options)
  const timestamp = new Date().toISOString()
  const tableString = '\n' + timestamp + '\n' + formatTableForFile(data, columns) + '\n'
  logFile.write(tableString)
}

function formatTableForFile (data, columns) {
  if (!data.length) return ''

  const headers = columns || Object.keys(data[0])
  const rows = data.map(item =>
    headers.map(column => String(item[column] || '')).join(' | ')
  )

  const separator = headers.map(() => '---').join(' | ')

  return [
    headers.join(' | '),
    separator,
    ...rows
  ].join('\n')
}

module.exports = {
  debug: (msg) => log(levels.debug, msg),
  info: (msg) => log(levels.info, msg),
  warn: (msg) => log(levels.warn, msg),
  error: (msg) => log(levels.error, msg),
  table: (data, columns) => table(data, columns)
}
