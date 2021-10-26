const core = require('@actions/core');
const crypto = require('crypto');
const {context, getOctokit} = require('@actions/github');
const debug = require('debug')('@lando/transfer-issue-action');
const {load} = require('js-yaml');
const {readFileSync} = require('fs');

async function run() {
  try {
    // Assess test mode right away
    if (core.getInput('test')) {
      core.warn(`Test mode enabled. forcing usage of "${core.getInput('test')}" as the label!`);
    }

    //

    // Handle initial critical errors.
    const {issue, repository} = context.payload;
    if (issue === undefined) {
      throw new Error('Action must run with a `on:issues` event');
    }
    if  (repository === undefined) {
      throw new Error('Repository not set');
    }

    // Enable debugging if appropriate
    if (core.getInput('debug')) {
      debug.enable('*');
    }



    // Make sure the router is defined
    // @TODO: probably want to make sure this has at least one key:value pair
    if (core.getInput('router') === undefined) {
      throw new Error('Router must be defined');
    }
    if (core.getInput('token') === undefined) {
      throw new Error('Token must be defined');
    }

    // Get router
    const router = core.getInput('router');
    debug('router is set to %o', router);

    // Exit if there is no router for this label
    if (!router.hasOwnProperty(payload.label.name)) {
      return core.notice(`Applying "${payload.label.name}" does not trigger a transfer to any repo.`);
    }

    // Get auth things
    const token = core.getInput('token', {required: true});
    const octokit = getOctokit(token);

    // Get source things
    const sourceRepo = payload.repository;
    const sourceIssue = payload.issue;
    debug('source repo has data %o', sourceRepo);

    // Grab the destination repo so we can get the node id.
    const targetRepo = await octokit.rest.repos.get({
      owner: sourceRepo.owner.login,
      repo: router[payload.label.name],
    });

    // Our GraphQL Transfer Mutation.
    const transfer = await octokit.graphql(`
      mutation {
          transferIssue(input: {
            clientMutationId: "${crypto.randomBytes(20).toString('hex')}",
            repositoryId: "${targetRepo.data.node_id}",
            issueId: "${sourceIssue.node_id}"
          }) {
            issue {
              number
            }
          }
        }
    `);
    const transferIssueNumber = transfer.transferIssue.issue.number;
    const transferIssueUrl = `https://github.com/${origOwner}/${destRepo}/issues/${transferIssueNumber}`;
    // Sets our output for this transfered issue.
    core.setOutput('transferred_issue_number', transferIssueNumber);
    core.setOutput('transferred_issue_url', transferIssueUrl);
    core.setOutput('transferred_repo', destRepo);


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
