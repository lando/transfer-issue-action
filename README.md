# Transfer Issue GitHub Action

A GitHub Action for transferring issues between GitHub repos _within the same organization_ when they are labeled in a certain way.

It also has the ability to do the following:

* Create a stub issue in the original issue that is closed and locked.  This allows for a better user experience when searching for issues in the old repo.  The stub issue will look _like_ the below but with details relevant to _your_ issue.

  ```
  @lando this is a stub issue that has been created as a placeholder in this repo.

  Your original issue has been moved to [https://github.com/lando/transfer-issue-action/issues/53](https://github.com/lando/transfer-issue-action/issues/53)
  ```

* Apply labels to the transffered issue.
* Create labels in the destination repository if they are missing.

## Events

This action was designed particularly for the below event but may work for other issue related events as well. YMMV.

```yaml
on:
  issues:
    types:
      - labeled
```

## Transferring from Private to Public repositories

Transferring issues from private to public repositories is not supported by GitHub by default ([see related post here](https://github.com/orgs/community/discussions/21979#discussioncomment-4800558)).

Nevertheless the community has found a way to go around that limitation, process that can be entirely automated.

When `allow_private_public_transfer` is enabled, and if a request is made to transfer to an issue from a private repository to a public one, a temporary private repository will be automatically created, the issue will be transferred to that repository which will then be made public. Finally after the transfer, the repository will be deleted.

This manipulation requires your Personal API Token to have the `delete_repo` scope. 

The name of that temporary repository is composed of a stringified date to which a random 5 characters string is appended. 

This option is disabled by default.

## Route to any repository based on the label

This action can be used to route an issue to a pre-set repository, but also, if enabled, to any repository of the organization.

By enabling `enable_custom_label_routing`, users can transfer their issue to any repository by attaching a label such as `transfer:my-other-repo`. 

This option is to be used in conjunction with the `router` option, by the repository part of the router empty.

When `router` is set to `transfer:` and if the user creates a label such as `transfer:my-other-repo`, the issue will be automatically transferred to the `my-other-repo` repository.

This option is disabled by default.

## Inputs

Input | Description | Required | Default |
----------|-------------|:----------:|:-------:|
| `token` | A GitHub [Personal Access Token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token) created with repo access | yes | - |
| `router` | A label to repo routing in the form "LABEL:REPO" | yes* |-|
| `apply_label` | A label to apply on the new issue in the format "LABEL:HEXCODE" | yes* |-|
| `create_stub` | Create a stub issue with title and description in original repo | no | `false` |
| `debug` | Enable debug output | no | `false` |
| `allow_private_public_transfer` | Allow issues to be transferred from private to public repositories. | no | `false` |
| `enable_custom_label_routing` | Make it possible to route labels to any repository of the organization by providing the repository name in the label name | no | `false` |
| `create_labels_if_missing` | Create labels in the destination repository if missing | no | `false` |
| `debug` | Enable debug output | no | `false` |

### Input Notes

* The `GITHUB_TOKEN` secret provided by GitHub Actions will not work when transferring issues to another repo.  You will get the error `Resource not accessible by integration` if you try and use it.  Create a [Personal Access Token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token) with the `repo` check box and all its sub items checked.

## Outputs

Output | Type | Description |
----------|-------------|------------|
| `destination_repo` | String | The name of the repo the issue was transferred to |
| `new_issue_number` | String | The number of the new issue |
| `new_issue_url` | String | The url of the new issue |
| `stub_issue_number` | String | The number of the created issue stub |

## Basic Example

When an issue in the repo which implements this action is tagged with `holla` it gets transferred to within the same organization to a repo called `atcha`.

```yaml
- name: Transfer Issue & Create Stub
  uses: lando/transfer-issue-action@v2
  with:
    token: ${{ secrets.TRANSFER_ISSUE_TOKEN }}
    router: holla:atcha
```

## Labels Example

Does the same as above but when the new issue is created it applies the `Needs Triage` label and also creates a stub in the source repo.

```yaml
- name: Transfer Issue & Create Stub
  uses: lando/transfer-issue-action@v2
  with:
    token: ${{ secrets.TRANSFER_ISSUE_TOKEN }}
    router: holla:atcha
    apply_label: "Needs Triage:FF0000"
    create_stub: true
```

## Advanced Example

In this example, we are forgoing a stub and instead adding a comment to the tranferred issue via [https://github.com/actions/github-script](https://github.com/actions/github-script). Also note the use of `strategy.matrix.router` which allows us to route different labels to different repos.

`strategy.matrix`
```yaml
strategy:
  matrix:
    router:
      - holla:lando
      - things:cli
```

`steps`
```yaml
- name: Transfer Issue & Comment
  uses: lando/transfer-issue-action@v2
  id: transfer-issue
  with:
    token: ${{ secrets.TRANSFER_ISSUE_TOKEN }}
    router: ${{ matrix.router }}
- name: Update Transferred Issue
  uses: actions/github-script@v5
  if: steps.transfer-issue.outputs.new_issue_number != ''
  with:
    script: |
      await github.rest.issues.createComment({
        issue_number: `${{ steps.transfer-issue.outputs.new_issue_number}}`,
        owner: context.repo.owner,
        repo: `${{ steps.transfer-issue.outputs.destinatiom_repo }}`,
        body: `@${ context.payload.issue.user.login } your issue is over here now!`
      });
```

## Notes

GraphQL Mutations for transferring a repo only allows you to tranfer repos within the same owner/org.

## Changelog

We try to log all changes big and small in both [THE CHANGELOG](https://github.com/lando/transfer-issue-action/blob/main/CHANGELOG.md) and the [release notes](https://github.com/lando/transfer-issue-action/releases).

## Development

* Requires [Node 18+](https://nodejs.org/dist/latest-v14.x/)

```bash
git clone https://github.com/lando/transfer-issue-action.git && cd transfer-issue-action
npm install
```

If you dont' want to install Node 18+ for whatever reason you can install [Lando](https://docs.lando.dev/basics/installation.html) and use that:

```bash
git clone https://github.com/lando/transfer-issue-action.git && cd transfer-issue-action
# Install deps and get node
lando start

# Run commands
lando node
lando npm
```

## Testing

```bash
# Lint the code
npm run lint
```

You can also open up a PR to test the action out.

Additionally you can manually create an issue in this repo and label it with either `manual_issue_transfer_action_test` or `holla-tronic` to test the action.

Note that in both the PR and manual testing scenarios we will:

* Close the transferred issue _and_ stubbed issue if applicable for cleanliness purposes. Therefore you will want to look in the closed issues for evidence of the transfer.
* Transfer the issue to the same repo as the one generating it eg from `lando/transfer-issue-action` to `lando/transfer-issue-action`. You can see that the transfer has happened by inspecting the transferred issue and noting the `lando-droid transferred this issue from lando/transfer-issue-action...` entry.

## Releasing

Create a release and publish to [GitHub Actions Marketplace](https://docs.github.com/en/enterprise-cloud@latest/actions/creating-actions/publishing-actions-in-github-marketplace). Note that the release tag must be a [semantic version](https://semver.org/).

## Maintainers

* [@pirog](https://github.com/pirog)
* [@reynoldsalec](https://github.com/reynoldsalec)

## Contributors

<a href="https://github.com/lando/transfer-issue-action/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=lando/transfer-issue-action" />
</a>

Made with [contributors-img](https://contrib.rocks).

## Other Resources

* [Important advice](https://www.youtube.com/watch?v=WA4iX5D9Z64)
