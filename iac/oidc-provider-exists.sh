#!/usr/bin/env bash
# Terraform external data source: does this AWS account already hold an OpenID
# Connect provider for GitHub Actions?
#
# AWS allows exactly one provider per issuer URL, account-wide, and every hub in
# this family (ba-hub, dev-hub, doc-hub) trusts the same issuer. So at most one
# of them may create it — and learning that from EntityAlreadyExists halfway
# through an apply leaves a half-built stack behind: the security group, the
# instance and both roles are created before IAM refuses the provider.
#
# oidc.tf turns the answer into a plan-time precondition, so the disagreement is
# caught before anything is created.
#
# Protocol: a JSON object on stdin, a flat JSON object of strings on stdout.
# A non-zero exit, or anything else on stdout, becomes a Terraform error.
set -euo pipefail

ISSUER="token.actions.githubusercontent.com"

for tool in aws jq; do
  command -v "$tool" >/dev/null ||
    { echo "iac/oidc-provider-exists.sh needs $tool on PATH" >&2; exit 1; }
done

QUERY="$(cat)"
REGION="$(jq -r '.region // ""' <<<"$QUERY")"
PROFILE="$(jq -r '.profile // ""' <<<"$QUERY")"

# IAM is global, but the CLI still wants a region to build an endpoint, and the
# profile is what the provider was told to authenticate with — ask AWS the same
# question Terraform is about to.
ARGS=(iam list-open-id-connect-providers --output json)
if [ -n "$REGION" ]; then ARGS+=(--region "$REGION"); fi
if [ -n "$PROFILE" ]; then ARGS+=(--profile "$PROFILE"); fi

if ! LIST="$(aws "${ARGS[@]}" 2>&1)"; then
  {
    echo "could not list the account's OIDC providers:"
    echo "$LIST"
    echo
    echo "This runs with the same credentials as the AWS provider. Check"
    echo "aws sts get-caller-identity${PROFILE:+ --profile $PROFILE}."
  } >&2
  exit 1
fi

# The ARN ends in the issuer host, so an exact suffix match cannot be fooled by
# a provider for some other issuer that merely mentions GitHub.
ARN="$(jq -r --arg suffix "oidc-provider/$ISSUER" \
  'first(.OpenIDConnectProviderList[].Arn | select(endswith($suffix))) // ""' <<<"$LIST")"

if [ -z "$ARN" ]; then
  jq -n '{exists: "false", arn: "", project: ""}'
  exit 0
fi

# Whose is it? "One already exists" is not by itself a problem — the stack that
# created it sees its own provider on every subsequent plan, and must not be
# told to stop managing it. The Project tag comes from the provider block's
# default_tags, so it names the stack that owns it.
GET_ARGS=(iam get-open-id-connect-provider --open-id-connect-provider-arn "$ARN" --output json)
if [ -n "$REGION" ]; then GET_ARGS+=(--region "$REGION"); fi
if [ -n "$PROFILE" ]; then GET_ARGS+=(--profile "$PROFILE"); fi

if ! TAGS="$(aws "${GET_ARGS[@]}" 2>&1)"; then
  {
    echo "could not read the tags of $ARN:"
    echo "$TAGS"
    echo
    echo "This check needs iam:GetOpenIDConnectProvider to tell an existing"
    echo "provider this stack owns from one another stack owns."
  } >&2
  exit 1
fi

PROJECT="$(jq -r 'first(.Tags[]? | select(.Key == "Project") | .Value) // ""' <<<"$TAGS")"

jq -n --arg arn "$ARN" --arg project "$PROJECT" \
  '{exists: "true", arn: $arn, project: $project}'
