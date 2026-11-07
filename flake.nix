{
  description = "template-zk-game: the Noir toolchain for circuits, pinned so that nargo and the JS prover agree";

  # WHY A FLAKE. nargo, @noir-lang/noir_js and @aztec/bb.js must agree on the
  # circuit artifact format, and a mismatch fails with cryptic errors at proving
  # time rather than at install time. The npm side is pinned by the lockfile;
  # this pins the nargo side. Bump NOIR_VERSION here and @noir-lang/noir_js in
  # the circuits package together, never one without the other.
  #
  # Node and pnpm are deliberately NOT provided: the rest of the template tree
  # leaves them to the host, and a devshell that shadowed them would make this
  # repo the odd one out.
  #
  # The LAN package (`nix build .#lan`) is ethereum-lan-node's: its
  # lib.mkRockethGame builds it, from this repo and nix/game.nix (see "On a LAN
  # box, with no internet" in README.md).

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    ethereum-lan-node = {
      url = "github:wighawag/ethereum-lan-node";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      ethereum-lan-node,
    }:
    let
      noirVersion = "1.0.0";

      # Official release tarballs. Hashes from nix-prefetch-url + nix hash convert.
      noirReleases = {
        x86_64-linux = {
          target = "x86_64-unknown-linux-gnu";
          hash = "sha256-pi9bRKbbjKjwwg+EGqeI6lZ3blqvLr1nLALc85eQEmQ=";
        };
        aarch64-linux = {
          target = "aarch64-unknown-linux-gnu";
          hash = "sha256-tK1lIaWAxXZUjx/IJA1/KyRatWmp6N3jPsDda4zVUFY=";
        };
        x86_64-darwin = {
          target = "x86_64-apple-darwin";
          hash = "sha256-po8IxlbXsuAWD+7kGU/up5DUnlgrQLhzpy3IRz1z1k8=";
        };
        aarch64-darwin = {
          target = "aarch64-apple-darwin";
          hash = "sha256-rCFm/Ab+KJ/SUk+eudoihVAVnJduiMEBO/xtDgtKIwk=";
        };
      };

      forAllSystems = f: nixpkgs.lib.genAttrs (builtins.attrNames noirReleases) (system: f system);
    in
    {
      packages = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          release = noirReleases.${system};
        in
        {
          nargo = pkgs.stdenv.mkDerivation {
            pname = "nargo";
            version = noirVersion;
            src = pkgs.fetchurl {
              url = "https://github.com/noir-lang/noir/releases/download/v${noirVersion}/noir-${release.target}.tar.gz";
              inherit (release) hash;
            };
            sourceRoot = ".";
            # The linux binaries link only glibc and libgcc; patch them for NixOS.
            nativeBuildInputs = pkgs.lib.optionals pkgs.stdenv.hostPlatform.isLinux [ pkgs.autoPatchelfHook ];
            buildInputs = pkgs.lib.optionals pkgs.stdenv.hostPlatform.isLinux [ pkgs.stdenv.cc.cc.lib ];
            dontConfigure = true;
            dontBuild = true;
            installPhase = ''
              runHook preInstall
              mkdir -p $out/bin
              install -m755 nargo noir-execute noir-inspector noir-profiler $out/bin/
              runHook postInstall
            '';
          };
          default = self.packages.${system}.nargo;
        }
        # The game packaged for a LAN box (github:wighawag/ethereum-lan-node),
        # by its lib.mkRockethGame. x86_64-linux only, as the box is.
        // pkgs.lib.optionalAttrs (system == "x86_64-linux") {
          lan = ethereum-lan-node.lib.mkRockethGame pkgs (
            {
              src = self;
              rev = self.shortRev or self.dirtyShortRev or "unknown";
            }
            // import ./nix/game.nix
          );
        }
      );

      devShells = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        {
          default = pkgs.mkShell {
            packages = [ self.packages.${system}.nargo ];
            shellHook = ''
              echo "nargo $(nargo --version | head -1 | cut -d' ' -f4) (pinned in flake.nix)"
            '';
          };
        }
      );
    };
}
