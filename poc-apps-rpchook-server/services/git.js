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
 * @param {string} [prNumber] - The pull request number to fetch.
 * @returns {Promise<void>}
 */
async function updateCode (directory, commit, prNumber) {
  logger.info(`Updating code in ${directory} to commit ${commit}`)
  await execAsync(`git -C ${directory} fetch --all --prune`)
  await execAsync(`git -C ${directory} fetch --unshallow`).catch(() => {
    /* ignore if not a shallow clone */
  })

  if (prNumber) {
    await execAsync(`git -C ${directory} fetch origin pull/${prNumber}/head`)
    await execAsync(`git -C ${directory} checkout --detach ${commit}`)
  } else {
    await execAsync(`git -C ${directory} checkout ${commit}`)
  }
  logger.info(`Checked out commit ${commit} successfully.`)
}

module.exports = { updateCode }
