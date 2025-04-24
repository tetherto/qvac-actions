'use strict'

const fs = require('fs/promises')
const path = require('path')
const logger = require('../logger')

/**
 * Scans the given path for directories which contain both a ui and a worker directory
 * @param {string} path - The path to scan for valid POC directories
 * @returns {Promise<Array<{ name: string; path: string }>>} An array of valid POC directories
 */
async function getValidPocDirectories (dirPath) {
  try {
    const baseStat = await fs.stat(dirPath)
    if (!baseStat.isDirectory()) throw new Error('Path is not a directory')
    const apps = await fs.readdir(dirPath, { withFileTypes: true })
    const validPocs = []
    for (const appDirent of apps) {
      if (!appDirent.isDirectory()) continue
      const appPath = path.join(dirPath, appDirent.name)
      try {
        const subDirs = await fs.readdir(appPath, { withFileTypes: true })
        for (const subDir of subDirs) {
          if (!subDir.isDirectory()) continue
          const subDirPath = path.join(appPath, subDir.name)
          const uiDir = path.join(subDirPath, 'ui')
          const workerDir = path.join(subDirPath, 'worker')
          const [uiStat, workerStat] = await Promise.all([
            fs.stat(uiDir),
            fs.stat(workerDir)
          ])
          if (uiStat.isDirectory() && workerStat.isDirectory()) {
            validPocs.push({
              name: appDirent.name,
              path: subDirPath
            })
          }
        }
      } catch (error) {
        // no-op
      }
    }
    return validPocs
  } catch (error) {
    logger.error(`Error getting valid POC directories: ${error.message}`)
    throw new Error(`Error getting valid POC directories: ${error.message}`)
  }
}

module.exports = {
  getValidPocDirectories
}
