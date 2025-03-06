'use strict'

const test = require('brittle')
const AWSMock = require('aws-sdk-mock')
const AWS = require('aws-sdk')
const fs = require('fs')
const path = require('path')
const RAM = require('random-access-memory')
const Hyperswarm = require('hyperswarm')
const Corestore = require('corestore')
const Hyperbee = require('hyperbee')
const { Readable } = require('stream')
const { main, cleanUp, drives } = require('../app')
const config = require('./test.config.json')

const store = new Corestore(RAM)
const core = store.get({ name: 'hyperbee' })
const db = new Hyperbee(core, { keyEncoding: 'utf-8', valueEncoding: 'binary' })
const swarm = new Hyperswarm()

const inferenceConfigContent = {
  type: 'llama',
  name: 'opus',
  quantization: 'q4f16_1',
  mlc: {
    settings: [
      'ndarray_cache.json',
      'tokenizer.json',
      'vocab.json'
    ],
    weight_shards: 5
  }
}

let mainHasRun = false

test('S3 Mocks Setup', t => {
  AWSMock.setSDKInstance(AWS)

  AWSMock.mock('S3', 'listObjectsV2', (params, callback) => {
    const contents = []
    const commonPrefixes = []

    if (params.Prefix === 'llama_32_3b_q4f16_1/') {
      contents.push({ Key: 'dummyFile.txt' })
      commonPrefixes.push({ Prefix: '2025-03-04' })
      commonPrefixes.push({ Prefix: '2025-02-04' })
    } else if (params.Prefix === 'llama_31_8b_q0f32/') {
      contents.push({ Key: 'dummyFile1.txt' })
      commonPrefixes.push({ Prefix: '2024-12-27' })
      commonPrefixes.push({ Prefix: '2025-01-13' })
    } else {
      // Represents config file in the "latest" model folder
      contents.push({ Key: 'inference.config.json' })
    }

    callback(null, {
      IsTruncated: false,
      Contents: contents,
      CommonPrefixes: commonPrefixes
    })
  })

  AWSMock.mock('S3', 'getObject', (params, callback) => {
    const fakeStream = new Readable({ read () { } })
    fakeStream.push(JSON.stringify(inferenceConfigContent))
    fakeStream.push(null)

    callback(null, {
      createReadStream: () => fakeStream
    })
  })

  t.pass('S3 mocks set up successfully')
})

test('Run main function', async (t) => {
  const s3 = new AWS.S3()

  await main(config, s3, store, db, swarm)
  mainHasRun = true
  t.pass('Main function completed without error')
})

test('Verify test output', t => {
  t.ok(mainHasRun, 'Main must have run before verifying output')

  const basePath = path.resolve(__dirname, '..', config.localBasePath)
  t.ok(fs.existsSync(basePath), `Base path exists: ${basePath}`)

  for (const pair of Object.keys(config.pairs)) {
    const pairFolderPath = path.join(basePath, pair)
    t.ok(fs.existsSync(pairFolderPath), `Folder for ${pair} exists: ${pairFolderPath}`)

    const inferencePath = path.join(pairFolderPath, 'inference.config.json')
    t.ok(fs.existsSync(inferencePath), `inference.config.json found in: ${inferencePath}`)

    const fileContent = JSON.parse(fs.readFileSync(inferencePath, 'utf8'))
    t.alike(fileContent, inferenceConfigContent, 'inference.config.json content matches expected')
  }

  t.pass('Verification passed for all pairs')
})

test('Cleanup', async (t) => {
  AWSMock.restore('S3')
  t.pass('Cleanup done')
  await cleanUp(drives, db)
})
