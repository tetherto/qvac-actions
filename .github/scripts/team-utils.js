export async function getRepoOwningTeam(github, context) {
  try {
    const { data: codeownersFile } = await github.rest.repos.getContent({
      owner: context.repo.owner,
      repo: context.repo.repo,
      path: "./CODEOWNERS",
    });

    const content = Buffer.from(codeownersFile.content, "base64").toString();
    const match = content.match(/\* @[\w-]+\/([\w-]+)/);
    return match ? match[1] : null;
  } catch (error) {
    console.log("Could not read CODEOWNERS file");
    return null;
  }
}
export async function getUserTeams(github, context, username) {
  try {
    const { data: userTeams } =
      await github.rest.teams.listForAuthenticatedUser({
        org: context.repo.owner,
      });
    return userTeams.map((team) => team.slug);
  } catch (error) {
    return [];
  }
}
