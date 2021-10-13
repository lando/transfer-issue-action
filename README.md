# Transfer Issue GitHub Action

A GitHub Action for transferring issues between github repos with the ability to create a stub issue in the original repo.

The stub issue will be created in the original repo as closed and locked with the message:

```
@issue-author this is a stub issue that has been created as a placeholder in this repo.

Your original issue has been moved to link-to-transferred-repo-issue
```

You can also create labels from a file and add the labels the transferred issue.  

## Inputs

Input | Description | Required | Default |
----------|-------------|:----------:|:-------:|
| `destination_repo` | The destination repo | yes |-|
| `github_token` | The GitHub token used to create an authenticated client | no | `${{github.token}}` |
| `create_stub` | Create a stub issue with title and description in original repo | no | `true` |
| `labels_file_path` | Create labels if it doesn't exist in the transferred repo and tag the transferred issue. | no |-|

## Outputs

Output | Type | Description |
----------|-------------|:----------:|
| `transferred_issue_number` | String | The issue number of the transferred issue |
| `transferred_issue_url` | String | The issue url of the transferred issue |


## Basic Example

This will send the issue in a `lando` org repo to `lando/transfer-repo` 

```
- name: Transfer Issue & Create Stub
  uses: lando/transfer-issue-action@1.0.0
  with:
    destination_repo: 'transfer-repo'
```

## Label Example

Set a file path for the labels yaml file to create labels and tag them on the issues.

```
- name: Transfer Issue & Create Stub
  uses: lando/transfer-issue-action@1.0.0
  with:
    destination_repo: 'transfer-repo'
    labels_file_path: '.github/transfer-issue-labels.yml'
```

### Label YAML File Example

The labels yaml is keyed as machine name to hex color.  

```
labels:
  needs-triage: 'FF0000'
  test-label: '000000'
```

## Notes

GraphQL Mutations for transferring a repo only allows you to tranfer repos within the same owner/org.  