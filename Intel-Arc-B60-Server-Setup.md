# Intel Arc B60 AI Server Setup Guide
## Ubuntu 24.04 + OpenVINO 2026.4 + OVMS + OneAPI for Intel Arc Pro B60

This is the single, canonical guide for turning an Intel Arc Pro B60 machine into an
AI inference server. It covers the full stack: OS preparation, Docker, OpenVINO,
OneAPI, the OpenVINO Model Server (OVMS), GPU access, networking, monitoring, and
maintenance.

> **Note on GPU access:** Containers get GPU access via `--device /dev/dri` +
> `--group-add=<render group id>` and the **`-gpu`** OVMS image — **not** `--gpus all`
> (that is the NVIDIA approach and does not apply here).

## Resources
- **OpenVINO Documentation**: https://docs.openvinotoolkit.org/2026/index.html
- **Model Server Documentation**: https://docs.openvinotoolkit.org/latest/omz/tools/model_server/
- **Model Server GitHub**: https://github.com/openvinotoolkit/model_server
- **OpenVINO Models via OpenAI API**: https://medium.com/@infnetdanpro/serve-openvino-models-through-an-openai-compatible-api-e2f85fba396a
- **Hugging Face LLM Collection**: https://huggingface.co/collections/OpenVINO/llm

## Hardware Requirements
- Intel Arc Pro B60 GPU (24 GB VRAM, 20 Xe2 cores)
- Ubuntu Server 24.04 LTS with the **HWE kernel** (Battlemage needs a recent kernel)
- **BIOS: Resizable BAR (ReBAR) and Above 4G Decoding enabled.** Arc GPUs lose a lot
  of performance without ReBAR. Check with `sudo lspci -vv | grep -A2 "Resizable BAR"`.
- 64 GB RAM minimum
- 20 GB+ available disk space for models
- Network connectivity

## Connection Details
All hosts, ports and credentials live in [.env](./.env) (template: [.env.example](./.env.example)):
- Host: `AI_SERVER_HOST` (gateway: `AI_SERVER_GATEWAY`, NIC: `AI_SERVER_IFACE`)
- Username / password: `AI_SERVER_USER` / `AI_SERVER_PASSWORD`
- API port / URL / key: `AI_API_PORT` / `AI_API_URL` / `AI_API_KEY`

Load it into every shell before running the commands below (copy it to the server
too, for the server-side steps):
```bash
set -a; source .env; set +a
```

## 1. Initial Server Setup

### Connect to Server
```bash
ssh "$AI_SERVER_USER@$AI_SERVER_HOST"
```

### Update System
```bash
sudo apt update && sudo apt upgrade -y
```

### Install Essential Tools
```bash
sudo apt install -y \
    curl \
    wget \
    git \
    htop \
    vim \
    net-tools
```

### Install GPU Kernel & Compute Runtime (Battlemage)
The B60 needs a recent kernel plus Intel's user-space compute runtime (Level Zero +
OpenCL). Intel's recommended source on Ubuntu 24.04 is the `kobuk-team/intel-graphics`
PPA ([Intel install guide](https://dgpu-docs.intel.com/installation-guides/index.html)).

```bash
# HWE kernel (newer GPU support), then reboot
sudo apt install -y linux-generic-hwe-24.04
sudo reboot

# Intel GPU compute runtime
sudo apt install -y software-properties-common
sudo add-apt-repository -y ppa:kobuk-team/intel-graphics
sudo apt update
sudo apt install -y libze-intel-gpu1 libze1 intel-opencl-icd clinfo intel-gsc

# Allow your user to use the GPU without sudo
sudo gpasswd -a "$USER" render
newgrp render

# Verify
uname -r                                  # HWE kernel
ls /dev/dri                               # card* and renderD* present
clinfo -l                                 # lists the Arc Pro B60
```

## 2. Docker Installation

Uses the current keyring approach (not the deprecated `apt-key add`).

```bash
# Install prerequisites
sudo apt install apt-transport-https ca-certificates curl gnupg lsb-release

# Add Docker's official GPG key
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# Add Docker repository
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
sudo apt update
sudo apt install docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Enable and start Docker
sudo systemctl enable docker
sudo systemctl start docker
```

> **Do not install the NVIDIA Container Toolkit.** Intel Arc GPUs are exposed to
> containers through `/dev/dri` (see the OVMS service below), so `nvidia-docker2`
> and `nvidia-container-runtime` are not needed and should not be configured.

## 3. OpenVINO Installation (Optional)

> **OVMS does not need this.** The OVMS `-gpu` Docker image ships its own OpenVINO
> runtime. Install OpenVINO on the host only for Python scripts, model conversion or
> benchmarking outside Docker. `pip install openvino openvino-genai` in a venv is the
> simpler alternative.

```bash
# Add Intel GPG key
wget https://apt.repos.intel.com/intel-gpg-keys/GPG-PUB-KEY-INTEL-SW-PRODUCTS.PUB
sudo apt-key add GPG-PUB-KEY-INTEL-SW-PRODUCTS.PUB

# Add OpenVINO repository
echo "deb https://apt.repos.intel.com/openvino/2026.4 all main" \
  | sudo tee /etc/apt/sources.list.d/openvino.list

# Install OpenVINO
sudo apt update
sudo apt install openvino-2026.4
```

### Verify Installation
```bash
python3 -c "import openvino as ov; print(ov.__version__)"
```

### Verify OpenVINO Sees the GPU
The GPU runtime is installed in
[step 1](#install-gpu-kernel--compute-runtime-battlemage).

```bash
python3 -c "import openvino as ov; print(ov.Core().available_devices)"   # expect ['CPU', 'GPU']
```

## 4. OneAPI Installation

OneAPI provides the SYCL compiler/runtime and Intel-optimized libraries (DPC++, oneMKL,
oneDNN, oneVPL). **OVMS does not need it.** It is only required for building or
running llama.cpp with the SYCL backend (see the
[llama.cpp guide](./Intel-Arc-B60-llama.cpp-Setup.md#openvino-ovms-vs-llamacpp-on-the-b60)).

```bash
# Add Intel GPG key
wget https://apt.repos.intel.com/intel-gpg-keys/GPG-PUB-KEY-INTEL-SW-PRODUCTS.PUB
sudo apt-key add GPG-PUB-KEY-INTEL-SW-PRODUCTS.PUB

# Add OneAPI repository
echo "deb https://apt.repos.intel.com/oneapi all main" \
  | sudo tee /etc/apt/sources.list.d/oneapi.list

# Install OneAPI Base Toolkit
sudo apt update
sudo apt install intel-oneapi-basekit

# Source the environment variables
source /opt/intel/oneapi/setvars.sh
```

### Verify Installation
```bash
# Check available SYCL devices
sycl-ls
```

### OneAPI vs OpenVINO
OpenVINO's GPU plugin talks to the Arc GPU through the Intel compute runtime
(Level Zero / OpenCL), not through SYCL. OVMS runs in Docker with only
`--device /dev/dri`, so `setvars.sh` is not needed for the model server. Source it
only in shells where you build or run llama.cpp SYCL.

## 5. OpenVINO Model Server (OVMS)

OVMS hosts the LLMs and exposes an OpenAI-compatible API on `AI_API_PORT`.

Key points:
- **Use the `openvino/model_server:latest-gpu` image.** The plain `latest` image has no
  GPU drivers.
- **`--target_device GPU`** pins inference to the B60. Without it OVMS auto-selects, and
  it would fall back to CPU if the GPU isn't visible.
- **`--group-add`** must be the GID of the host's `render` group. It differs per machine,
  so it is computed below.
- **API key:** OVMS only enforces a key on `/v3/` if one is configured (`API_KEY` env or
  `--api_key_file`). Without it, anyone on the network can use the server.

### Store the API Key for the Service
```bash
sudo install -d -m 700 /etc/ovms
echo "API_KEY=$AI_API_KEY" | sudo tee /etc/ovms/ovms.env > /dev/null
sudo chmod 600 /etc/ovms/ovms.env
```

### Option 1: Systemd Service (Recommended)
```bash
sudo tee /etc/systemd/system/openvino-model-server.service << EOF
[Unit]
Description=OpenVINO Model Server
After=docker.service network-online.target
Requires=docker.service

[Service]
Restart=always
RestartSec=5
EnvironmentFile=/etc/ovms/ovms.env

ExecStart=/usr/bin/docker run --rm \
  --name ovms \
  --device /dev/dri \
  --group-add=$(stat -c "%g" /dev/dri/render* | head -n 1) \
  -e API_KEY \
  -p ${AI_API_PORT}:8000 \
  -v /models:/models:rw \
  openvino/model_server:latest-gpu \
  --source_model "OpenVINO/Qwen3.8-27B-int4-ov" \
  --model_repository_path /models \
  --task text_generation \
  --target_device GPU \
  --rest_port 8000

[Install]
WantedBy=multi-user.target
EOF
```

> The heredoc is unquoted on purpose. `${AI_API_PORT}` and the render-group GID are
> resolved **when the file is written**, because systemd can't run `$(...)` in
> `ExecStart`. Re-run this step if the port or GPU changes. `-e API_KEY` passes the key
> from `EnvironmentFile` without writing it into the unit.

Optional tuning flags (append after `--rest_port 8000`):
- `--cache_size <GB>`: fixed KV-cache size. The default `0` allocates dynamically.
- `--reasoning_parser qwen3` / `--tool_parser <name>`: these are auto-detected from the
  chat template. Set them explicitly only if agent clients (Roo Code, Claude Code)
  mis-parse thinking or tool calls.
- `--max_num_seqs <n>`: limits concurrent sequences (default 256).

```bash
# Reload systemd configuration
sudo systemctl daemon-reload

# Enable the service to start on boot
sudo systemctl enable openvino-model-server.service

# Start the service immediately
sudo systemctl start openvino-model-server.service

# Check the status
sudo systemctl status openvino-model-server.service
```

### Option 2: Docker Compose (Alternative)
```bash
mkdir -p /opt/openvino-model-server
cd /opt/openvino-model-server
sudo tee docker-compose.yml << EOF
services:
  model-server:
    image: openvino/model_server:latest-gpu
    container_name: openvino-model-server
    restart: unless-stopped
    ports:
      - "${AI_API_PORT}:8000"
    volumes:
      - /models:/models:rw
    devices:
      - /dev/dri
    group_add:
      - "$(stat -c "%g" /dev/dri/render* | head -n 1)"
    env_file:
      - /etc/ovms/ovms.env
    command: [
      "--source_model", "OpenVINO/Qwen3.8-27B-int4-ov",
      "--model_repository_path", "/models",
      "--task", "text_generation",
      "--target_device", "GPU",
      "--rest_port", "8000"
    ]
EOF
sudo docker compose up -d
```

## 6. Network Configuration

### Firewall Settings
```bash
# Allow OpenVINO Model Server port
sudo ufw allow "$AI_API_PORT/tcp"
```

### Static IP Address
Ensure the server has a static IP for consistent client access. Find the NIC name with
`ip -br link` and set `AI_SERVER_IFACE` in `.env`:
```bash
sudo tee /etc/netplan/01-network-manager-all.yaml << EOF
network:
  version: 2
  ethernets:
    ${AI_SERVER_IFACE}:
      dhcp4: false
      addresses:
        - ${AI_SERVER_HOST}/24
      routes:
        - to: default
          via: ${AI_SERVER_GATEWAY}
      nameservers:
        addresses: [8.8.8.8, 1.1.1.1]
EOF
sudo netplan apply
```

## 7. Verification

```bash
# Check if the service is running
sudo systemctl status openvino-model-server.service

# Check if the API port is listening
sudo netstat -tulnp | grep ":$AI_API_PORT"

# Check Docker containers
docker ps

# Test if the server is responding
curl "http://localhost:$AI_API_PORT/v3"

# List available models
curl -H "Authorization: Bearer $AI_API_KEY" "http://localhost:$AI_API_PORT/v3/models"

# Confirm OVMS is running on the GPU, not the CPU
docker logs ovms 2>&1 | grep -iE "target_device|GPU" | head   # Compose: openvino-model-server
```

## 8. GPU & System Monitoring

### Install Monitoring Tools
Use tools that support the Battlemage `xe` kernel driver:

| Tool | Shows | Install |
|---|---|---|
| **qmassa** | Utilization, VRAM, frequency, power, temps, per-process usage | `cargo install --locked qmassa` ([repo](https://github.com/ulissesf/qmassa)) |
| **nvtop** | Utilization, VRAM, per-process usage (multi-vendor) | `sudo apt install nvtop` ([repo](https://github.com/Syllo/nvtop)) |
| **xpu-smi** (Intel XPU Manager) | Telemetry, health, firmware; supports Arc B-series | [intel/xpumanager releases](https://github.com/intel/xpumanager) |

```bash
sudo apt update
sudo apt install -y lm-sensors nvtop cargo
cargo install --locked qmassa
```

### Verify GPU Detection
```bash
# Check if Intel GPU is detected
lspci | grep -i vga

# Check which kernel driver is bound to the GPU
lspci -k | grep -iA3 -E "vga|display"
```

### GPU Monitoring Commands
```bash
# Real-time GPU dashboard: utilization, VRAM, freq, power, temp
sudo ~/.cargo/bin/qmassa

# Per-process GPU + VRAM usage (needs sudo for total memory / accurate freq)
sudo nvtop

# Device list and live telemetry (if XPU Manager is installed)
xpu-smi discovery
xpu-smi dump -d 0 -m 0,1,2,18     # util %, power W, freq MHz, VRAM used

# GPU temperature / power sensors
sensors
```

> Watch VRAM while serving long contexts. Qwen3.8-27B int4 uses ~15GB for weights, and
> the KV cache grows into the remaining ~9GB.

### System Monitoring
```bash
# Monitor system resources
htop

# Monitor Docker containers
docker stats

# Check service logs
sudo journalctl -u openvino-model-server.service -f

# Check disk space
df -h

# Check memory usage
free -h

# Check network connections
ss -tuln
```

### Advanced Monitoring (Optional)
```bash
# Install Prometheus and Grafana
sudo apt install prometheus grafana

# Configure Prometheus to scrape Docker stats
# Configure Grafana to visualize metrics
```

## 9. Backup and Recovery
```bash
mkdir -p ~/backup

# Backup service file
sudo cp /etc/systemd/system/openvino-model-server.service ~/backup/

# Backup model directory
tar -czvf ~/backup/models-backup.tar.gz /models/
sudo cp /etc/ovms/ovms.env ~/backup/   # contains the API key: keep it private
```

## 10. Maintenance
```bash
# Update system regularly
sudo apt update && sudo apt upgrade -y

# Update the OVMS image (new OpenVINO / model support), then restart
docker pull openvino/model_server:latest-gpu
sudo systemctl restart openvino-model-server.service

# Clean up old Docker images
docker image prune -f

# Check disk space
df -h
```
1. Update system packages regularly
2. Monitor Docker and OpenVINO versions
3. Update models as needed (see `Intel-Arc-B60-Models.md`)
4. Review and optimize service configurations
5. Weekly resource usage reviews; monthly model performance assessments; quarterly system health checks

## Security Considerations
- Change the default SSH password, or better, use SSH keys and disable password login
- **Enforce the API key** (`/etc/ovms/ovms.env`, see §5). Without it, OVMS accepts
  unauthenticated requests.
- Configure firewall rules (see Network Configuration). Only expose `AI_API_PORT` to
  your LAN, never to the internet.
- Apply regular security updates
- Monitor system logs for unauthorized access attempts

## Troubleshooting

### Common Issues
- **Docker not starting**: Ensure Docker is properly installed and enabled
- **GPU not detected**: Verify the hardware is detected and a kernel driver is bound to it (`lspci -k | grep -iA3 -E "vga|display"`)
- **GPU not accessible in container**: Ensure `--device /dev/dri` is passed and `--group-add` matches `stat -c "%g" /dev/dri/render*`
- **Very slow generation (a few tok/s)**: OVMS is running on CPU. Check that you use the
  `latest-gpu` image and `--target_device GPU`, and look at `docker logs ovms`. Also
  verify ReBAR is enabled.
- **HTTP 401 from clients**: The client's key must match `API_KEY` in `/etc/ovms/ovms.env` (`AI_API_KEY` in `.env`)
- **Port conflicts**: Check if `AI_API_PORT` is already in use (`ss -tulnp | grep ":$AI_API_PORT"`)
- **Model loading errors**: Verify the model path exists in `/models` and permissions are correct
- **Insufficient memory**: Verify sufficient RAM is allocated for the model

### Service Management Commands
```bash
# Stop service
sudo systemctl stop openvino-model-server.service

# Start service
sudo systemctl start openvino-model-server.service

# Restart service
sudo systemctl restart openvino-model-server.service

# View logs
sudo journalctl -u openvino-model-server.service -f
```

## Related Guides
- **Model selection, download & management**: `Intel-Arc-B60-Models.md`
- **Connecting clients (VS Code, Roo Code, OpenAI SDK, Open WebUI)**: `Intel-Arc-B60-Clients.md`
- **Alternative inference engine (llama.cpp) + OVMS vs llama.cpp comparison**: `Intel-Arc-B60-llama.cpp-Setup.md`
- **Windows desktop with LM Studio (single/dual B60, drivers)**: `Intel-Arc-B60-Windows-LM-Studio.md`
