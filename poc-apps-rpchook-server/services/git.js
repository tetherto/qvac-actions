'use strict'

const { exec } = require('child_process')
const util = require('util')
const execAsync = util.promisify(exec)
const logger = require('../logger')
/**
 * Updates the repository at the given directory by fetching the latest changes and checking out the specified commit.
 *
 * @param {string} directory - The local repository path.
 * @param {string} commit - The commit hash to check out.
 * @returns {Promise<void>}
 */
async function updateCode (directory, commit) {
  logger.info(`Updating code in ${directory} to commit ${commit}`)
  await execAsync(
      `cd ${directory} && git fetch --all && git checkout ${commit}`
  )
  logger.info(`Checked out commit ${commit} successfully.`)
}

module.exports = { updateCode }
