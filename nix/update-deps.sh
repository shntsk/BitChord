#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

if ! command -v nix-build >/dev/null 2>&1; then
  echo "nix-build was not found. Enable nix-command and flakes first." >&2
  exit 1
fi

# The dev shell exports NIX_PATH to the exact nixpkgs input pinned by
# flake.lock. package.nix is evaluated from this checkout (not the Nix store),
# so gradle.fetchDeps writes the generated lockfile back to nix/deps.json.
if [ -z "${NIX_PATH:-}" ]; then
  echo "Run this script through: nix develop --command ./nix/update-deps.sh" >&2
  exit 1
fi

update_script="$(
  nix-build --no-out-link --expr '
    let
      pkgs = import <nixpkgs> { system = "x86_64-linux"; };
      src = pkgs.lib.cleanSource ./.;
    in
      (pkgs.callPackage ./nix/package.nix { inherit src; }).mitmCache.updateScript
  '
)"

# GitHub-hosted runners may disallow user namespaces; update-deps uses the
# MITM cache proxy regardless, so disabling only its optional bwrap sandbox is
# safe in this controlled CI environment.
USE_BWRAP="${USE_BWRAP:-0}" "$update_script"
