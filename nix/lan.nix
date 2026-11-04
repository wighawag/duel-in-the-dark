# duel-in-the-dark for a LAN box (github:wighawag/ethereum-lan-node), in the
# shape its game module expects:
#
#   $out/web/            the SvelteKit static build
#   $out/bin/duel-deploy  puts the contracts on the box's chain, idempotently
#   passthru.lan          how the box should run it (no server: the game is
#                         the chain plus the page)
#
# Built with NO network, like every Nix build, which is the point: nothing the
# game needs at play time may come from the internet either.
#
# - Solidity: hardhat would download solc; it is given the official 0.8.28
#   WASM build instead (SOLC_PATH, see contracts/hardhat.config.ts): the same
#   compiler, so the same bytecode.
# - Addresses: the contracts are deployed at BUILD time into a throwaway chain
#   with the box's chain id (contracts/scripts/deploy-lan-build.ts). Every one
#   goes through the CREATE2 factory the box's genesis predeploys, so the box
#   gets the same addresses; the web app is built with them, and
#   `duel-deploy` replays the recorded transactions on the box
#   (nix/lan-deploy.sh).
# - Proving: the CRS is committed (circuits/crs), so the browser never fetches
#   it from Aztec's CDN.
# - URLs: web/.env.lan names only same-host urls (`//:8545`, the faucet at
#   `//:34010`), so one build works on the hotspot, on a venue network and by
#   name.
{
  src,
  rev,
  lib,
  stdenv,
  fetchurl,
  nodejs_24,
  pnpm_10,
  fetchPnpmDeps,
  pnpmConfigHook,
  writeShellApplication,
  foundry,
  jq,
}: let
  pnpm = pnpm_10;

  # The official WASM build of solc 0.8.28 (https://binaries.soliditylang.org/wasm/list.json,
  # whose sha256 this is): the same compiler as the native build hardhat would
  # download, with nothing to patch. (The native build wants /lib64's loader,
  # and once patched hardhat's binary-or-wasm sniffing takes it for text.)
  solc = fetchurl {
    url = "https://binaries.soliditylang.org/wasm/soljson-v0.8.28+commit.7893614a.js";
    hash = "sha256-cu9YCm7FlDEwAo5SlDE/JOlDVSCsyJ+Mnb/QE52a4UY=";
  };

  /** The box's chain id: ethereum-lan-node's nix/genesis.json. */
  chainId = 19216801;
in
  stdenv.mkDerivation (finalAttrs: {
    pname = "duel-in-the-dark-lan";
    version = "0.0.0";
    inherit src;

    nativeBuildInputs = [nodejs_24 pnpm pnpmConfigHook];

    pnpmDeps = fetchPnpmDeps {
      inherit (finalAttrs) pname version src;
      inherit pnpm;
      fetcherVersion = 3;
      hash = "sha256-61df33KmV7ThoFks+DSZsGR0Sfxs5bSQiLDYZZdbAeI=";
    };

    env = {
      LAN_CHAIN_ID = toString chainId;
      HARDHAT_DISABLE_TELEMETRY_PROMPT = "true";
      # package.json pins pnpm@10.28.1, which pnpm would otherwise download to
      # run itself as; the one nixpkgs gives is a 10 too.
      npm_config_manage_package_manager_versions = "false";
    };

    buildPhase = ''
      runHook preBuild
      export HOME=$TMPDIR
      export SOLC_PATH=${solc}

      # The prover, and what the contracts' deploy reads from it.
      pnpm --filter ./circuits exec tsc

      # The contracts, deployed into a throwaway chain with the box's chain id;
      # the transactions are kept for duel-deploy, the records exported to the app.
      pushd contracts
      pnpm exec hardhat compile --build-profile production
      LAN_TRANSACTIONS=$TMPDIR/lan.transactions.json \
        pnpm exec hardhat run --build-profile production scripts/deploy-lan-build.ts
      pnpm exec rocketh-export -e lan --ts ../web/src/lib/deployments.ts
      popd

      pushd web
      # svelte.config.js names the build after `git rev-parse`, falling back to a
      # timestamp that each build process computes differently, and then the
      # prerendered HTML names another build than its JS and never hydrates (as
      # found in conquest-demo's nix/lan.nix). There is no git here: pin it.
      substituteInPlace svelte.config.js \
        --replace-fail 'let VERSION = `timestamp_''${Date.now()}`;' 'let VERSION = "${rev}";'
      # PWA icons: cosmetic on a LAN (no service worker over plain http).
      pnpm generate-pwa-icons || echo "duel-in-the-dark: pwa icons skipped"
      pnpm exec svelte-kit sync
      pnpm exec vite build --mode lan
      popd
      runHook postBuild
    '';

    installPhase = let
      deploy = writeShellApplication {
        name = "duel-deploy";
        runtimeInputs = [foundry jq];
        text = builtins.readFile ./lan-deploy.sh;
      };
    in ''
      runHook preInstall
      mkdir -p $out/bin $out/share/duel-in-the-dark
      cp -r web/build $out/web
      cp $TMPDIR/lan.transactions.json $out/share/duel-in-the-dark/
      cat > $out/bin/duel-deploy <<EOF
      #!${stdenv.shell}
      export TRANSACTIONS=$out/share/duel-in-the-dark/lan.transactions.json
      exec ${deploy}/bin/duel-deploy "\$@"
      EOF
      chmod +x $out/bin/duel-deploy
      runHook postInstall
    '';

    passthru.lan = {
      title = "Duel in the Dark";
      description = "Two players hunt each other through a dark ship; every move proven in zero knowledge.";
      # SvelteKit's SPA shell for routes that were not prerendered.
      fallback = "/404.html";
      deploy.bin = "duel-deploy";
    };

    meta = {
      license = lib.licenses.agpl3Only;
      platforms = ["x86_64-linux"];
    };
  })
