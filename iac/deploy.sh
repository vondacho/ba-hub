#!/usr/bin/env bash
# Roll host/ onto the ba-hub Docker host and restart the stack.
#
# Runs over SSM Send Command, not SSH: there is no key to hold and no inbound
# port to open. The CI deploy job calls this after assuming the deploy role via
# OIDC; you can call it yourself with any AWS identity that has the same
# permissions.
#
#   ./deploy.sh                 # deploy host/ as it stands
#   AWS_REGION=eu-west-1 ./deploy.sh
#
# The host directory is shipped inside the command itself as a base64 tar — a
# few kilobytes, well under the Send Command payload limit, and it means the
# host is brought to exactly what this repository says with no intermediate
# bucket to provision or clean up.
set -euo pipefail

REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-eu-central-1}}"
PROJECT_TAG="${PROJECT_TAG:-ba-hub}"
NAME_TAG="${NAME_TAG:-ba-hub-host}"
REMOTE_DIR="${REMOTE_DIR:-/opt/ba-hub}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

say() { printf '\033[1m==>\033[0m %s\n' "$*"; }
die() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }

[ -f "$HERE/host/docker-compose.yml" ] || die "no host/docker-compose.yml next to this script"

say "Resolving the host"
INSTANCE_ID="$(aws ec2 describe-instances \
  --region "$REGION" \
  --filters "Name=tag:Name,Values=$NAME_TAG" "Name=instance-state-name,Values=running" \
  --query 'Reservations[].Instances[].InstanceId | [0]' \
  --output text)"
[ -n "$INSTANCE_ID" ] && [ "$INSTANCE_ID" != "None" ] || die "no running instance tagged Name=$NAME_TAG in $REGION"

# A host that is running but not registered with SSM cannot be reached, and the
# failure would otherwise surface as an opaque InvalidInstanceId from
# send-command.
aws ssm describe-instance-information \
  --region "$REGION" \
  --filters "Key=InstanceIds,Values=$INSTANCE_ID" \
  --query 'InstanceInformationList[0].PingStatus' \
  --output text | grep -q Online ||
  die "$INSTANCE_ID is not Online in SSM — check the instance profile and that the agent is running"

say "Packing host/"
PAYLOAD="$(tar -C "$HERE/host" -czf - . | base64 | tr -d '\n')"

# The tar carries only what is tracked in host/, so /opt/ba-hub/.env — written
# once by user-data.sh and holding ACME_EMAIL — is never overwritten.
read -r -d '' REMOTE_SCRIPT <<REMOTE || true
set -euxo pipefail
cd $REMOTE_DIR
echo '$PAYLOAD' | base64 -d | tar -xzf - -C $REMOTE_DIR
chown -R ubuntu:ubuntu $REMOTE_DIR
docker compose pull
docker compose up -d --remove-orphans --wait
docker compose ps
# The superseded images are unreferenced once the containers have swapped;
# without this the root volume fills up over a few dozen deploys.
docker image prune -f
REMOTE

say "Sending to $INSTANCE_ID"
COMMAND_ID="$(aws ssm send-command \
  --region "$REGION" \
  --instance-ids "$INSTANCE_ID" \
  --document-name AWS-RunShellScript \
  --comment "ba-hub deploy" \
  --timeout-seconds 600 \
  --parameters "$(jq -n --arg s "$REMOTE_SCRIPT" '{commands: [$s], executionTimeout: ["600"]}')" \
  --query 'Command.CommandId' \
  --output text)"

say "Waiting for $COMMAND_ID"
# `command-executed` polls to a terminal state but exits non-zero on failure
# before we can show the output, so swallow it and read the status ourselves.
aws ssm wait command-executed \
  --region "$REGION" \
  --command-id "$COMMAND_ID" \
  --instance-id "$INSTANCE_ID" >/dev/null 2>&1 || true

RESULT="$(aws ssm get-command-invocation \
  --region "$REGION" \
  --command-id "$COMMAND_ID" \
  --instance-id "$INSTANCE_ID" \
  --output json)"

printf '%s' "$RESULT" | jq -r '.StandardOutputContent'
STATUS="$(printf '%s' "$RESULT" | jq -r '.Status')"

if [ "$STATUS" != "Success" ]; then
  printf '%s' "$RESULT" | jq -r '.StandardErrorContent' >&2
  die "deploy finished with status $STATUS"
fi

say "Deployed"
