#!/usr/bin/env bash
# Cloud-init for the ba-hub Docker host.
#
# This script only *prepares* the machine: Docker, the compose plugin, and the
# deployment directory. It deliberately knows nothing about which containers
# run there — that is host/docker-compose.yml, shipped by the deploy job in
# .github/workflows/build-images.yml. Keeping the two apart means editing the
# runtime is a git push, not an instance replacement.
set -euxo pipefail

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y ca-certificates curl gnupg

# Canonical's AMI ships the SSM agent as a snap, but not always started. This
# is the host's only management path — both the CI deploy job and
# `aws ssm start-session` go through it — so make sure it is up rather than
# assuming it.
snap start --enable amazon-ssm-agent || systemctl enable --now amazon-ssm-agent

# Docker's own repository rather than Ubuntu's docker.io package: only the
# former ships docker-compose-plugin, and `docker compose` is what the deploy
# job calls.
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg |
  gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

cat >/etc/apt/sources.list.d/docker.list <<REPO
deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable
REPO

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

systemctl enable --now docker
usermod -aG docker ubuntu

# Containers must come back after a reboot without anyone logging in. The unit
# is a one-shot that replays whatever compose file is currently on disk; the
# `restart: unless-stopped` policies handle everything short of a reboot.
install -d -o ubuntu -g ubuntu /opt/ba-hub

cat >/opt/ba-hub/.env <<ENV
ACME_EMAIL=${acme_email}
ENV
chown ubuntu:ubuntu /opt/ba-hub/.env
chmod 0640 /opt/ba-hub/.env

cat >/etc/systemd/system/ba-hub.service <<'UNIT'
[Unit]
Description=ba-hub containers
Requires=docker.service
After=docker.service network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/ba-hub
ExecStart=/usr/bin/docker compose up -d --remove-orphans
ExecStop=/usr/bin/docker compose down

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
# Enabled but not started: there is no compose file on disk until the first
# deploy, and starting now would only log a failure.
systemctl enable ba-hub.service
