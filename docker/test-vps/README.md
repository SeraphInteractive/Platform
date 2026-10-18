# Storage Node Setup

Guide for setting up a Nextcloud WebDAV storage node to host Project Stairway deliverables (review videos and .blend project files).

If you prefer a video walkthrough for setting up Nextcloud and router port forwarding, see [How to Set Up Your Own Nextcloud Server](https://youtu.be/Ro4V4cvIi4M?si=dWgs0kHAFGwoMOUW).

## Overview

Project Stairway splits storage between S3 and WebDAV:

- Media and thumbnails go to S3 / Cloudflare R2.
- Deliverables (.blend files and review renders) go to community-hosted Nextcloud WebDAV instances.

When an artist submits work from the grabbox:

1. Files stream into Nextcloud under `Project Stairway/Submission Reviews/Pending/<shot_code>/<filename>`.
2. Supervisors inspect the submission on `/grabbox/[shotCode]` or `/studio/reviews`. Deliverable download links and the Vault button (which opens Nextcloud web directly at the shot folder) are restricted to supervisors and admins.
3. Once approved, the platform moves the files from `Pending/<shot_code>/` to `Affirmed/<shot_code>/`.
4. Supervisors can later organize approved assets into `Production/` as needed.

## Directory layout

Your Nextcloud user root needs this hierarchy:

```text
Project Stairway/
|-- Production/
`-- Submission Reviews/
    |-- Pending/
    `-- Affirmed/
```

The platform only touches `Pending` and `Affirmed`. It never modifies or deletes anything inside `Production/`.

## Local test instance

For local development or testing the WebDAV pipeline, run the bundled test container:

```bash
./docker/test-vps/setup-test-vps.sh
```

This boots Nextcloud on port 18080 and creates the base folders.

Credentials:

- Username: `stairway_test`
- Password: `stairway_test_password_123`
- WebDAV URL: `http://127.0.0.1:18080/remote.php/dav/files/stairway_test`

## Production node setup

WebDAV uploads from web browsers require HTTPS. The simplest setup is Nextcloud behind Caddy, which handles SSL certificates automatically.

### 1. DNS and port forwarding

1. Point your domain or subdomain (e.g. `vault.yourdomain.com` or a Dynamic DNS hostname like DuckDNS) to your public IP.
2. If hosting from home, open your router admin page (usually `192.168.1.1` or `192.168.0.1`), find port forwarding, and forward TCP ports 80 and 443 to your server machine's local IP (e.g. `192.168.1.50`).
3. If using a cloud VPS (Hetzner, OVH, etc.), allow inbound TCP 80 and 443 in your cloud firewall.

### 2. Docker compose

Create a working directory on your server (e.g. `~/stairway-vault`) with this `docker-compose.yml`:

```yaml
services:
    nextcloud:
        image: nextcloud:30-apache
        container_name: stairway-nextcloud
        restart: unless-stopped
        environment:
            - NEXTCLOUD_ADMIN_USER=stairway_user
            - NEXTCLOUD_ADMIN_PASSWORD=choose_a_strong_password
            - NEXTCLOUD_TRUSTED_DOMAINS=vault.yourdomain.com
            - OVERWRITEPROTOCOL=https
            - OVERWRITEHOST=vault.yourdomain.com
            - TRUSTED_PROXIES=caddy
        volumes:
            - nextcloud_data:/var/www/html

    caddy:
        image: caddy:2-alpine
        container_name: stairway-caddy
        restart: unless-stopped
        ports:
            - "80:80"
            - "443:443"
        volumes:
            - ./Caddyfile:/etc/caddy/Caddyfile:ro
            - caddy_data:/data
            - caddy_config:/config

volumes:
    nextcloud_data:
    caddy_data:
    caddy_config:
```

### 3. Caddyfile

In the same directory, add a `Caddyfile`:

```caddy
vault.yourdomain.com {
    reverse_proxy nextcloud:80
}
```

### 4. Start the node

```bash
docker compose up -d
```

Caddy handles getting and renewing Let's Encrypt certificates automatically once DNS resolves.

## Folder initialization

Once Nextcloud is up, run these `curl` commands to seed the required directories:

```bash
USER="stairway_user"
PASS="choose_a_strong_password"
BASE="https://vault.yourdomain.com/remote.php/dav/files/${USER}"

curl -u "${USER}:${PASS}" -X MKCOL "${BASE}/Project%20Stairway"
curl -u "${USER}:${PASS}" -X MKCOL "${BASE}/Project%20Stairway/Production"
curl -u "${USER}:${PASS}" -X MKCOL "${BASE}/Project%20Stairway/Submission%20Reviews"
curl -u "${USER}:${PASS}" -X MKCOL "${BASE}/Project%20Stairway/Submission%20Reviews/Pending"
curl -u "${USER}:${PASS}" -X MKCOL "${BASE}/Project%20Stairway/Submission%20Reviews/Affirmed"
```

## Platform environment variables

Provide these 5 variables to the platform administrator to connect your node:

```env
NEXTCLOUD_URL=https://vault.yourdomain.com
NEXTCLOUD_USERNAME=stairway_user
NEXTCLOUD_PASSWORD=choose_a_strong_password
NEXTCLOUD_BASE_PATH=/remote.php/dav/files
NEXTCLOUD_PUBLIC_URL=https://vault.yourdomain.com
```

Values explained:

- `NEXTCLOUD_URL`: API backend target for server-side WebDAV operations.
- `NEXTCLOUD_USERNAME`: Nextcloud user account holding the folders.
- `NEXTCLOUD_PASSWORD`: User password or dedicated App Password from Settings -> Security.
- `NEXTCLOUD_BASE_PATH`: Path prefix (`/remote.php/dav/files`).
- `NEXTCLOUD_PUBLIC_URL`: URL used by supervisor browsers for deep-linking into the vault.

## Verification

Test health:

```bash
curl -s https://vault.yourdomain.com/status.php
```

Should return `{"installed":true,...}`.

Test WebDAV access:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -u "stairway_user:choose_a_strong_password" \
  -X PROPFIND -H "Depth: 0" \
  "https://vault.yourdomain.com/remote.php/dav/files/stairway_user/Project%20Stairway/Submission%20Reviews/Pending/"
```

An HTTP 207 response confirms authentication and directory presence.
