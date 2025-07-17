'use strict'

const { z } = require('zod')

const ModelTagsSchema = z.object({
  function: z.enum(['translate', 'generation', 'embedding', 'transcription', 'vad']),
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
  models: z.array(ModelSchema).min(1, 'At least one model must be configured')
})

module.exports = {
  ConfigSchema
}
