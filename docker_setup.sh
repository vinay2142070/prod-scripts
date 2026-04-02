#!/bin/bash
set -e

echo "📦 Installing Docker (if not installed)..."
sudo apt update
sudo apt install -y docker.io curl

echo "🚀 Starting Docker..."
sudo systemctl enable --now docker

echo "👤 Adding user to docker group..."
sudo usermod -aG docker $USER

echo "⬇️ Installing Docker Compose v2 (plugin)..."
mkdir -p ~/.docker/cli-plugins
curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o ~/.docker/cli-plugins/docker-compose
chmod +x ~/.docker/cli-plugins/docker-compose

echo "🔄 Running docker compose..."
sudo docker compose up -d --build

echo "✅ Done!"
echo "👉 After logout/login, use: docker compose up -d"
