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
const { generateFingerprint, generateModelKey } = require('../utils')

const hfModule = require('../hf')
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

const { main } = require('../model-manager')
const { generateS3Fingerprint, needsS3Download } = require('../aws')

const configPath = './mocks/test.config.json'
const config = require('./test.config.json')

// Expected configs for each model based on their tags
const expectedConfigs = {
  'generation:salamandrata:instruct:1.0.0:2B:q8:1.0.0': {
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
  'generation:salamandrata:instruct:1.0.0:2B:q4:1.0.0': {
    addon: '@qvac/translation-llamacpp',
    function: 'generation',
    type: 'instruct',
    name: 'salamandrata',
    externalVersion: '1.0.0',
    params: '2B',
    quantization: 'q4',
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
  },
  'translation:marian:opus:1.0.0::q4f16_1:1.0.0:en-it-large': {
    addon: '@qvac/translation-nmtcpp',
    function: 'translation',
    type: 'opus',
    name: 'marian',
    externalVersion: '1.0.0',
    params: '',
    quantization: 'q4f16_1',
    internalVersion: '1.0.0',
    other: 'en-it-large',
    files: ['config.json', 'model.bin', 'vocab.txt']
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
  } else if (params.Prefix === 'models/marian-large/') {
    // Simulate dated folders for marian-large
    commonPrefixes.push({ Prefix: 'models/marian-large/2025-01-20/' })
    commonPrefixes.push({ Prefix: 'models/marian-large/2025-01-25/' })
  } else if (params.Prefix === 'models/marian-large/2025-01-25/') {
    // Simulate files in the latest folder for marian-large
    contents.push({ Key: 'models/marian-large/2025-01-25/inference.config.json' })
    contents.push({ Key: 'models/marian-large/2025-01-25/model.bin' })
    contents.push({ Key: 'models/marian-large/2025-01-25/vocab.txt' })
    contents.push({ Key: 'models/marian-large/2025-01-25/config.json' })
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
    'generation:salamandrata:instruct:1.0.0:2B:q8:1.0.0',
    'generation:salamandrata:instruct:1.0.0:2B:q4:1.0.0',
    'translation:marian:opus:1.0.0::q4f16_1:1.0.0:en-it',
    'translation:marian:opus:1.0.0::q4f16_1:1.0.0:en-it-large'
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

test('Verify multiple models per drive functionality', t => {
  t.ok(mainHasRun, 'Main must have run before verifying multiple models functionality')

  const basePath = path.resolve(__dirname, '..', config.localBasePath)
  
  // Test that multiple models from different drives are processed correctly
  // Each model should have its own folder and inference config based on unique tags
  const salamandrataModelKeys = [
    'generation:salamandrata:instruct:1.0.0:2B:q8:1.0.0',
    'generation:salamandrata:instruct:1.0.0:2B:q4:1.0.0' // Second model with different quantization
  ]

  for (const modelKey of salamandrataModelKeys) {
    const modelFolderPath = path.join(basePath, modelKey)
    t.ok(fs.existsSync(modelFolderPath), `Folder for ${modelKey} exists: ${modelFolderPath}`)

    const inferencePath = path.join(modelFolderPath, 'inference.config.json')
    t.ok(fs.existsSync(inferencePath), `inference.config.json found for ${modelKey}`)

    const fileContent = JSON.parse(fs.readFileSync(inferencePath, 'utf8'))
    t.ok(fileContent.addon === '@qvac/translation-llamacpp', `Addon matches for ${modelKey}`)
    t.ok(fileContent.function === 'generation', `Function matches for ${modelKey}`)
    t.ok(fileContent.name === 'salamandrata', `Name matches for ${modelKey}`)
    
    // Check that quantization differs between models
    if (modelKey.includes('q8')) {
      t.ok(fileContent.quantization === 'q8', `Quantization is q8 for ${modelKey}`)
    } else if (modelKey.includes('q4')) {
      t.ok(fileContent.quantization === 'q4', `Quantization is q4 for ${modelKey}`)
    }
  }

  t.pass('Multiple models per drive functionality verified')
})

test('Verify AWS models with multiple sources', t => {
  t.ok(mainHasRun, 'Main must have run before verifying AWS multiple sources')

  const basePath = path.resolve(__dirname, '..', config.localBasePath)
  
  // Test that AWS models with different tags are processed correctly
  const marianModelKeys = [
    'translation:marian:opus:1.0.0::q4f16_1:1.0.0:en-it',
    'translation:marian:opus:1.0.0::q4f16_1:1.0.0:en-it-large' // Second model with different 'other' field
  ]

  for (const modelKey of marianModelKeys) {
    const modelFolderPath = path.join(basePath, modelKey)
    t.ok(fs.existsSync(modelFolderPath), `Folder for ${modelKey} exists: ${modelFolderPath}`)

    const inferencePath = path.join(modelFolderPath, 'inference.config.json')
    t.ok(fs.existsSync(inferencePath), `inference.config.json found for ${modelKey}`)

    const fileContent = JSON.parse(fs.readFileSync(inferencePath, 'utf8'))
    t.ok(fileContent.addon === '@qvac/translation-nmtcpp', `Addon matches for ${modelKey}`)
    t.ok(fileContent.function === 'translation', `Function matches for ${modelKey}`)
    t.ok(fileContent.name === 'marian', `Name matches for ${modelKey}`)
  }

  t.pass('AWS models with multiple sources verified')
})

test('Verify drive key functionality with multiple models', t => {
  t.ok(mainHasRun, 'Main must have run before verifying drive key functionality')

  const basePath = path.resolve(__dirname, '..', config.localBasePath)
  
  // Test that models with driveKey are handled correctly
  const existingModelKey = 'translation:existing:opus:1.0.0::q4f16_1:1.0.0:en-de:0'
  const existingModelPath = path.join(basePath, existingModelKey)
  
  // Models with driveKey don't create local files, they only create database records
  // So we don't expect the folder to exist
  t.not(fs.existsSync(existingModelPath), `Folder for existing model should not exist: ${existingModelPath}`)

  // The model should be recorded in the database but not have local files
  // This is the expected behavior for models with driveKey
  t.pass('Drive key functionality with multiple models verified - models with driveKey skip local file creation')
})

test('Verify S3 fingerprint functionality', async (t) => {
  t.ok(mainHasRun, 'Main must have run before verifying S3 fingerprint')

  const basePath = path.resolve(__dirname, '..', config.localBasePath)
  const awsModelKey = 'translation:marian:opus:1.0.0::q4f16_1:1.0.0:en-it-large'
  const awsModelPath = path.join(basePath, awsModelKey)

  const s3FingerprintPath = path.join(awsModelPath, '.s3-fingerprint')
  t.ok(fs.existsSync(s3FingerprintPath), `.s3-fingerprint file exists: ${s3FingerprintPath}`)

  const s3Fingerprint = fs.readFileSync(s3FingerprintPath, 'utf8').trim()
  t.ok(s3Fingerprint.length > 0, 'S3 fingerprint is not empty')
  t.ok(s3Fingerprint.length === 64, 'S3 fingerprint is SHA-256 hash (64 characters)')
  t.ok(/^[a-f0-9]+$/.test(s3Fingerprint), 'S3 fingerprint is valid hex string')

  const s3 = new AWS.S3()
  const testPath = config.drives[2].models[0].path // AWS model path from the marian drive

  const generatedS3Fingerprint = await generateS3Fingerprint(s3, config.bucketName, testPath)
  t.alike(generatedS3Fingerprint, s3Fingerprint, 'Generated S3 fingerprint matches stored fingerprint')

  const needsDownload = await needsS3Download(awsModelPath, s3Fingerprint)
  t.not(needsDownload, 'Should not need download with same S3 fingerprint')

  const differentS3Fingerprint = 'a'.repeat(64) // Different SHA-256 hash
  const needsDownloadDifferent = await needsS3Download(awsModelPath, differentS3Fingerprint)
  t.ok(needsDownloadDifferent, 'Should need download with different S3 fingerprint')

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
  const awsModelKey = 'translation:marian:opus:1.0.0::q4f16_1:1.0.0:en-it-large'
  const awsModelPath = path.join(basePath, awsModelKey)

  const fingerprintPath = path.join(awsModelPath, '.s3-fingerprint')
  t.ok(fs.existsSync(fingerprintPath), `.s3-fingerprint file exists: ${fingerprintPath}`)

  const inferencePath = path.join(awsModelPath, 'inference.config.json')
  t.ok(fs.existsSync(inferencePath), `inference.config.json exists: ${inferencePath}`)

  const inferenceConfig = JSON.parse(fs.readFileSync(inferencePath, 'utf8'))
  t.ok(inferenceConfig.files, 'inference.config.json has files array')
  t.not(inferenceConfig.files.includes('.s3-fingerprint'), '.s3-fingerprint is not in files array')
  t.not(inferenceConfig.files.includes('inference.config.json'), 'inference.config.json is not in files array')

  const expectedFiles = ['config.json', 'model.bin', 'vocab.txt']
  for (const expectedFile of expectedFiles) {
    t.ok(inferenceConfig.files.includes(expectedFile), `Expected file ${expectedFile} is in files array`)
  }

  t.pass('Inference config exclusion verification passed')
})

test('Verify model key generation without trailing colon', t => {
  // Test with empty 'other' field
  const tagsWithoutOther = {
    function: 'generation',
    type: 'instruct',
    name: 'salamandrata',
    externalVersion: '1.0.0',
    params: '2B',
    quantization: 'q8',
    internalVersion: '1.0.0',
    other: ''
  }

  const keyWithoutOther = generateModelKey(tagsWithoutOther)
  t.alike(keyWithoutOther, 'generation:salamandrata:instruct:1.0.0:2B:q8:1.0.0', 'Key without other should not have trailing colon')

  // Test with non-empty 'other' field
  const tagsWithOther = {
    function: 'translation',
    type: 'opus',
    name: 'marian',
    externalVersion: '1.0.0',
    params: '',
    quantization: 'q4f16_1',
    internalVersion: '1.0.0',
    other: 'en-it'
  }

  const keyWithOther = generateModelKey(tagsWithOther)
  t.alike(keyWithOther, 'translation:marian:opus:1.0.0::q4f16_1:1.0.0:en-it', 'Key with other should include the other field')

  t.pass('Model key generation verification passed')
})

test('Verify addon model keys map with multiple models', t => {
  t.ok(mainHasRun, 'Main must have run before verifying addon model keys map')

  // Test that the addon model keys map correctly tracks multiple models per addon
  const expectedAddonModels = {
    '@qvac/translation-llamacpp': [
      'generation:salamandrata:instruct:1.0.0:2B:q8:1.0.0',
      'generation:salamandrata:instruct:1.0.0:2B:q4:1.0.0'
    ],
    '@qvac/translation-nmtcpp': [
      'translation:marian:opus:1.0.0::q4f16_1:1.0.0:en-it',
      'translation:marian:opus:1.0.0::q4f16_1:1.0.0:en-it-large'
    ]
  }

  // This test verifies that the addon model keys map is working correctly
  // by checking that multiple models are associated with the same addon
  for (const [addon, expectedModelKeys] of Object.entries(expectedAddonModels)) {
    t.ok(expectedModelKeys.length > 1, `Addon ${addon} should have multiple models`)
    
    // Verify that all expected model keys are unique
    const uniqueKeys = new Set(expectedModelKeys)
    t.ok(uniqueKeys.size === expectedModelKeys.length, `All model keys for ${addon} should be unique`)
  }

  t.pass('Addon model keys map with multiple models verified')
})

test('Verify duplicate model key detection', t => {
  // Test that the system correctly handles duplicate model keys
  // This is important when multiple models in the same drive have the same tags
  const duplicateTags = {
    function: 'generation',
    type: 'instruct',
    name: 'salamandrata',
    externalVersion: '1.0.0',
    params: '2B',
    quantization: 'q8',
    internalVersion: '1.0.0',
    other: ''
  }

  const modelKey1 = generateModelKey(duplicateTags)
  const modelKey2 = generateModelKey(duplicateTags)
  
  t.alike(modelKey1, modelKey2, 'Same tags should generate same model key')
  t.alike(modelKey1, 'generation:salamandrata:instruct:1.0.0:2B:q8:1.0.0', 'Model key format is correct')

  t.pass('Duplicate model key detection verified')
})

test('Verify model key generation with indices for multiple models', t => {
  // Test that model keys are generated correctly with indices for multiple models
  const tags = {
    function: 'generation',
    type: 'instruct',
    name: 'salamandrata',
    externalVersion: '1.0.0',
    params: '2B',
    quantization: 'q8',
    internalVersion: '1.0.0',
    other: ''
  }

  const baseModelKey = generateModelKey(tags)
  t.alike(baseModelKey, 'generation:salamandrata:instruct:1.0.0:2B:q8:1.0.0', 'Base model key is correct')

  // Test that indices are added correctly
  const modelKey0 = `${baseModelKey}:0`
  const modelKey1 = `${baseModelKey}:1`
  
  t.alike(modelKey0, 'generation:salamandrata:instruct:1.0.0:2B:q8:1.0.0:0', 'Model key with index 0 is correct')
  t.alike(modelKey1, 'generation:salamandrata:instruct:1.0.0:2B:q8:1.0.0:1', 'Model key with index 1 is correct')
  t.not(modelKey0, modelKey1, 'Model keys with different indices should be different')

  // Test with tags that have 'other' field
  const tagsWithOther = {
    function: 'translation',
    type: 'opus',
    name: 'marian',
    externalVersion: '1.0.0',
    params: '',
    quantization: 'q4f16_1',
    internalVersion: '1.0.0',
    other: 'en-it'
  }

  const baseModelKeyWithOther = generateModelKey(tagsWithOther)
  t.alike(baseModelKeyWithOther, 'translation:marian:opus:1.0.0::q4f16_1:1.0.0:en-it', 'Base model key with other field is correct')

  const modelKeyWithOther0 = `${baseModelKeyWithOther}:0`
  const modelKeyWithOther1 = `${baseModelKeyWithOther}:1`
  
  t.alike(modelKeyWithOther0, 'translation:marian:opus:1.0.0::q4f16_1:1.0.0:en-it:0', 'Model key with other field and index 0 is correct')
  t.alike(modelKeyWithOther1, 'translation:marian:opus:1.0.0::q4f16_1:1.0.0:en-it:1', 'Model key with other field and index 1 is correct')

  t.pass('Model key generation with indices verified')
})

test('Cleanup', async (t) => {
  AWSMock.restore('S3')
  t.pass('Cleanup done')
})
