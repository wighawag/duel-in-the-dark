// import * as snarkjs from "snarkjs";

import * as circomlibjs from "circomlibjs";
import { generateProof } from "./circuit";

export async function solidityProof(fullProof: {
  proof: unknown;
  publicSignals: unknown[];
}): Promise<string> {
  const calldata = await (window as any).plonk.exportSolidityCallData(
    fullProof.proof,
    fullProof.publicSignals
  );
  const actualProof = calldata.slice(0, calldata.indexOf(","));
  return actualProof;
}

export async function createGame(firstLocation: number) {
  const first_location = firstLocation;
  const first_poseidon = await circomlibjs.buildPoseidon();
  const first_hash = first_poseidon.F.toString(
    first_poseidon([0, first_location])
  );
  return {
    first_hash: first_hash,
  };
}

export async function join_and_make_move(values: MoveValues, shot: number) {
  const { previous_location, move, new_location, hit, enemy_shot } = values;

  let poseidon = await circomlibjs.buildPoseidon();
  const previous_commit_hash = poseidon.F.toString(
    poseidon([0, previous_location])
  );
  poseidon = await circomlibjs.buildPoseidon();
  const new_commit_hash = poseidon.F.toString(poseidon([0, new_location]));

  const solProof = await generateProof({
    enemy_shot,
    hit: previous_location === enemy_shot ? 1 : 0,
    previous_commit_hash,
    previous_location,
    move, // TODO from previous_location and new_location ?
    new_location,
  });

  return {
    previous_commit_hash,
    solProof,
    hit,
    new_commit_hash,
    shot,
  };
}

export type MoveValues = {
  enemy_shot: number;
  hit: boolean;
  previous_commit_hash: string;
  previous_location: number;
  move: number;
  new_location: number;
};

export type MoveArgs = {
  solProof: string;
  hit: boolean;
  new_commit_hash: string;
  shot: number;
};

export async function make_move(
  values: MoveValues,
  shot: number
): Promise<MoveArgs> {
  const {
    previous_location,
    previous_commit_hash,
    move,
    new_location,
    hit,
    enemy_shot,
  } = values;

  const poseidon = await circomlibjs.buildPoseidon();
  const new_commit_hash = poseidon.F.toString(poseidon([0, new_location]));

  const solProof = await generateProof({
    enemy_shot,
    hit: previous_location === enemy_shot ? 1 : 0,
    previous_commit_hash,
    previous_location,
    move, // TODO from previous_location and new_location ?
    new_location,
  });

  return {
    solProof,
    hit,
    new_commit_hash,
    shot,
  };
}
