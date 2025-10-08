'use strict'

const { z } = require('zod')

const LicenseEnum = z.enum(['Apache-2.0', 'GNU-V3', 'Llama-3.2', 'MIT', 'Qwen'])

const ModelTagsSchema = z.object({
  function: z.enum(['translation', 'generation', 'embedding', 'transcription', 'vad', 'tts']),
  type: z.string().min(1),
  name: z.string().min(1),
  externalVersion: z.string().default(''),
  params: z.string().default(''),
  quantization: z.string().default(''),
  internalVersion: z.string().min(1),
  other: z.string().default('')
})

// Schema for individual model file configuration
const ModelSchema = z.object({
  source: z.enum(['aws', 'hf']),
  path: z.url().or(z.string().min(1))
})

// Schema for drive metadata (checksum information)
const DriveMetadataSchema = z.object({
  filename: z.string(),
  checksum: z.string(),
  expectedSize: z.number()
})

// Schema for individual drive configuration
const DriveSchema = z.object({
  addon: z.string().regex(/^@qvac\/.+/, 'Addon must start with @qvac/'),
  tags: ModelTagsSchema,
  models: z.array(ModelSchema).min(1, 'At least one model must be configured'),
  driveKey: z.string().optional(),
  driveMetadata: z.array(DriveMetadataSchema).optional(),
  license: z.array(LicenseEnum).min(1, 'At least one license must be specified')
})

// Schema for the master configuration
const ConfigSchema = z.object({
  localBasePath: z.string().min(1),
  addons: z.array(z.string().regex(/^@qvac\/.+/, 'Addon must start with @qvac/')),
  drives: z.array(DriveSchema).min(1, 'At least one drive must be configured'),
  awsRegion: z.string().optional(),
  bucketName: z.string().optional()
}).refine((data) => {
  // If any model uses AWS source, awsRegion and bucketName must be provided
  const hasAwsModels = data.drives.some(drive => drive.models.some(model => model.source === 'aws'))
  if (hasAwsModels && (!data.awsRegion || !data.bucketName)) {
    return false
  }
  return true
}, {
  message: 'awsRegion and bucketName are required when using AWS source models',
  path: ['awsRegion']
})

module.exports = {
  ConfigSchema
}
