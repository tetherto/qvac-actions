'use strict'

const { z } = require('zod')

const ModelTagsSchema = z.object({
  function: z.enum(['translation', 'generation', 'embedding', 'transcription', 'vad']),
  type: z.string().min(1),
  name: z.string().min(1),
  externalVersion: z.string().default(''),
  params: z.string().default(''),
  quantization: z.string().default(''),
  internalVersion: z.string().min(1),
  other: z.string().default('')
})

// Schema for individual model configuration
const ModelSchema = z.object({
  source: z.enum(['aws', 'hf']),
  path: z.url().or(z.string().min(1)),
  addon: z.string().regex(/^@qvac\/.+/, 'Addon must start with @qvac/'),
  tags: ModelTagsSchema
})

// Schema for the master configuration
const ConfigSchema = z.object({
  localBasePath: z.string().min(1),
  addons: z.array(z.string().regex(/^@qvac\/.+/, 'Addon must start with @qvac/')),
  models: z.array(ModelSchema).min(1, 'At least one model must be configured'),
  awsRegion: z.string().optional(),
  bucketName: z.string().optional()
}).refine((data) => {
  // If any model uses AWS source, awsRegion and bucketName must be provided
  const hasAwsModels = data.models.some(model => model.source === 'aws')
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
