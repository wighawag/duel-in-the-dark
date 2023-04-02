import React, { useState } from "react";
import styles from "@/styles/Home.module.scss";
import "../styles/ship.module.scss";

const adj = [
  0,2,5,0,
  0,3,4,1,
  0,0,8,2,
  2,0,7,0,
  1,7,6,0,
  5,7,8,0,
  4,8,6,5,
  7,3,0,6]
function Ship() {
  const [rooms, setRooms] = useState({
    current: 3,
    selected: -1,
  });

  function checkAdjacent(index:number){
    for (let i = 0; i < 4; i++){
      if(adj[((rooms.current - 1) * 4) + i] === index){
        return true
      }
    }
    return false
  }

  function setFill(index: number) {
    if ((rooms.selected === index)) return "#FFFFFF";
    if ((rooms.current === index)) return "#FF00FF"
    if(checkAdjacent(index) == true) return "#A9A9A9";
    return "#494949"
  }

  function setSelectedRoom(index: number) {
    if (rooms.current != index && checkAdjacent(index)) {
      setRooms({ ...rooms, selected: index });
    }
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="80vw"
      height="auto"
      fill="none"
      viewBox="0 0 2324 1774"
    >
      <g>
        <path fill="#000" d="M0 0H2324V1774H0z"></path>
        <g>
          <g>
            <path
              className={checkAdjacent(8) ? styles.room : ""}
              fill={setFill(8)}
              stroke={setFill(8)}
              onClick={() => setSelectedRoom(8)}
              d="M421.5 654.5l201 767.5H306L136 654.5h285.5z"
            ></path>
            {/* <path
              fill="#898181"
              d="M376 731.5l212.5 660-257.5 9-113-680.145L376 731.5z"
            ></path> */}
          </g>
          <path
            className={checkAdjacent(6) ? styles.room : ""}
            fill={setFill(6)}
            stroke={setFill(6)}

            onClick={() => setSelectedRoom(6)}
            strokeWidth="0.2"
            d="M502.793 657.1h389.633l120.444 393.8H602.078l-99.285-393.8z"
          ></path>
          <path
            className={checkAdjacent(7) ? styles.room : ""}
            fill={setFill(7)}
            stroke={setFill(7)}
            
            onClick={() => setSelectedRoom(7)}
            strokeWidth="0.2"
            d="M606.126 1089.26h664.804l94.44 320H679.416l-73.29-320z"
          ></path>
          <path
            className={checkAdjacent(5) ? styles.room : ""}
            fill={setFill(5)}
            stroke={setFill(5)}

            onClick={() => setSelectedRoom(5)}
            strokeWidth="0.2"
            d="M957.133 657.1h253.307l183.4 383.95-323.27 7.85-113.437-391.8z"
          ></path>
          <path
            className={checkAdjacent(1) ? styles.room : ""}
            fill={setFill(1)}
            stroke={setFill(1)}

            onClick={() => setSelectedRoom(1)}
            d="M1890 464l160.96 163.993-374.99 2.553-61.99-105.023L1194 430.5l358-10 338 43.5z"
          ></path>
          <path
            className={checkAdjacent(2) ? styles.room : ""}
            fill={setFill(2)}
            stroke={setFill(2)}

            onClick={() => setSelectedRoom(2)}
            d="M2063.49 645.908L2182.5 817l-396 19.904-98-188.442 374.99-2.554z"
          ></path>
          <path
            className={checkAdjacent(3) ? styles.room : ""}
            // fill={setFill(3)}
            strokeWidth={10}
            fill={"#FF00FF"}
            stroke={setFill(3)}

            onClick={() => setSelectedRoom(3)}
            d="M2137 1210l49.5-368.5-379.5 21 54 126.5-355 27-104 264 503-47 232-23z"
          ></path>
          <path
            className={checkAdjacent(4) ? styles.room : ""}
            fill={setFill(4)}
            stroke={setFill(4)}

            onClick={() => setSelectedRoom(4)}
            d="M1593.5 570l225.5 432.5-277.36 19.57L1353 570h240.5z"
          ></path>
        </g>
        <g>
          <g>
            <path
              fill="#B3ABAB"
              d="M1342 930l-33-61h19l35 61h-21zM1386 914l-33-61h19l35 61h-21zM1427 884l-33-61h19l35 61h-21zM1468 869l-33-61h19l35 61h-21z"
            ></path>
            <path
              stroke="#000"
              strokeWidth="0.2"
              d="M1342 930l-33-61h19l35 61h-21zM1386 914l-33-61h19l35 61h-21zM1427 884l-33-61h19l35 61h-21zM1468 869l-33-61h19l35 61h-21z"
            ></path>
          </g>
          <g>
            <path
              fill="#B3ABAB"
              d="M1770.5 772l-33-61h19l35 61h-21zM1739 779l-33-61h19l35 61h-21zM1707 788l-33-61h19l35 61h-21zM1685 809l-33-61h19l35 61h-21z"
            ></path>
            <path
              stroke="#000"
              strokeWidth="0.2"
              d="M1770.5 772l-33-61h19l35 61h-21zM1739 779l-33-61h19l35 61h-21zM1707 788l-33-61h19l35 61h-21zM1685 809l-33-61h19l35 61h-21z"
            ></path>
          </g>
        </g>
        <g fill="#F2B7B7">
          <path d="M1445 379h95v38h-95v-38z"></path>
          <path d="M332 1363h95v38h-95v-38z"></path>
          <path d="M1756.5 957l98.5-10v38l-98.5 10v-38z"></path>
          <path d="M1107 607h95v38h-95v-38z"></path>
          <path d="M669 1285l29 86.5v38l-29-86.5v-38z"></path>
          <path d="M593 1285l29 86.5v38l-29-86.5v-38z"></path>
        </g>
      </g>
    </svg>
  );
}

export default Ship;
