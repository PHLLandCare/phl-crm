#!/bin/bash
# PHL Land Care — Raspberry Pi Scanner Station Setup
# Run once on a fresh Pi Zero 2W after flashing Raspberry Pi OS Lite
# Usage: bash setup.sh

set -e
echo "=== PHL Land Care Scanner Setup ==="

# 1. Update system
sudo apt-get update -y && sudo apt-get upgrade -y

# 2. Install Python deps
sudo apt-get install -y python3-pip
pip3 install requests

# 3. Install Tailscale (remote SSH access from home)
curl -fsSL https://tailscale.com/install.sh | sh
echo ""
echo ">>> ACTION REQUIRED: Run 'sudo tailscale up' to link this Pi to your Tailscale account"
echo "    Then from home you can SSH in with: ssh pi@<tailscale-ip>"
echo ""

# 4. Copy scanner script
cp phl_scanner.py /home/pi/phl_scanner.py
chmod +x /home/pi/phl_scanner.py

# 5. Install systemd service
sudo cp phl-scanner.service /etc/systemd/system/phl-scanner.service
sudo systemctl daemon-reload
sudo systemctl enable phl-scanner
sudo systemctl start phl-scanner

echo ""
echo "=== Setup complete ==="
echo "Service status: sudo systemctl status phl-scanner"
echo "Live log:       journalctl -u phl-scanner -f"
echo "Test a scan:    echo 'PHL-0001' | python3 phl_scanner.py"
