# Transfer Issue GitHub Action

A GitHub Action for transferring issues between GitHub repos _within the same organization_ when they are labeled in a certain way.

It also has the ability to do the following:

* Create a stub issue in the original issue that is closed and locked.  This allows for a better user experience when searching for issues in the old repo.  The stub issue will look _like_ the below but with details relevant to _your_ issue.

  ```
  @lando this is a stub issue that has been created as a placeholder in this repo.

  Your original issue has been moved to [https://github.com/lando/transfer-issue-action/issues/53](https://github.com/lando/transfer-issue-action/issues/53)
  ```

* Apply labels to the transffered issue.

## Events

This action was designed particularly for the below event but may work for other issue related events as well. YMMV.

```yaml
on:
  issues:
    types:
      - labeled
```

## Inputs

Input | Description | Required | Default |
----------|-------------|:----------:|:-------:|
| `token` | A GitHub [Personal Access Token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token) created with repo access | yes | - |
| `router` | A label to repo routing in the form "LABEL:REPO" | yes* |-|
| `apply_label` | A label to apply on the new issue in the format "LABEL:HEXCODE" | yes* |-|
| `create_stub` | Create a stub issue with title and description in original repo | no | `false` |
| `debug` | Enable debug output | no | `false` |

### Input Notes

* The `GITHUB_TOKEN` secret provided by GitHub Actions will not work when transferring issues to another repo.  You will get the error `Resource not accessible by integration` if you try and use it.  Create a [Personal Access Token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token) with the repo check box and all its sub items checked.

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

* Requires [Node 14+](https://nodejs.org/dist/latest-v14.x/)
* Prefers [Yarn](https://classic.yarnpkg.com/lang/en/docs/install)

```bash
git clone https://github.com/lando/transfer-issue-action.git && cd transfer-issue-action
yarn install
```

If you dont' want to install Node 14 or Yarn for whatever reason you can install [Lando](https://docs.lando.dev/basics/installation.html) and use that:

```bash
git clone https://github.com/lando/transfer-issue-action.git && cd transfer-issue-action
# Install deps and get node
lando start

# Run commands
lando node
lando yarn
```

## Testing

```bash
# Lint the code
yarn lint
```

You can also open up a PR to test the action out.

Additionally you can manually create an issue in this repo and label it with either `manual_issue_transfer_action_test` or `holla-tronic` to test the action.

Note that in both the PR and manual testing scenarios we will:

* Close the transferred issue _and_ stubbed issue if applicable for cleanliness purposes. Therefore you will want to look in the closed issues for evidence of the transfer.
* Transfer the issue to the same repo as the one generating it eg from `lando/transfer-issue-action` to `lando/transfer-issue-action`. You can see that the transfer has happened by inspecting the transferred issue and noting the `lando-droid transferred this issue from lando/transfer-issue-action...` entry.

## Releasing

```bash
yarn release
```

## Contributors

<a href="https://github.com/lando/transfer-issue-action/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=lando/transfer-issue-action" />
</a>

Made with [contributors-img](https://contrib.rocks).

## Other Resources

* [Important advice](https://www.youtube.com/watch?v=WA4iX5D9Z64)
