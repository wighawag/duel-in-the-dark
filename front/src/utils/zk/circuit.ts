import * as snarkjs from "snarkjs";
import * as circomlibjs from "circomlibjs";
import { solidityProof } from "./contracts";

export type Values = {
  enemy_shot: number;
  hit: 1 | 0;
  previous_commit_hash: string;

  // previous_salt: secretState.previous_salt,
  previous_location: number;
  move: number;
  // new_salt: secretAction.new_salt,
  new_location: number;
};

export async function generateProof(values: Values): Promise<string> {
  const fullProof = await snarkjs.plonk.fullProve(
    {
      enemy_shot: values.enemy_shot,
      hit: values.hit,
      previous_commit_hash: values.previous_commit_hash,

      previous_salt: 0, // TODO TODO values.previous_salt,
      previous_location: values.previous_location,
      move: values.move,
      new_salt: 0, // TODO values.new_salt,
      new_location: values.new_location,
    },
    "circuit.wasm",
    "circuit_final.zkey"
  );

  return solidityProof(fullProof);
}
