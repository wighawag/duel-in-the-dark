const { setupCircuit } = require("./Circuit");

module.exports = {
  setupGame() {
    let circuit = setupCircuit();
    let state = {
      public: {
        current_shot: 0,
      },
      state: {
        currentPlayer: 0,
        players: [
          {
            life: 2,
            previous_commit_hash: 0,
          },
          {
            life: 2,
            previous_commit_hash: 0,
          },
        ],
      },
    };

    async function move(situation) {
      const { secretState, revealed, secretAction, publicAction } = situation;
      // TODO get move from room
      const fullProof = await circuit.generateProof({
        // this is established
        publicState: {
          enemy_shot: state.public.current_shot,
        },
        // this is revealed once the proof is submitted
        revealed,
        // this is kept hidden, except that an hit reveal it anyway
        secretState,
        // this is a new hiddent action
        secretAction,
      });
      await circuit.verifyProof(fullProof);

      console.log(`proof verified, applying state...`);

      const playerIndex = state.state.currentPlayer;
      const previousPlayerIndex = 1 - playerIndex;
      const player = state.state.players[playerIndex];
      if (revealed.hit) {
        console.log(` player ${playerIndex + 1} was hit `);
        player.life--;
      }
      if (player.life <= 0) {
        console.log(`GAME OVER, player ${state.state.currentPlayer + 1} lose!`);
      } else {
        state.state.currentPlayer = previousPlayerIndex;
        state.public.current_shot = publicAction.shot;
      }
    }
    return {
      state,
      move,
    };
  },
};
