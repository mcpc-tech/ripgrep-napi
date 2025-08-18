{
  description = "http-status";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            cargo
            rustc
            rustfmt
            stdenv.cc
            openssl
            pkg-config
          ];

          shellHook = ''
            export RUST_SRC_PATH="${pkgs.rustPlatform.rustLibSrc}";
          '';
        };
      });
}
