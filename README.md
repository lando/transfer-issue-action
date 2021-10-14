# Transfer Issue GitHub Action

A GitHub Action for transferring issues between github repos.  It also has the ability to do the following:

* Optionally create a stub issue in the original issue that is closed and locked.  This allows for a better user experience when search for issues in the old repo.  The stub message will have the following message attached to it as well:
  ```
  @issue-author this is a stub issue that has been created as a placeholder in this repo.

  Your original issue has been moved to link-to-transferred-repo-issue
  ```
* Optionally create labels from a file and add the labels the transferred issue.
* Optionally map the triggered label to a file of keyed repos to send the issue to.

## Inputs

Input | Description | Required | Default |
----------|-------------|:----------:|:-------:|
| `destination_repo` | The destination repo. | yes* |-|
| `github_token` | The GitHub token used to create an authenticated client. | no | `${{github.token}}` |
| `create_stub` | Create a stub issue with title and description in original repo. | no | `true` |
| `labels_file_path` | Create labels if it doesn't exist in the transferred repo and tag the transferred issue. | no |-|
| `map_repo_labels_file_path` | Maps the triggering label to a file keyed `label:destination_repo`. If the label is found, it will transfer the issue to that repo. If not, it will exit the process and not tranfer any issue. | yes* |-|

_Note: You must have either `destination_repo` or `map_repo_labels_file_path` set in your action.  If not, it will throw an error._

## Outputs

Output | Type | Description |
----------|-------------|:----------:|
| `transferred_issue_number` | String | The issue number of the transferred issue |
| `transferred_issue_url` | String | The issue url of the transferred issue |
| `transferred_repo` | String | The name of the destination repo |

## Basic Example

This will send the issue in a `lando` org repo to `lando/transfer-repo` 

```
- name: Transfer Issue & Create Stub
  uses: lando/transfer-issue-action@1.0.0
  with:
    destination_repo: 'transfer-repo'
```

## Labels Example

Set a file path for the labels yaml file to create labels and tag them on the issues.

```
- name: Transfer Issue & Create Stub
  uses: lando/transfer-issue-action@1.2.0
  with:
    destination_repo: 'transfer-repo'
    labels_file_path: '.github/transfer-issue-labels.yml'
```

### Labels YAML File Example

The labels yaml is keyed as name to hex color.  

```
'Needs Triage': 'FF0000'
'Test Label': '000000'
```

## Map Repo Labels Example

This will use our yml file to check tags to dtermine which repos to send them to.  Useful if you have a more complex use case.

```
- name: Transfer Issue & Create Stub
  uses: lando/transfer-issue-action@1.2.0
  with:
    map_repo_labels_file_path: '.github/transfer-issue-map-repo-labels.yml'
```

### Map Repo Labels YAML File Example

This will send all issues tagged `bug` to the repo `lando/transfer-repo` if used within the `lando` org.  It will do the same for issues tagged `trill` and send them to the `lando/tronic` repo. 

```
bug: transfer-repo
trill: tronic
```

## Advanced Example

This will use our yml file to check tags to dtermine which repos to send them to.  Useful if you have a more complex use case.

```
- name: Transfer Issue & Create Stub
  uses: lando/transfer-issue-action@1.2.0
  id: transfer-issue
  with:
    create_stub: false
    labels_file_path: '.github/transfer-issue-labels.yml'
    map_repo_labels_file_path: '.github/transfer-issue-map-repo-labels.yml'
- name: Update Transferred Issue
  uses: actions/github-script@v5
  if: steps.transfer-issue.outputs.transferred_issue_number != ''
  script: |
    let transferredId = steps.transfer-issue.outputs.transferred_issue_number;
    await github.rest.issues.createComment({
      issue_number: transferredId,
      owner: context.repo.owner,
      repo: context.repo.repo,
      body: body
    });

```

## Notes

GraphQL Mutations for transferring a repo only allows you to tranfer repos within the same owner/org.  