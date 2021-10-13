const core = require('@actions/core');
const crypto = require('crypto');
const {context, getOctokit} = require('@actions/github');

async function run() {
  try {
    // Handle initial critical errors.
    const payload = context.payload;
    if (payload.issue === undefined) {
      throw new Error('Action not used in Issue Based Event');
    }
    if (payload.repository === undefined) {
      throw new Error('Repository not set');
    }
    const token = core.getInput('github_token', {required: true});
    const octokit = getOctokit(token);
    const origOwner = payload.repository.owner.login;
    const origRepo = payload.repository.name;
    const issueNodeId = payload.issue.node_id;
    const destRepo = core.getInput('destination_repo', {required: true});
    const createStub = core.getInput('create_stub').toLowerCase() === 'true';

    // Creates our stub issue.
    let stubIssue;
    if (createStub) {
      stubIssue = await octokit.rest.issues.create({
        owner: origOwner,
        repo: origRepo,
        title: payload.issue.title,
        body: payload.issue.body,
      });
    }

    // Grab the destination repo so we can get the node id.
    const destRepoObject = await octokit.rest.repos.get({
      owner: origOwner,
      repo: destRepo,
    });
    const destRepoNodeId = destRepoObject.data.node_id;

    // Our GraphQL Transfer Mutation.
    const mutationId = crypto.randomBytes(20).toString('hex');
    const query = ` 
      mutation {
          transferIssue(input: {
            clientMutationId: "${mutationId}",
            repositoryId: "${destRepoNodeId}",
            issueId: "${issueNodeId}"
          }) {
            issue {
              number
            }
          }
        }
    `;
    const transfer = await octokit.graphql(query);
    // @ts-ignore
    const transferIssueNumber = transfer.transferIssue.issue.number;
    const transferIssueUrl = `https://github.com/${origOwner}/${destRepo}/issues/${transferIssueNumber}`;
    // Sets our output for this transfered issue.
    core.setOutput('transferred_issue_number', transferIssueNumber);
    core.setOutput('transferred_issue_url', transferIssueUrl);

    // Handle the stub comments.
    if (createStub && stubIssue !== undefined) {
      const body = `@${payload.issue.user.login} this is a stub issue that has been created as a placeholder in this repo.`
      + "\n\n" + `Your original issue has been moved to [${transferIssueUrl}](${transferIssueUrl})`;

      await octokit.rest.issues.createComment({
        issue_number: stubIssue.data.number,
        owner: context.repo.owner,
        repo: context.repo.repo,
        body: body
      });
      await octokit.rest.issues.update({
        issue_number: stubIssue.data.number,
        owner: context.repo.owner,
        repo: context.repo.repo,
        state: 'closed'
      });
      await octokit.rest.issues.lock({
        issue_number: stubIssue.data.number,
        owner: context.repo.owner,
        repo: context.repo.repo,
        lock_reason: 'off-topic'
      });
    }

  } catch (error) {
    core.setOutput("status", error.status);
    core.setFailed(error.message);
  }
}

run();
