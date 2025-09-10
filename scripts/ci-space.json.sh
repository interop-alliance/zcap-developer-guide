#!/bin/sh
WASUP_ID="${WASUP_ID:-}"
RUNNER_TEMP="${RUNNER_TEMP:-"$(mktemp -d)"}"
TMP_WASUP_ID="$RUNNER_TEMP/WASUP_ID"

if [ -z "$WASUP_ID" ]; then
  echo "Error: WASUP_ID must be provided as an env var"
  exit 1
fi

# write WASUP_ID to file so it can be used by wasupdoc to get the CONTROLLER_DID from it
trap 'rm -f $TMP_WASUP_ID' EXIT
echo "$WASUP_ID" > "$TMP_WASUP_ID"

CONTROLLER_DID="$(npx wasupdoc --controller "$TMP_WASUP_ID" | jq -r .controller)"
CI_SPACE_CUUID="$(./scripts/ci-space-cuuid.ts)"

./scripts/space.json.ts \
  --controller "$CONTROLLER_DID" \
  --uuid "$CI_SPACE_CUUID"
