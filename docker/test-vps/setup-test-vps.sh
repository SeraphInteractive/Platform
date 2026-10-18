#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.test-vps.yml"

echo "[test-vps] Starting Nextcloud test VPS..."
docker compose -f "${COMPOSE_FILE}" up -d

echo "[test-vps] Waiting for Nextcloud to initialize..."
until curl -s -f "http://127.0.0.1:18080/status.php" | grep -q '"installed":true'; do
    echo "[test-vps] Waiting for Nextcloud installation to complete..."
    sleep 3
done

echo "[test-vps] Nextcloud is online and installed."

BASE_URL="http://127.0.0.1:18080/remote.php/dav/files/stairway_test"
AUTH="stairway_test:stairway_test_password_123"

create_folder() {
    local folder="$1"
    echo "[test-vps] Ensuring folder exists: ${folder}"
    local code
    code=$(curl -s -o /dev/null -w "%{http_code}" -u "${AUTH}" -X MKCOL "${BASE_URL}/${folder}")
    if [[ "${code}" == "201" || "${code}" == "405" ]]; then
        echo "[test-vps] Folder ready: ${folder} (HTTP ${code})"
    else
        echo "[test-vps] Warning: MKCOL ${folder} returned HTTP ${code}"
    fi
}

# seed base folder hierarchy
create_folder "Project Stairway"
create_folder "Project Stairway/Production"
create_folder "Project Stairway/Submission Reviews"
create_folder "Project Stairway/Submission Reviews/Pending"
create_folder "Project Stairway/Submission Reviews/Affirmed"
create_folder "Pending"
create_folder "Affirmed"
create_folder "submissions"
create_folder "submissions/pending-review"
create_folder "production"
create_folder "cold-archives"

echo "[test-vps] Storage directories initialized successfully."
echo "[test-vps] WebDAV URL: ${BASE_URL}"
