import {
  BACKUPS_KEPT,
  BACKUP_DIR,
  DEPLOY_DIR,
  DEPLOY_PROJECT,
} from "./lib.mjs";

// Scripts we run on the server with `ssh host bash -s`, the script on stdin.
//
// Each one is a single function called on the last line, with stdin pointed
// at /dev/null. bash reads a piped script as it goes, so without that a
// command that reads stdin (apt, a docker prompt) would swallow the rest of
// the script. Defining the function first makes bash read it all up front.

/** Compose release we download when the server's Docker has no usable plugin. */
export const COMPOSE_VERSION = "2.29.7";
export const MIN_COMPOSE = "2.20.0";

/**
 * Reports what the server is: `samata:key=value` lines for `parseProbe`.
 * Changes nothing.
 */
export const PROBE_SCRIPT = `
main() {
  emit() { printf 'samata:%s=%s\\n' "$1" "$2"; }

  SUDO=""
  if [ "$(id -u)" -ne 0 ]; then
    if command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
      SUDO="sudo"
    else
      emit sudo no
    fi
  fi
  emit user "$(id -un)"
  emit os_id "$(. /etc/os-release 2>/dev/null; echo "\${ID:-unknown}")"
  emit arch "$(uname -m)"
  emit mem_kb "$(awk '/^MemTotal:/ {print $2}' /proc/meminfo 2>/dev/null)"
  emit disk_kb "$(df -Pk / 2>/dev/null | awk 'NR==2 {print $4}')"
  emit dmi "$(cat /sys/devices/virtual/dmi/id/sys_vendor /sys/devices/virtual/dmi/id/product_name /sys/devices/virtual/dmi/id/board_vendor /sys/devices/virtual/dmi/id/bios_vendor 2>/dev/null | tr '\\n' ' ')"

  running=0
  if command -v docker >/dev/null 2>&1; then
    emit docker_cli 1
    emit docker_server "$($SUDO docker version --format '{{.Server.Version}}' 2>/dev/null || true)"
    emit compose "$($SUDO docker compose version --short 2>/dev/null || true)"
    if $SUDO docker volume inspect ${DEPLOY_PROJECT}_postgres-data >/dev/null 2>&1; then
      emit volume 1
    fi
    running=$($SUDO docker ps -q --filter label=com.docker.compose.project=${DEPLOY_PROJECT} 2>/dev/null | wc -l | tr -d ' ')
  fi
  emit running "$running"

  if $SUDO test -f ${DEPLOY_DIR}/.env; then emit env_exists 1; else emit env_exists 0; fi

  # Ports the stack publishes. Ours, on a re-run, don't count.
  busy=""
  if [ "$running" = 0 ] && command -v ss >/dev/null 2>&1; then
    for p in 80 443 7881 5060; do
      if ss -ltn "sport = :$p" 2>/dev/null | tail -n +2 | grep -q .; then
        busy="$busy $p"
      fi
    done
  fi
  emit busy_ports "\${busy# }"
}
main </dev/null
`;

/**
 * Dumps the database to BACKUP_DIR before an upgrade and keeps the newest few.
 * Prints `samata:backup=<file>` on success. The dump is written to a temporary
 * name first so a half-finished one never looks like a backup.
 */
export const BACKUP_SCRIPT = `
main() {
  set -eu
  fail() { echo "samata: $*" >&2; exit 1; }

  SUDO=""
  [ "$(id -u)" -ne 0 ] && SUDO="sudo"

  dir="${BACKUP_DIR}"
  $SUDO mkdir -p "$dir"
  $SUDO chmod 700 "$dir"
  file="$dir/samata-$(date +%Y%m%d-%H%M%S).sql"

  # The redirect runs as root inside sh, so the dump is never readable by others.
  if ! $SUDO sh -c 'umask 077; cd ${DEPLOY_DIR} && docker compose -p ${DEPLOY_PROJECT} exec -T postgres pg_dump -U samata samata > "$1"' sh "$file.partial"; then
    $SUDO rm -f "$file.partial"
    fail "pg_dump failed (is the postgres container running?)"
  fi
  if ! $SUDO test -s "$file.partial"; then
    $SUDO rm -f "$file.partial"
    fail "the database dump came out empty"
  fi
  $SUDO mv "$file.partial" "$file"

  # Newest first; drop everything after the ones we keep.
  $SUDO sh -c 'ls -1t "$1"/samata-*.sql 2>/dev/null | tail -n +$(($2 + 1)) | while read -r old; do rm -f "$old"; done' sh "$dir" ${BACKUPS_KEPT}

  printf 'samata:backup=%s\\n' "$file"
}
main </dev/null
`;

/**
 * Installs Docker Engine and/or the Compose plugin, then makes sure the
 * daemon is up. Idempotent: it only does what's missing.
 */
export const INSTALL_SCRIPT = `
main() {
  set -eu
  fail() { echo "samata: $*" >&2; exit 1; }

  SUDO=""
  [ "$(id -u)" -ne 0 ] && SUDO="sudo"
  . /etc/os-release
  os="\${ID:-unknown}"

  case "$(uname -m)" in
    x86_64|amd64) carch=x86_64 ;;
    aarch64|arm64) carch=aarch64 ;;
    *) fail "unsupported CPU: $(uname -m)" ;;
  esac

  # Compose plugin from the Compose releases, checked against the published
  # checksum. Used where the distro's Docker doesn't ship one.
  install_compose_plugin() {
    url="https://github.com/docker/compose/releases/download/v${COMPOSE_VERSION}/docker-compose-linux-$carch"
    tmp="$(mktemp)"
    curl -fsSL "$url" -o "$tmp" || fail "couldn't download Docker Compose from $url"
    expected="$(curl -fsSL "$url.sha256" | awk '{print $1}')"
    actual="$(sha256sum "$tmp" | awk '{print $1}')"
    [ -n "$expected" ] && [ "$expected" = "$actual" ] || { rm -f "$tmp"; fail "Docker Compose download failed its checksum"; }
    $SUDO mkdir -p /usr/local/lib/docker/cli-plugins
    $SUDO install -m 0755 "$tmp" /usr/local/lib/docker/cli-plugins/docker-compose
    rm -f "$tmp"
  }

  if ! command -v docker >/dev/null 2>&1; then
    echo "samata: installing Docker"
    case "$os" in
      ubuntu|debian|raspbian)
        # A fresh cloud image is often running unattended upgrades, which hold
        # the apt lock for a few minutes. Wait for it instead of failing.
        echo 'DPkg::Lock::Timeout "300";' | $SUDO tee /etc/apt/apt.conf.d/99samata-lock-timeout >/dev/null
        if ! command -v curl >/dev/null 2>&1; then
          $SUDO apt-get update -y
          $SUDO apt-get install -y curl ca-certificates
        fi
        script="$(mktemp)"
        curl -fsSL https://get.docker.com -o "$script" || fail "couldn't download https://get.docker.com"
        $SUDO sh "$script"
        rm -f "$script"
        $SUDO rm -f /etc/apt/apt.conf.d/99samata-lock-timeout
        ;;
      amzn)
        if command -v dnf >/dev/null 2>&1; then $SUDO dnf install -y docker; else $SUDO yum install -y docker; fi
        ;;
      *)
        fail "can't install Docker on $os: install Docker with Compose v2 and run this again"
        ;;
    esac
  fi

  if ! $SUDO docker info >/dev/null 2>&1; then
    $SUDO systemctl enable --now docker 2>/dev/null || $SUDO service docker start
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      $SUDO docker info >/dev/null 2>&1 && break
      sleep 2
    done
    $SUDO docker info >/dev/null 2>&1 || fail "the Docker daemon didn't start"
  fi

  have="$($SUDO docker compose version --short 2>/dev/null | sed 's/^v//' || true)"
  if [ -z "$have" ] || ! printf '%s\\n%s\\n' "${MIN_COMPOSE}" "$have" | sort -V -C; then
    echo "samata: installing Docker Compose ${COMPOSE_VERSION}"
    install_compose_plugin
  fi
  $SUDO docker compose version >/dev/null 2>&1 || fail "Docker Compose isn't available after installing it"
}
main </dev/null
`;
