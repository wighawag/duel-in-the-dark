# This game's identity as a LAN-box package (nix/lan.nix): the little that
# nix/lan.nix cannot work out by itself.
#
# PER REPO. Every repo of the template tree inherits this file and sets its own
# values. When a merge from the template conflicts here, keep yours (and, for
# the hash, recompute it as below): nothing in this file is meant to cascade.
{
  # fetchPnpmDeps' hash of the packages pnpm-lock.yaml names. After any
  # lockfile change, including one merged from the template, set it to
  # sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= and run
  #
  #   nix build git+file://$PWD#lan.pnpmDeps
  #
  # which fails with the right value ("got: sha256-..."). Do not rely on a
  # build passing: Nix trusts a hash it has already seen, so on a machine that
  # built the template, a descendant's stale hash quietly gets the TEMPLATE's
  # packages. Two lockfiles can also name the same packages, and so share a
  # hash.
  pnpmDepsHash = "sha256-61df33KmV7ThoFks+DSZsGR0Sfxs5bSQiLDYZZdbAeI=";

  # The prover's JS (circuits/dist), which the contracts' deploy (the
  # verifiers) and the web app import.
  preBuild = "pnpm --filter ./circuits exec tsc";

  # What the box (my-boxes' event box) already runs, kept as it was before
  # this package was generic: its deploy unit runs `duel-deploy`, and its
  # landing page shows this description.
  deployBin = "duel-deploy";
  description = "Two players hunt each other through a dark ship; every move proven in zero knowledge.";

  # Optional, shown with their defaults:
  #
  # name = <the root package.json's "name">;   the package is "<name>-lan"
  # title = <web/src/web-config.json's "title">;
  # description = <web/src/web-config.json's "description">;   set above
  # deployBin = "<name>-deploy";               what the box runs to deploy: set above
  # preBuild = "";   shell, run from the repo root before the contracts are
  #                  compiled (what they or the web app need built first):
  #                  set above
}
