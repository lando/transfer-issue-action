const core = require('@actions/core');
const crypto = require('crypto');
const {context, getOctokit} = require('@actions/github');
const {load} = require('js-yaml');
const {readFileSync} = require('fs');

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

    // Make sure we have one of our repo based keys set.
    let destRepo = core.getInput('destination_repo');
    const mapRepoPath = core.getInput('map_repo_labels_file_path');
    if ((destRepo === undefined || destRepo === '') && (mapRepoPath === undefined || mapRepoPath === '')) {
      throw new Error('You must set either destination_repo or map_repo_labels_file_path');
    }
    if (destRepo !== '' && mapRepoPath !== '') {
      throw new Error('You can\'t set both destination_repo and map_repo_labels_file_path, only chose one');
    }

    // Check to see if we are using the label mapping functionality.
    if (destRepo === '' && mapRepoPath !== undefined && mapRepoPath !== '') {
      const repo_labels = load(readFileSync(mapRepoPath, 'utf8'));
      console.log(repo_labels);
      let dest_repo_check = '';
      for (const [label_check, destination] of Object.entries(repo_labels)) {
        if (payload.label.name == label_check) {
          dest_repo_check = destination;
          break;
        }
      }

      // Leave early because no label was found matching.
      if (dest_repo_check === '') {
        return core.notice('No Label Matched, Exiting');
      }

      // Set the destination repo and continue on.
      destRepo = dest_repo_check;
    }


    const token = core.getInput('github_token', {required: true});
    const octokit = getOctokit(token);
    const origOwner = payload.repository.owner.login;
    const origRepo = payload.repository.name;
    const issueNodeId = payload.issue.node_id;
    const createStub = core.getInput('create_stub').toLowerCase() === 'true';
    const labelsPath = core.getInput('labels_file_path');

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

    // Handle the labels.
    if (labelsPath !== undefined && labelsPath !== '') {
      const labelz_yaml = load(readFileSync(labelsPath, 'utf8'));
      const labels = await octokit.rest.issues.listLabelsForRepo({
        owner: origOwner,
        repo: destRepo,
      });

      // Create the lables as need be.
      let final_labels = [];
      for (const [name, color] of Object.entries(labelz_yaml)) {
        final_labels.push(name);
        if (labels.data.filter(e => e.name === name).length <= 0) {
          await octokit.rest.issues.createLabel({
            owner: origOwner,
            repo: destRepo,
            name: name,
            color: color,
          });
        }
      }

      // And apply the labels.
      await octokit.rest.issues.update({
        issue_number: transferIssueNumber,
        owner: origOwner,
        repo: destRepo,
        labels: final_labels
      });
    }

  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
