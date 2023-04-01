import { useState } from "react";
import { useAccount, useConnect } from "wagmi";
import { InjectedConnector } from "wagmi/connectors/injected";
import styles from "@/styles/Home.module.scss";

import Ship from "./Ship";
import Image from "next/image";

export function Game() {
  const [gameState, setGameState] = useState<
    "begin" | "waiting" | "during" | "win" | "lose"
  >("begin");
  const { address, isConnected } = useAccount();
  const { connect } = useConnect({ connector: new InjectedConnector() });

  const beginGame = () =>{
    if(address)
      setGameState("waiting")
    else
      alert("You need to be connected to begin a game")
  }

  if (gameState == "begin") {
    return (
      <div className={styles.primaryButton} onClick={beginGame} style={{color:`${address? "white" : "gray"}`}}>
        BEGIN GAME
      </div>
    );
  } else if (gameState == "waiting") {
    return (
      <div className={styles.waiting}>
        <h1>Waiting for the other player ...</h1>
        <h3>It shouldn't be long</h3>
        <div className={styles.imgContainer}>
          <div className={styles.blur}></div>
          <Image
            src="/duel-in-the-dark.png"
            alt="duel in the dark"
            fill={true}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <Ship />
    </div>
  );
}
