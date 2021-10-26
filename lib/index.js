const core = require('@actions/core');
const crypto = require('crypto');
const {context, getOctokit} = require('@actions/github');
const debug = require('debug')('@lando/transfer-issue-action');

async function run() {
  try {
    // Enable debugging if appropriate
    if (core.getInput('debug')) {
      require('debug').enable('*');
    }

    // Asses test mode right away
    const testIssueId = core.getInput('test').split(':')[0];
    const testLabelName = core.getInput('test').split(':')[1];

    // Assess test mode right away
    if (testIssueId && testLabelName) {
      core.warning(`Test mode enabled. Forcing usage with issue:label ${core.getInput('test')}`);
    }

    // Get relevant things
    const router = core.getInput('router', {required: true});
    const sourceRepo = context.payload.repository;
    const sourceIssue = context.payload.issue || {node_id: testIssueId, user: {login: sourceRepo.owner.login}};
    const sourceLabel = context.payload.label || {name: testLabelName};
    const token = core.getInput('token', {required: true});

    // Throw errors if we cannot continue
    if (sourceIssue === undefined) {
      throw new Error('Action must run on an event that has an issue context!');
    }
    if (sourceRepo === undefined) {
      throw new Error('Action must run on event that has a repository context!');
    }
    if (sourceLabel === undefined) {
      throw new Error('Action must run on event that has a label context!');
    }
    // @NOTE: both of these inputs are "required" in action.yml so do we even need
    // to do the below?
    if (router === undefined) {
      throw new Error('`router` input must be defined');
    }
    if (token === undefined) {
      throw new Error('`token` input must be defined');
    }

    // Loggin
    debug('source issue is %O', sourceIssue);
    debug('source repository is %O', sourceRepo);
    debug('label trigger is %O', sourceLabel);
    debug('router is set to %O', router);

    // Summon the octocat
    const octokit = getOctokit(token);
    // Split router up into relevant pieces
    // @NOTE: this is not documented but if there is no splitter then the string will
    // be interpretted as the destination repo
    const parts = router.split(':');
    const targetRepoName = parts[1] || parts[0];
    const triggerLabel = parts[0];
    debug('will transfer issue to %s if %s matches %s', targetRepoName, triggerLabel, sourceLabel.name);

    // If trigger label doesnt match the issue label then bail
    if (triggerLabel && triggerLabel !== sourceLabel.name) {
      return core.notice(`Issue not transferred because "${sourceLabel.name}" != "${triggerLabel}"!`);
    }

    // Ensure target repo actually exists and we can access it
    try {
      await octokit.rest.repos.get({
        owner: sourceRepo.owner.login,
        repo: targetRepoName,
      });
    } catch (error) {
      debug('error getting %s with %O', targetRepoName, error);
      core.setFailed(`Could not access ${targetRepoName}: ${error.message}`);
    }

    // If we get here then its go time
    const targetRepo = await octokit.rest.repos.get({
      owner: sourceRepo.owner.login,
      repo: targetRepoName,
    });
    debug('retrieved target repo metadata %O', targetRepo.data);

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
    const newIssueNumber = transfer.transferIssue.issue.number;
    const newIssueUrl = `https://github.com/${sourceRepo.owner.login}/${targetRepoName}/issues/${newIssueNumber}`;

    // Sets our output for this transfered issue.
    core.setOutput('new_issue_number', newIssueNumber);
    core.setOutput('new_issue_url', newIssueUrl);
    core.setOutput('destination_repo', targetRepoName);
    debug('transferred %s:%s to target %s:%s', sourceRepo.name, sourceIssue.node_id, targetRepoName, newIssueNumber);

    // Begin option stub creation
    if (core.getInput('create_stub')) {
      debug('creating issue stub');
      // Create issue stub
      const stubIssue = await octokit.rest.issues.create({
        owner: sourceRepo.owner.login,
        repo: sourceRepo.name,
        title: sourceIssue.title || 'Issue Stub Test',
        body: sourceIssue.body || 'This is an automatically generated issue stub created for testing purposes.'
      });
      debug('stub issue created with issue number %s', stubIssue.data.number);

      // Comment on it
      await octokit.rest.issues.createComment({
        issue_number: stubIssue.data.number,
        owner: sourceRepo.owner.login,
        repo: sourceRepo.name,
        body: `@${sourceIssue.user.login} this is a stub issue that has been created as a placeholder in this repo.`
        + "\n\n" + `Your original issue has been moved to [${newIssueUrl}](${newIssueUrl})`
      });
      debug('stub issue comment created');

      // Close it
      await octokit.rest.issues.update({
        issue_number: stubIssue.data.number,
        owner: sourceRepo.owner.login,
        repo: sourceRepo.name,
        state: 'closed'
      });
      debug('stub issue closed');

      // Lock it
      await octokit.rest.issues.lock({
        issue_number: stubIssue.data.number,
        owner: sourceRepo.owner.login,
        repo: sourceRepo.name,
        lock_reason: 'off-topic'
      });
      debug('stub issue locked');

      // Also add the issue stub number to the output
      core.setOutput('stub_issue_number', stubIssue.data.number);
    }

    // Handle the labels.
    if (core.getInput('apply_label')) {
      const label = core.getInput('apply_label').split(':')[0];
      const color = core.getInput('apply_label').split(':')[1] || 'e327ae';
      debug('apply label "%s" to %s with color %s', label, newIssueUrl, color);

      // Get current labels
      const labels = await octokit.rest.issues.listLabelsForRepo({ owner: sourceRepo.owner.login, repo: targetRepoName});
      debug('repo %s has labels %O', targetRepoName, labels.data);

      // Create the label if needed
      if (labels.data.filter(e => e.name === label).length <= 0) {
        await octokit.rest.issues.createLabel({
          owner: sourceRepo.owner.login,
          repo: targetRepoName,
          name: label,
          color: color,
        });
        debug('created new label %s in repo %s', label, targetRepoName);
      }

      // And apply the labels.
      await octokit.rest.issues.update({
        issue_number: newIssueNumber,
        owner: sourceRepo.owner.login,
        repo: targetRepoName,
        labels: [label]
      });
    }
  } catch (error) {
    core.setFailed(error);
  }
}

run();
