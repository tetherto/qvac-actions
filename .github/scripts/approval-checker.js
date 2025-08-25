import { getRepoOwningTeam, getUserTeamsCustom } from "./team-utils.js";

export async function checkApprovals(github, context, prNumber) {
  const { data: pr } = await github.rest.pulls.get({
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: prNumber,
  });

  const { data: reviews } = await github.rest.pulls.listReviews({
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: prNumber,
  });

  const repoOwningTeam = await getRepoOwningTeam(github, context);

  console.log(`Repo owner team: ${repoOwningTeam}`);

  const teamLeads = ["team-leads"];
  const management = ["management"];

  let teamMemberApprovals = 0;
  let teamLeadApprovals = 0;
  let managementApprovals = 0;

  const latestReviews = {};

  reviews.forEach((review) => {
    const reviewer = review.user.login;
    console.log(`reviewer: ${reviewer}`);
    if (
      !latestReviews[reviewer] ||
      review.submitted_at > latestReviews[reviewer].submitted_at
    ) {
      latestReviews[reviewer] = review;
    }
  });

  const filteredReviews = Object.values(latestReviews).filter(
    (review) => review.state === "APPROVED"
  );

  const teamResults = await Promise.all(
    filteredReviews.map(async (review) => {
      const reviewer = review.user.login;
      const userTeams = await getUserTeams(github, context, reviewer);

      let isManagement = false;
      let isTeamLead = false;
      let isRepoOwner = false;

      isManagement = userTeams.some((team) => management.includes(team));
      if (!isManagement) {
        isTeamLead = userTeams.some((team) => teamLeads.includes(team));
      }
      if (!isManagement && !isTeamLead) {
        isRepoOwner = repoOwningTeam && userTeams.includes(repoOwningTeam);
      }

      return {
        isManagement: userTeams.some((team) => management.includes(team)),
        isTeamLead: userTeams.some((team) => teamLeads.includes(team)),
        isRepoOwner: repoOwningTeam && userTeams.includes(repoOwningTeam),
      };
    })
  );

  // Process results
  teamResults.forEach((result) => {
    if (result.isManagement) {
      managementApprovals++;
    } else if (result.isTeamLead) {
      teamLeadApprovals++;
    } else if (result.isRepoOwner || result.isAnyFunctionalTeam) {
      teamMemberApprovals++;
    }
  });

  return {
    repoOwningTeam,
    teamMemberApprovals,
    teamLeadApprovals,
    managementApprovals,
    pr,
  };
}
export function checkTierRequirements(
  github,
  context,
  approvals,
  tier,
  prNumber
) {
  const { teamMemberApprovals, teamLeadApprovals, managementApprovals, pr } =
    approvals;

  let requirementsMet, statusMessage;

  if (tier === "tier1") {
    const tlOrMgmtApprovals = teamLeadApprovals + managementApprovals;
    requirementsMet = teamMemberApprovals >= 1 && tlOrMgmtApprovals >= 1;

    statusMessage = requirementsMet
      ? `✅ Tier 1 requirements met`
      : `❌ Tier 1 requirements not met. Need: 1 Team Member (${teamMemberApprovals}/1) + 1 TL/Management (${tlOrMgmtApprovals}/1)`;
  } else if (tier === "tier2") {
    requirementsMet =
      teamMemberApprovals >= 1 &&
      teamLeadApprovals >= 1 &&
      managementApprovals >= 1;

    statusMessage = requirementsMet
      ? `✅ Tier 2 requirements met`
      : `❌ Tier 2 requirements not met. Need: 1 Team Member (${teamMemberApprovals}/1) + 1 TL (${teamLeadApprovals}/1) + 1 Management (${managementApprovals}/1)`;
  }

  comment(
    github,
    context,
    requirementsMet,
    statusMessage,
    approvals,
    tier,
    prNumber
  );
  return { requirementsMet, statusMessage };
}

async function comment(
  github,
  context,
  requirementsMet,
  statusMessage,
  approvals,
  tier,
  prNumber
) {
  console.log(`\nStatus: ${statusMessage}`);

  const { teamMemberApprovals, teamLeadApprovals, managementApprovals } =
    approvals;

  const tlOrMgmtApprovals = teamLeadApprovals + managementApprovals;

  console.log(`teamMemberApprovals: ${teamMemberApprovals}`);
  console.log(`teamLeadApprovals: ${teamLeadApprovals}`);
  console.log(`managementApprovals: ${managementApprovals}`);

  // not sure what impact this is bringing
  // Create or update status check
  const state = requirementsMet ? "success" : "failure";

  console.log(`\n=== DEBUGGING COMMENT FUNCTION ===`);
  console.log(`PR Number: ${prNumber} (type: ${typeof prNumber})`);
  console.log(`Repository: ${context.repo.owner}/${context.repo.repo}`);

  // Add a comment explaining the requirements if not met
  if (!requirementsMet) {
    const existingComments = await github.rest.issues.listComments({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: prNumber,
    });

    const botComment = existingComments.data.find(
      (comment) =>
        comment.user.login === "github-actions[bot]" &&
        comment.body.includes("Tier-based Approval Status")
    );

    const commentBody = `## Tier-based Approval Status
                
    **PR Tier:** ${tier.toUpperCase()}

    **Current Status:** ${requirementsMet ? "✅ APPROVED" : "❌ PENDING"}

    **Requirements:**
    ${
      tier === "tier1"
        ? `- 1 Team Member approval ${
            teamMemberApprovals >= 1 ? "✅" : "❌"
          } (${teamMemberApprovals}/1)
    - 1 Team Lead OR Management approval ${
      tlOrMgmtApprovals >= 1 ? "✅" : "❌"
    } (${teamLeadApprovals + managementApprovals}/1)`
        : `- 1 Team Member approval ${
            teamMemberApprovals >= 1 ? "✅" : "❌"
          } (${teamMemberApprovals}/1)
    - 1 Team Lead approval ${
      teamLeadApprovals >= 1 ? "✅" : "❌"
    } (${teamLeadApprovals}/1)
    - 1 Management approval ${
      managementApprovals >= 1 ? "✅" : "❌"
    } (${managementApprovals}/1)`
    }

    ---
    *This comment is automatically updated when reviews change.*`;

    console.log(`${commentBody}`);
    console.log(`botComment: ${botComment}`);

    if (botComment) {
      await github.rest.issues.updateComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        comment_id: botComment.id,
        body: commentBody,
      });
    } else {
      await github.rest.issues.createComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: prNumber,
        body: commentBody,
      });
    }
  }
}