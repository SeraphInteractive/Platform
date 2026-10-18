# Storage Node Guide

This guide covers setting up a Nextcloud WebDAV storage node to store Project Stairway deliverables (rendered video reviews and .blend source files).

---

## 1. How It Works

Project Stairway uses a hybrid storage architecture:

- Media & thumbnails: Stored in S3/R2 object storage.
- Deliverables (.blend files and review renders): Stored on Nextcloud WebDAV instances.

When an artist submits work:

1. The file streams directly into the Nextcloud node under `Project Stairway/Submission Reviews/Pending/shots/<shot-id>/<user-id>/`.
2. Supervisors view the submission in `/studio/reviews` and click the **Vault** button, which deep-links directly into Nextcloud's web UI.
3. When approved, the platform automatically moves files from `Pending` to `Project Stairway/Submission Reviews/Affirmed/`.
4. Supervisors can then organize approved files into `Project Stairway/Production/` at their discretion.

---

## 2. Directory Structure

Your Nextcloud user account needs this layout:

```text
Project Stairway/
|-- Production/                 <- Manually managed by supervisors
`-- Submission Reviews/         <- Controlled by platform API
    |-- Pending/                <- New task submissions land here
    `-- Affirmed/               <- Approved tasks are promoted here
```

The platform only writes to `Submission Reviews/Pending` and `Submission Reviews/Affirmed`. It will never modify files in `Production/`.

---

## 3. Setup Options

### Option A: Home Server or Personal Machine (Port Forwarding)

If you are donating storage from a personal rig or home server:

1. Start Nextcloud locally:

    ```bash
    ./docker/test-vps/setup-test-vps.sh
    ```

    This runs `stairway-test-vps` bound to port `18080` and creates the required folder structure.

    Default credentials:
    - Username: `stairway_test`
    - Password: `stairway_test_password_123`

2. Forward port on your router:
    - Access your home router admin gateway (typically `192.168.1.1` or `192.168.0.1`).
    - Navigate to the **Port Forwarding** / **Virtual Server** settings.
    - Add a rule forwarding an external port (e.g., `18080` or `443`) to your local machine IP (e.g., `192.168.1.50`) on port `18080`.
    - Protocol: TCP.

3. Configure your public IP or DDNS:
    - Determine your public IP (`curl -s https://ifconfig.me`) or point a Dynamic DNS domain (e.g., DuckDNS, Cloudflare DNS) to your public IP.
    - Add your public IP or domain to Nextcloud trusted domains:
        ```bash
        docker exec -u www-data stairway-test-vps php occ config:system:set trusted_domains 2 --value="your-public-ip-or-domain:18080"
        ```

4. Verify accessibility from the internet:
    ```bash
    curl -s http://your-public-ip-or-domain:18080/status.php
    ```

---

### Option B: Dedicated VPS

If you are deploying on a remote VPS (e.g., Hetzner, OVH, DigitalOcean):

1. Create a `docker-compose.yml`:

    ```yaml
    services:
        nextcloud:
            image: nextcloud:30-apache
            container_name: nextcloud-storage
            restart: unless-stopped
            ports:
                - "80:80"
            environment:
                - NEXTCLOUD_ADMIN_USER=stairway_user
                - NEXTCLOUD_ADMIN_PASSWORD=change_this_secure_password
                - NEXTCLOUD_TRUSTED_DOMAINS=your-vault-domain.com
            volumes:
                - nextcloud_data:/var/www/html

    volumes:
        nextcloud_data:
    ```

2. Start the container:

    ```bash
    docker compose up -d
    ```

3. Create the required folders via WebDAV MKCOL:
    ```bash
    USER="stairway_user"
    PASS="change_this_secure_password"
    BASE="https://your-vault-domain.com/remote.php/dav/files/${USER}"

    curl -u "${USER}:${PASS}" -X MKCOL "${BASE}/Project%20Stairway"
    curl -u "${USER}:${PASS}" -X MKCOL "${BASE}/Project%20Stairway/Production"
    curl -u "${USER}:${PASS}" -X MKCOL "${BASE}/Project%20Stairway/Submission%20Reviews"
    curl -u "${USER}:${PASS}" -X MKCOL "${BASE}/Project%20Stairway/Submission%20Reviews/Pending"
    curl -u "${USER}:${PASS}" -X MKCOL "${BASE}/Project%20Stairway/Submission%20Reviews/Affirmed"
    ```

---

## 4. API Configuration

Provide the following 5 environment variables to the platform administrator:

```env
NEXTCLOUD_URL=https://your-vault-domain.com
NEXTCLOUD_USERNAME=stairway_user
NEXTCLOUD_PASSWORD=change_this_secure_password
NEXTCLOUD_BASE_PATH=/remote.php/dav/files
NEXTCLOUD_PUBLIC_URL=https://your-vault-domain.com
```

- `NEXTCLOUD_URL`: Base URL used by backend for WebDAV HTTP requests.
- `NEXTCLOUD_USERNAME`: Nextcloud user account that owns the folders.
- `NEXTCLOUD_PASSWORD`: Account password or an App Password generated in Nextcloud Settings -> Security.
- `NEXTCLOUD_BASE_PATH`: Always `/remote.php/dav/files` for standard Nextcloud installs.
- `NEXTCLOUD_PUBLIC_URL`: Browser-facing URL used to build deep links for supervisors clicking "Vault".

---

## 5. Verification

Run these two commands to confirm your node is ready:

1. Check Nextcloud health:

    ```bash
    curl -s https://your-vault-domain.com/status.php
    # Expected output: {"installed":true,"maintenance":false,...}
    ```

2. Verify WebDAV credentials and Pending folder access:
    ```bash
    curl -s -o /dev/null -w "%{http_code}\n" \
      -u "stairway_user:change_this_secure_password" \
      -X PROPFIND -H "Depth: 0" \
      "https://your-vault-domain.com/remote.php/dav/files/stairway_user/Project%20Stairway/Submission%20Reviews/Pending/"
    # Expected output: 207
    ```

If you receive HTTP 207, the node is fully functional and ready to accept file streams from the platform.
