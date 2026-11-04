{
  description = "BitChord — native YouTube Music client for Linux";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };
      bitchord = pkgs.callPackage ./nix/package.nix {
        src = self;
      };
    in
    {
      packages.${system} = {
        default = bitchord;
        bitchord = bitchord;
      };

      apps.${system}.default = {
        type = "app";
        program = "${bitchord}/bin/bitchord";
      };

      # The dependency bootstrap script uses this locked Nixpkgs checkout when
      # importing package.nix directly, so its generated deps.json matches CI.
      devShells.${system}.default = pkgs.mkShell {
        packages = [ pkgs.nix ];
        shellHook = ''
          export NIX_PATH="nixpkgs=${nixpkgs.outPath}"
        '';
      };
    };
}
