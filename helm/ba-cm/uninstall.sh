#!/usr/bin/env bash
#
# Remove the ba-cm release.
#
#   ./helm/ba-cm/uninstall.sh                 # release only
#   ./helm/ba-cm/uninstall.sh --namespace     # and the namespace with it
#
# Environment overrides:
#   NAMESPACE  (default ba-hub)
#   RELEASE    (default ba-cm)
#
# The namespace is left in place by default: it is cheap, and deleting it takes
# everything else in it — which is not ba-cm's to delete: ba-portal is
# a release in the same namespace. --namespace refuses while any other release
# is still installed.

set -euo pipefail

NAMESPACE="${NAMESPACE:-ba-hub}"
RELEASE="${RELEASE:-ba-cm}"
DROP_NAMESPACE=false

for arg in "$@"; do
  case "$arg" in
    --namespace) DROP_NAMESPACE=true ;;
    -h|--help)   sed -n '2,14p' "${BASH_SOURCE[0]}" | sed 's/^#//'; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

export PATH="$HOME/.rd/bin:$PATH"

helm uninstall "$RELEASE" --namespace "$NAMESPACE"

if [ "$DROP_NAMESPACE" = true ]; then
  remaining=$(helm list --namespace "$NAMESPACE" --short | wc -l | tr -d ' ')
  if [ "$remaining" != "0" ]; then
    echo "refusing to delete namespace '$NAMESPACE': $remaining other release(s) still installed" >&2
    exit 1
  fi
  kubectl delete namespace "$NAMESPACE"
fi
