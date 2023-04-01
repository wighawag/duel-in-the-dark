const { setupGame } = require("./simulation/Simulation");

async function run() {
  const game = setupGame();

  await game.move({
    secretState: {
      previous_location: 1,
      previous_salt: 0,
    },
    revealed: {
      hit: 0,
    },
    secretAction: {
      move: 2,
      new_location: 5,
      new_salt: 0,
    },
    publicAction: {
      shot: 1,
    },
  });

  await game.move({
    secretState: {
      previous_location: 7,
      previous_salt: 0,
    },
    revealed: {
      hit: 0,
    },
    secretAction: {
      move: 1,
      new_location: 8,
      new_salt: 0,
    },
    publicAction: {
      shot: 5,
    },
  });

  await game.move({
    secretState: {
      previous_location: 5,
      previous_salt: 0,
    },
    revealed: {
      hit: 1,
    },
    secretAction: {
      move: 1,
      new_location: 7,
      new_salt: 0,
    },
    publicAction: {
      shot: 8,
    },
  });
}

run().then(() => {
  process.exit(0);
});
