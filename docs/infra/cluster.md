# The k3s cluster

Inventory taken 2026-08-28 from the dev machine, with corrections from the cluster-ops
session on 2026-09-01 marked **(corrected 2026-09-01)**.

Tooling on the dev machine: `kubectl` v1.37.0; Helm v4.2.4 at
`%LOCALAPPDATA%\Microsoft\WinGet\Packages\Helm.Helm_Microsoft.Winget.Source_8wekyb3d8bbwe\windows-amd64\helm.exe`,
not on PATH. Facts, not plans; re-verify anything load-bearing before acting on it.

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
- traefik's default `TLSStore` points at `wildcard-plvr-tls`, so an ingress that names no
  `secretName` still gets valid TLS.
- **(corrected 2026-09-01)** This is *not* a licence to reference `wildcard-plvr-tls` from
  another namespace. That Secret lives in `kube-system`; a copy elsewhere goes stale the
  moment the wildcard renews and then silently serves an expired cert. An app issues its
  **own** `Certificate` against `letsencrypt-dns` — DNS-01, so it issues for a LAN-only
  hostname with no inbound HTTP path. See `cluster-sec/k8s/pixmobile/tls.yaml`.

## DNS is split-horizon

- **LAN**: the router (192.168.8.1) resolves `plvr.net` and `*.plvr.net` to **192.168.8.200** (traefik). This is why `valhalla.plvr.net` works from home.
- **Public**: `plvr.net` and `chat.plvr.net` (Cloudflare-proxied, reached via the
  `cloudflared` tunnel). Other subdomains have no public DNS records — they are LAN-only.
  **(corrected 2026-09-01)** `twobot.plvr.net` was retired, and tunnel routing is **in git**
  (`k8s/cloudflared/config.yaml` plus `cloudflare/dns.json`, applied with
  `cloudflare/apply.sh`), not in the Cloudflare dashboard.
- Consequence: putting `walk.plvr.net` on the public internet needs an exposure decision (Cloudflare Tunnel like Matrix, port-forward + public A record, or similar). Nothing existing does this yet except the Matrix tunnel.

## Valhalla

- Namespace `valhalla`. **(corrected 2026-09-01)** Now Argo-managed from `cluster-sec` like
  everything else — the "hand-applied, no Helm release" reading below is stale. As of
  2026-09-01 there are **no hand-applied workloads left**: 11 Argo Applications, all
  Synced/Healthy, the `matrix` namespace adopted that day.
- Image `ghcr.io/valhalla/valhalla-scripted:3.8.3`, 1 replica, `Recreate` strategy, `server_threads=4`, elevation build on, admins/timezones off, custom default-speeds config off.
- Tiles live on PVC **`valhalla-data`** (2 Gi, Longhorn) mounted at `/custom_files`.
- ClusterIP service on 8002, Ingress `valhalla.plvr.net`. Live check: `https://valhalla.plvr.net/status` returns v3.8.3, tileset last modified 2026-08-21.

## Storage

- **Longhorn v1.12.1** is the **default** StorageClass (`longhorn`; also `longhorn-crypto` for encrypted volumes, `longhorn-static`). Replicated across both nodes.
- k3s's `local-path` also present (non-default).
- Existing PVCs: valhalla-data 2Gi, portainer 2Gi, uptime-kuma 2Gi, tuwunel-data 15Gi (longhorn-crypto).

## Image registry

- **There is no in-cluster registry**, and **no `dockerconfigjson` pull secrets exist anywhere** — every workload pulls public images (ghcr.io, docker.io, quay.io).
- **(corrected 2026-09-01)** No longer open: images are built by each app's own CI for
  linux/amd64, pushed to `ghcr.io` under a 12-char commit SHA, and deployed by a
  hand-edited tag bump in `cluster-sec`. A private package needs a SOPS-encrypted
  `dockerconfigjson` and `imagePullSecrets` (see `k8s/pixmobile/`); a public one needs
  neither. There is still no in-cluster registry and no `k3s ctr` import path.

## Everything else running

| Namespace | What | Version | Notes |
|---|---|---|---|
| `portainer` | Portainer CE | 2.45.0 | Helm; UI at `portainer.plvr.net` |
| `uptime-kuma` | Uptime Kuma | 2.5.0 | Helm; monitoring UI at `uptime.plvr.net` |
| `matrix` | tuwunel + element-web + cloudflared | latest tags | `plvr.net` (tuwunel), `chat.plvr.net` (Element); public via Cloudflare Tunnel. **(corrected 2026-09-01)** Argo-managed since 2026-09-01; `twobot.plvr.net` retired; tunnel routes live in git, not the CF dashboard |
| `longhorn-system` | Longhorn UI | 1.12.1 | `longhorn.plvr.net` |
| `default` | `hello` nginx test deploy | — | leftover smoke test, NodePort 30219 |

No Prometheus/Grafana, no sealed-secrets/SOPS, no GitOps operator (Argo/Flux), no CI runners in-cluster.

## Two traps documented by cluster-ops (2026-09-01)

- A file referenced by a `kustomization.yaml` but **not committed** breaks the whole
  Application, not the file: `kustomize build` fails outright and Argo reports a
  `ComparisonError` condition with nothing applied — *not* `OutOfSync`, which is where you
  would go looking. Check `git ls-files k8s/<app>` against the directory listing first.
- Omitting a field that a CRD defaults server-side causes permanent `OutOfSync`. State
  defaults explicitly.
- traefik reads `router.*` annotations from the **Ingress** and `service.*` from the
  **Service**, and silently ignores a misplaced one. `router.middlewares` is therefore
  per-Ingress, never per path: two path groups needing different middleware need two
  Ingress objects on the same host.
- There is no git webhook on `cluster-sec` yet, so a push takes up to ~3 minutes to be
  noticed. Do not conclude manifests are broken in the first two minutes.

`cluster-sec/docs/deploying-an-app.md` is canonical; read it end to end before writing
manifests.
