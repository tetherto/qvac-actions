'use strict'

const { updateCode } = require('./services/git')
const { stageApp } = require('./services/pear')
const { updateAutobaseRecord, getOpenState } = require('./services/store')
const { marianPocDir } = require('./config')

/**
 * Triggers deployment for the given parameters.
 *
 * @param {object} params - Deployment parameters.
 * @param {string} params.poc - Proof-of-concept identifier.
 * @param {string} params.commit - Commit hash to deploy.
 * @param {string} params.branch - Branch name for deployment.
 * @returns {Promise<object>} Deployment result including Pear keys.
 */
async function triggerDeploy ({ poc, commit, branch }) {
  if (!poc || !commit || !branch) {
    throw new Error(
      'Missing required parameters for deployment. Please provide poc, commit, and branch.'
    )
  }

  let keys = null
  switch (poc) {
    case 'marian':
      await updateCode(marianPocDir, commit)
      keys = await stageApp(marianPocDir, branch)
      break
    default:
      throw new Error(`Unsupported POC: ${poc}`)
  }

  if (!keys.uiPearKey || !keys.workerPearKey) {
    throw new Error('Failed to obtain Pear keys from staging.')
  }

  const pocBeeKey = await updateAutobaseRecord({ poc, channel: branch, uiPearKey: keys.uiPearKey, workerPearKey: keys.workerPearKey })
  return {
    message: 'Deployment triggered successfully',
    uiPearKey: keys.uiPearKey,
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
