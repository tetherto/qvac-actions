'use strict'

const fs = require('fs')
const path = require('path')
const logger = require('./logger')
const { downloadFileToCacheDir } = require('@huggingface/hub')

/**
 * Parse a HF download URL into { repo, hfPath, revision }.
 *
 * e.g.
 *  https://huggingface.co/BSC-LT/salamandraTA-2B-instruct-GGUF/resolve/main/salamandrata_2b_inst_q8.gguf
 * → { repo: "BSC-LT/salamandraTA-2B-instruct-GGUF",
 *     hfPath: "salamandrata_2b_inst_q8.gguf",
 *     revision: "main" }
 */
function parseHfDownloadUrl (url) {
  const u = new URL(url)
  if (u.hostname !== 'huggingface.co') {
    throw new Error(`Not a huggingface.co URL: ${url}`)
  }
  const parts = u.pathname.split('/').filter(Boolean)
  if ((parts[2] !== 'resolve' && parts[2] !== 'blob') || parts.length < 5) {
    throw new Error('URL is not in /<repo>/resolve/<rev>/<path> or /<repo>/blob/<rev>/<path> format')
  }
  const repo = `${parts[0]}/${parts[1]}`
  const revision = parts[3]
  const hfPath = parts.slice(4).join('/')
  return { repo, hfPath, revision }
}

/**
 * Download a HF model into your outputDir.
 * Will skip if already present locally.
 *
 * @param {string} url       - HF model URL
 * @param {string} modelsRoot - where to place the downloaded file
 * @param {string} modelKey   - unique key to name the local model folder
 * @returns {Promise<string>} local model folder path
 */
async function downloadHFModel (url, modelsRoot, modelKey) {
  const { repo, hfPath, revision } = parseHfDownloadUrl(url)

  const cachePath = await downloadFileToCacheDir({
    repo, path: hfPath, revision, accessToken: process.env.HF_TOKEN
  })

  const originalFilename = path.basename(hfPath)
  const destDir = path.join(modelsRoot, modelKey)
  await fs.promises.mkdir(destDir, { recursive: true })

  const destFile = path.join(destDir, originalFilename)

  try {
    await fs.promises.unlink(destFile)
  } catch (_) { }
  await fs.promises.copyFile(cachePath, destFile)

  const cacheStats = await fs.promises.stat(cachePath)
  const destStats = await fs.promises.stat(destFile)

  if (cacheStats.size !== destStats.size) {
    throw new Error(`File copy failed: cache size ${cacheStats.size} != dest size ${destStats.size}`)
  }

  logger.info(`Downloaded ${repo}/${hfPath}@${revision} -> ${destFile} (${(destStats.size / (1024 * 1024)).toFixed(2)} MB)`)
  return destDir
}

module.exports = {
  parseHfDownloadUrl,
  downloadHFModel
}
