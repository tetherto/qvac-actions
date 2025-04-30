'use strict'

const { updateCode } = require('./services/git')
const { stageApp } = require('./services/pear')
const { updateAutobaseRecord, getOpenState } = require('./services/store')
const { qvacExamplesDir } = require('./config')
const { getValidPocDirectories } = require('./services/scanner')
const logger = require('./logger')

/**
 * Triggers deployment for the given parameters.
 *
 * @param {object} params - Deployment parameters.
 * @param {Array<string>} params.apps - Applications to deploy.
 * @param {string} params.commit - Commit hash to deploy.
 * @param {string} params.branch - Branch name for deployment.
 * @returns {Promise<object>} Deployment result including Pear keys.
 */
async function triggerDeploy ({ apps, commit, branch }) {
  if (!commit || !branch) {
    throw new Error(
      'Missing required parameters for deployment. Please provide commit, and branch.'
    )
  }
  await updateCode(qvacExamplesDir, commit)

  const validPocs = await getValidPocDirectories(qvacExamplesDir)
  const validRequestedApps = validPocs.filter(poc => apps.includes(poc.name))
  const invalidRequestedApps = apps.filter(app => !validPocs.some(poc => poc.name === app))
  if (invalidRequestedApps.length > 0) {
    logger.error(`The following app(s) were not found and will not be deployed: ${invalidRequestedApps.join(', ')}`)
  }
  const uiPearKeys = []
  let pocBeeKey = null
  for (const poc of validRequestedApps) {
    try {
      const keys = await stageApp(poc.path, branch)
      if (!keys.uiPearKey || !keys.workerPearKey) {
        logger.error(`Failed to obtain Pear keys from staging for ${poc.name}.`)
      }
      pocBeeKey = await updateAutobaseRecord({ poc: poc.name, channel: branch, uiPearKey: keys.uiPearKey, workerPearKey: keys.workerPearKey })
      uiPearKeys.push({
        name: poc.name,
        uiPearKey: keys.uiPearKey
      })
    } catch (err) {
      logger.error(`Error staging app for ${poc.name}: ${err.message}`)
    }
  }

  return {
    message: 'Deployment triggered successfully',
    uiPearKeys,
    pocBeeKey
  }
}

/**
 * Retrieves the open state of the autobase
 * @returns {Promise<{ linearizedViewState: Object<string, object>, uiPearKeys: string[] }>}
 */
async function getState () {
  const state = await getOpenState()
  return state
}

module.exports = { triggerDeploy, getState }
