'use strict'

const test = require('brittle')
const AWSMock = require('aws-sdk-mock')
const AWS = require('aws-sdk')
const fs = require('fs')
const path = require('path')
const getTmpDir = require('test-tmp')
const Corestore = require('corestore')
const Hyperbee = require('hyperbee')
const { Readable } = require('stream')
const logger = require('../logger')

const hfModule = require('../refactor/hf')
hfModule.downloadHFModel = async (url, modelsRoot, modelKey) => {
  const destDir = path.join(modelsRoot, modelKey)
  await fs.promises.mkdir(destDir, { recursive: true })

  // Create a small simulated model file
  const destFile = path.join(destDir, 'model.txt')
  const mockModelContent = 'mock hf model content - this is a simulated model file for testing'
  await fs.promises.writeFile(destFile, mockModelContent)

  logger.info(`Mocked HF download: ${url} -> ${destFile} (${mockModelContent.length} bytes)`)
  return destDir
}

const { main } = require('../refactor/model-manager')
const { generateS3Fingerprint, needsS3Download } = require('../refactor/aws')

const configPath = './mocks/test.config.json'
const config = require('./test.config.json')

// Expected configs for each model based on their tags
const expectedConfigs = {
  'generation:salamandrata:instruct:1.0.0:2B:q8:1.0.0:': {
    addon: '@qvac/translation-llamacpp',
    function: 'generation',
    type: 'instruct',
    name: 'salamandrata',
    externalVersion: '1.0.0',
    params: '2B',
    quantization: 'q8',
    internalVersion: '1.0.0',
    other: '',
    files: ['model.txt']
  },
  'translation:marian:opus:1.0.0::q4f16_1:1.0.0:en-it': {
    addon: '@qvac/translation-nmtcpp',
    function: 'translation',
    type: 'opus',
    name: 'marian',
    externalVersion: '1.0.0',
    params: '',
    quantization: 'q4f16_1',
    internalVersion: '1.0.0',
    other: 'en-it',
    files: ['model.bin', 'vocab.txt']
  }
}

let mainHasRun = false

// Mock AWS S3
AWSMock.setSDKInstance(AWS)
AWSMock.mock('S3', 'listObjectsV2', (params, callback) => {
  const contents = []
  const commonPrefixes = []

  if (params.Prefix === 'models/marian/') {
    // Simulate dated folders
    commonPrefixes.push({ Prefix: 'models/marian/2025-01-15/' })
    commonPrefixes.push({ Prefix: 'models/marian/2025-01-20/' })
    commonPrefixes.push({ Prefix: 'models/marian/2025-01-25/' })
  } else if (params.Prefix === 'models/marian/2025-01-25/') {
    // Simulate files in the latest folder
    contents.push({ Key: 'models/marian/2025-01-25/inference.config.json' })
    contents.push({ Key: 'models/marian/2025-01-25/model.bin' })
    contents.push({ Key: 'models/marian/2025-01-25/vocab.txt' })
  }

  callback(null, {
    IsTruncated: false,
    Contents: contents,
    CommonPrefixes: commonPrefixes
  })
})

AWSMock.mock('S3', 'getObject', (params, callback) => {
  if (params.Key.includes('inference.config.json')) {
    // Use the expected config for the AWS model
    const awsModelConfig = expectedConfigs['translation:marian:opus:1.0.0::q4f16_1:1.0.0:en-it']
    const jsonContent = JSON.stringify(awsModelConfig)
    const stream = new Readable()
    stream.push(jsonContent)
    stream.push(null)
    callback(null, stream)
  } else {
    // Simulate other files
    const stream = new Readable()
    stream.push('mock s3 file content')
    stream.push(null)
    callback(null, stream)
  }
})

test('Run main function', async (t) => {
  const tmpDir = await getTmpDir()
  const store = new Corestore(tmpDir)
  const core = store.get({ name: 'hyperbee' })
  const db = new Hyperbee(core, { keyEncoding: 'utf-8', valueEncoding: 'binary' })
  const s3 = new AWS.S3()

  await main(configPath, s3, store, db)
  mainHasRun = true
  t.pass('Main function completed without error')
})

test('Verify test output', t => {
  t.ok(mainHasRun, 'Main must have run before verifying output')

  const basePath = path.resolve(__dirname, '..', config.localBasePath)
  t.ok(fs.existsSync(basePath), `Base path exists: ${basePath}`)

  const expectedModelKeys = [
    'generation:salamandrata:instruct:1.0.0:2B:q8:1.0.0:',
    'translation:marian:opus:1.0.0::q4f16_1:1.0.0:en-it'
  ]

  for (const modelKey of expectedModelKeys) {
    const modelFolderPath = path.join(basePath, modelKey)
    t.ok(fs.existsSync(modelFolderPath), `Folder for ${modelKey} exists: ${modelFolderPath}`)

    const inferencePath = path.join(modelFolderPath, 'inference.config.json')
    t.ok(fs.existsSync(inferencePath), `inference.config.json found in: ${inferencePath}`)

    const fileContent = JSON.parse(fs.readFileSync(inferencePath, 'utf8'))
    const expectedConfig = expectedConfigs[modelKey]
    t.alike(fileContent, expectedConfig, `inference.config.json content matches expected for ${modelKey}`)
  }

  t.pass('Verification passed for all models')
})

test('Verify S3 fingerprint functionality', async (t) => {
  t.ok(mainHasRun, 'Main must have run before verifying S3 fingerprint')

  const basePath = path.resolve(__dirname, '..', config.localBasePath)
  const awsModelKey = 'translation:marian:opus:1.0.0::q4f16_1:1.0.0:en-it'
  const awsModelPath = path.join(basePath, awsModelKey)

  const s3FingerprintPath = path.join(awsModelPath, '.s3-fingerprint')
  t.ok(fs.existsSync(s3FingerprintPath), `.s3-fingerprint file exists: ${s3FingerprintPath}`)

  const s3Fingerprint = fs.readFileSync(s3FingerprintPath, 'utf8').trim()
  t.ok(s3Fingerprint.length > 0, 'S3 fingerprint is not empty')
  t.ok(s3Fingerprint.length === 64, 'S3 fingerprint is SHA-256 hash (64 characters)')
  t.ok(/^[a-f0-9]+$/.test(s3Fingerprint), 'S3 fingerprint is valid hex string')

  const s3 = new AWS.S3()
  const testPath = config.models[1].path // AWS model path

  const generatedS3Fingerprint = await generateS3Fingerprint(s3, config.bucketName, testPath)
  t.alike(generatedS3Fingerprint, s3Fingerprint, 'Generated S3 fingerprint matches stored fingerprint')

  const needsDownload = await needsS3Download(awsModelPath, s3Fingerprint)
  t.not(needsDownload, 'Should not need download with same S3 fingerprint')

  const differentS3Fingerprint = 'a'.repeat(64) // Different SHA-256 hash
  const needsDownloadDifferent = await needsS3Download(awsModelPath, differentS3Fingerprint)
  t.ok(needsDownloadDifferent, 'Should need download with different S3 fingerprint')

  const { generateFingerprint } = require('../refactor/utils')
  const localFolderFingerprint = await generateFingerprint(awsModelPath)
  t.ok(localFolderFingerprint.length > 0, 'Local folder fingerprint is not empty')
  t.ok(localFolderFingerprint.length === 64, 'Local folder fingerprint is SHA-256 hash (64 characters)')
  t.ok(/^[a-f0-9]+$/.test(localFolderFingerprint), 'Local folder fingerprint is valid hex string')

  t.not(localFolderFingerprint, s3Fingerprint, 'Local folder fingerprint should be different from S3 fingerprint')

  const inferencePath = path.join(awsModelPath, 'inference.config.json')
  t.ok(fs.existsSync(inferencePath), 'inference.config.json exists for fingerprint calculation')

  t.pass('S3 fingerprint functionality verified')
})

test('Verify .s3-fingerprint is excluded from inference config', t => {
  t.ok(mainHasRun, 'Main must have run before verifying inference config exclusion')

  const basePath = path.resolve(__dirname, '..', config.localBasePath)
  const awsModelKey = 'translation:marian:opus:1.0.0::q4f16_1:1.0.0:en-it'
  const awsModelPath = path.join(basePath, awsModelKey)

  const fingerprintPath = path.join(awsModelPath, '.s3-fingerprint')
  t.ok(fs.existsSync(fingerprintPath), `.s3-fingerprint file exists: ${fingerprintPath}`)

  const inferencePath = path.join(awsModelPath, 'inference.config.json')
  t.ok(fs.existsSync(inferencePath), `inference.config.json exists: ${inferencePath}`)

  const inferenceConfig = JSON.parse(fs.readFileSync(inferencePath, 'utf8'))
  t.ok(inferenceConfig.files, 'inference.config.json has files array')
  t.not(inferenceConfig.files.includes('.s3-fingerprint'), '.s3-fingerprint is not in files array')
  t.not(inferenceConfig.files.includes('inference.config.json'), 'inference.config.json is not in files array')

  const expectedFiles = ['model.bin', 'vocab.txt']
  for (const expectedFile of expectedFiles) {
    t.ok(inferenceConfig.files.includes(expectedFile), `Expected file ${expectedFile} is in files array`)
  }

  t.pass('Inference config exclusion verification passed')
})

test('Cleanup', async (t) => {
  AWSMock.restore('S3')
  t.pass('Cleanup done')
})
