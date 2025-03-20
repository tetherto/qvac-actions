'use strict'

const AWS = require('aws-sdk')
const logger = require('./logger')
const Hyperswarm = require('hyperswarm')
const Corestore = require('corestore')
const Hyperbee = require('hyperbee')
const { main, cleanUp, handleCleanUp, drives } = require('./app')

const configPath = './config.json'
const config = require(configPath)

const s3 = new AWS.S3({ region: config.awsRegion })
const store = new Corestore('./storage')
const core = store.get({ name: 'hyperbee' })
const db = new Hyperbee(core, { keyEncoding: 'utf-8', valueEncoding: 'binary' })
const swarm = new Hyperswarm()

main(configPath, s3, store, db, swarm).then(() => {
  handleCleanUp(drives, db)
}).catch(async (err) => {
  logger.error(`Error in main function: ${err.stack || err}`)
  await cleanUp(drives, db)
})
