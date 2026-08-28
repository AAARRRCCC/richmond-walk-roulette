# The k3s cluster

Inventory taken 2026-08-28 from the dev machine (`kubectl` v1.37.0; Helm v4.2.4 at
`%LOCALAPPDATA%\Microsoft\WinGet\Packages\Helm.Helm_Microsoft.Winget.Source_8wekyb3d8bbwe\windows-amd64\helm.exe`,
not on PATH). Facts, not plans; re-verify anything load-bearing before acting on it.

## Cluster

- **k3s v1.36.3+k3s1** (Kubernetes 1.36), containerd 2.3.2.
- Two nodes, both Debian 13 (trixie), amd64, **4 CPU / 16 GB each**:
  - `k3s-a` — control-plane, 192.168.8.141. API server: `https://192.168.8.141:6443` (the dev machine's kubeconfig `default` context).
  - `k3s-b` — worker, 192.168.8.214.
- Utilization at inventory time: ~5% CPU / 24% mem on `k3s-a`, ~2% / 8% on `k3s-b`. Plenty of headroom.

## Ingress: traefik + MetalLB

- **traefik v3.7** in `kube-system`, deployed by k3s's bundled HelmChart (`traefik-40.1.4+up40.1.0`; release app-version v3.7.1, running image `rancher/mirrored-library-traefik:3.7.8`). No `HelmChartConfig` overrides — stock k3s config.
- **MetalLB v0.16.1** (`metallb-system`), L2 advertisement, pool `lan-pool` = **192.168.8.200–192.168.8.212**. traefik's LoadBalancer service holds **192.168.8.200**; every ingress host resolves there on the LAN.
- All existing apps use plain `networking.k8s.io/Ingress` objects with `ingressClassName: traefik` — no IngressRoute CRs in use (the CRDs are installed via `traefik-crd`).

## TLS: cert-manager wildcard

- **cert-manager v1.21.1** (`cert-manager` namespace, Helm).
- One `ClusterIssuer`: **`letsencrypt-dns`** — ACME production, **DNS-01 via Cloudflare** (token in secret `cloudflare-api-token`).
- One `Certificate`: **`wildcard-plvr`** in `kube-system` → secret `wildcard-plvr-tls`, covering `*.plvr.net`.
- traefik's default `TLSStore` points at `wildcard-plvr-tls`, so **any `*.plvr.net` ingress gets valid TLS with zero per-app cert work** — `walk.plvr.net` is already covered.

## DNS is split-horizon

- **LAN**: the router (192.168.8.1) resolves `plvr.net` and `*.plvr.net` to **192.168.8.200** (traefik). This is why `valhalla.plvr.net` works from home.
- **Public**: only `plvr.net` exists (Cloudflare-proxied, reached via the `cloudflared` tunnel in the `matrix` namespace). **`valhalla.plvr.net` and the other subdomains have no public DNS records** — they are LAN-only today.
- Consequence: putting `walk.plvr.net` on the public internet needs an exposure decision (Cloudflare Tunnel like Matrix, port-forward + public A record, or similar). Nothing existing does this yet except the Matrix tunnel.

## Valhalla

- Namespace `valhalla`, deployed by **raw manifest via `kubectl apply`** (no Helm release).
- Image `ghcr.io/valhalla/valhalla-scripted:3.8.3`, 1 replica, `Recreate` strategy, `server_threads=4`, elevation build on, admins/timezones off, custom default-speeds config off.
- Tiles live on PVC **`valhalla-data`** (2 Gi, Longhorn) mounted at `/custom_files`.
- ClusterIP service on 8002, Ingress `valhalla.plvr.net`. Live check: `https://valhalla.plvr.net/status` returns v3.8.3, tileset last modified 2026-08-21.

## Storage

- **Longhorn v1.12.1** is the **default** StorageClass (`longhorn`; also `longhorn-crypto` for encrypted volumes, `longhorn-static`). Replicated across both nodes.
- k3s's `local-path` also present (non-default).
- Existing PVCs: valhalla-data 2Gi, portainer 2Gi, uptime-kuma 2Gi, tuwunel-data 15Gi (longhorn-crypto).

## Image registry

- **There is no in-cluster registry**, and **no `dockerconfigjson` pull secrets exist anywhere** — every workload pulls public images (ghcr.io, docker.io, quay.io).
- Getting a custom-built image onto the cluster (registry choice, or `k3s ctr` import) is an open decision, not an existing capability.

## Everything else running

| Namespace | What | Version | Notes |
|---|---|---|---|
| `portainer` | Portainer CE | 2.45.0 | Helm; UI at `portainer.plvr.net` |
| `uptime-kuma` | Uptime Kuma | 2.5.0 | Helm; monitoring UI at `uptime.plvr.net` |
| `matrix` | tuwunel + element-web + cloudflared | latest tags | Raw manifests; `plvr.net` (tuwunel), `chat.plvr.net` (Element), `twobot.plvr.net`; public via Cloudflare Tunnel (token-managed, routes live in the CF dashboard, not the cluster) |
| `longhorn-system` | Longhorn UI | 1.12.1 | `longhorn.plvr.net` |
| `default` | `hello` nginx test deploy | — | leftover smoke test, NodePort 30219 |

No Prometheus/Grafana, no sealed-secrets/SOPS, no GitOps operator (Argo/Flux), no CI runners in-cluster.
