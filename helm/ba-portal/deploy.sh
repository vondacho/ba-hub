#!/usr/bin/env bash
#
# Build, install and verify ba-portal on a local cluster.
#
#   ./helm/ba-portal/deploy.sh              # build, upgrade, restart, test
#   ./helm/ba-portal/deploy.sh --no-build   # skip the image build
#   ./helm/ba-portal/deploy.sh --no-test    # skip helm test
#
# Environment overrides:
#   NAMESPACE  (default ba-hub)
#   RELEASE    (default ba-portal)
#   IMAGE_TAG  (default dev — must match image.tag in values-local.yaml)
#
# The three steps are not interchangeable and none is optional:
#
#   1. build    values-local.yaml pins pullPolicy: Never, so the image has to
#               exist in the store the kubelet reads. There is nothing to pull.
#   2. upgrade  reconciles the release.
#   3. restart  the rendered Deployment is byte-identical after a rebuild under
#               the same tag, so Kubernetes sees no change and leaves the old
#               pods running — while helm still reports STATUS: deployed. The
#               checksum/config annotation covers ConfigMap changes only; it
#               does nothing for an image rebuilt under a fixed tag.

set -euo pipefail

NAMESPACE="${NAMESPACE:-ba-hub}"
RELEASE="${RELEASE:-ba-portal}"
IMAGE_TAG="${IMAGE_TAG:-dev}"

# Resolve paths from this script rather than the caller's cwd, so it runs from
# anywhere in the repo.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHART_DIR="$SCRIPT_DIR"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SOURCE_DIR="$REPO_ROOT/ba-portal"

BUILD=true
TEST=true
for arg in "$@"; do
  case "$arg" in
    --no-build) BUILD=false ;;
    --no-test)  TEST=false ;;
    -h|--help)  sed -n '2,26p' "${BASH_SOURCE[0]}" | sed 's/^#//'; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

# Rancher Desktop puts helm, kubectl, docker and nerdctl here and does not
# always add it to a non-login shell's PATH.
export PATH="$HOME/.rd/bin:$PATH"

for tool in helm kubectl; do
  command -v "$tool" >/dev/null || { echo "$tool not found on PATH" >&2; exit 1; }
done

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

if [ "$BUILD" = true ]; then
  # nerdctl build fails with "no buildkit host is available" when Rancher
  # Desktop runs moby, and `docker build` cannot reach the k8s.io containerd
  # namespace when it runs containerd. Pick from the configured engine rather
  # than guessing.
  ENGINE_CONF="$HOME/Library/Preferences/rancher-desktop/settings.json"
  if [ -f "$ENGINE_CONF" ] && grep -q '"name":"containerd"' "$ENGINE_CONF"; then
    BUILD_CMD=(nerdctl --namespace k8s.io build)
  else
    BUILD_CMD=(docker build)
  fi

  command -v "${BUILD_CMD[0]}" >/dev/null || {
    echo "${BUILD_CMD[0]} not found on PATH" >&2; exit 1;
  }

  step "Building ${RELEASE}:${IMAGE_TAG} with ${BUILD_CMD[0]}"
  "${BUILD_CMD[@]}" -t "${RELEASE}:${IMAGE_TAG}" "$SOURCE_DIR"
fi

step "Installing release '$RELEASE' into namespace '$NAMESPACE'"
helm upgrade --install "$RELEASE" "$CHART_DIR" \
  --namespace "$NAMESPACE" --create-namespace \
  -f "$CHART_DIR/values-local.yaml"

if [ "$BUILD" = true ]; then
  step "Rolling the pods onto the rebuilt image"
  kubectl rollout restart "deployment/$RELEASE" -n "$NAMESPACE"
fi

step "Waiting for the rollout"
kubectl rollout status "deployment/$RELEASE" -n "$NAMESPACE" --timeout=300s

# Print the DELETING column rather than filtering on status.phase: a
# terminating pod still reports Running, so for a few seconds it can be
# items[0] and report the *old* image digest.
step "Pods"
kubectl get pods -n "$NAMESPACE" -l "app.kubernetes.io/name=$RELEASE" \
  -o custom-columns='NAME:.metadata.name,DELETING:.metadata.deletionTimestamp,IMAGEID:.status.containerStatuses[0].imageID'

if [ "$TEST" = true ]; then
  step "Running helm test"
  helm test "$RELEASE" --namespace "$NAMESPACE"
fi

step "Done"
helm status "$RELEASE" --namespace "$NAMESPACE" | sed -n '/NOTES:/,$p'
