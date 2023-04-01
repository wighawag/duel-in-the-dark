import React, { useState } from "react";
import styles from "@/styles/Home.module.scss";
import "../styles/ship.module.scss";
function Ship() {
  const [rooms, setRooms] = useState({
    current:1,
    selected: -1
  });

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="100vw"
      height="auto"
      fill="none"
      viewBox="0 0 2324 1774"
    >
      <g>
        <path fill="#000" d="M0 0H2324V1774H0z"></path>
        <g>
          <g className={styles.room}>
            <path
              className={styles.room}
              fill={rooms.selected == 8 ? "#FF00FF" : "#D9D9D9"}
              onClick={() => setRooms({...rooms, selected: 8})}
              d="M421.5 654.5l201 767.5H306L136 654.5h285.5z"
            ></path>
            {/* <path
              fill="#898181"
              d="M376 731.5l212.5 660-257.5 9-113-680.145L376 731.5z"
            ></path> */}
          </g>
          <path
            className={styles.room}
            fill={rooms.selected == 1 ? "#FF00FF" : "#D9D9D9"}
            onClick={() => setRooms({...rooms, selected: 1})}


            stroke="#000"
            strokeWidth="0.2"
            d="M502.793 657.1h389.633l120.444 393.8H602.078l-99.285-393.8z"
          ></path>
          <path
            className={styles.room}
            fill={rooms.selected == 2 ? "#FF00FF" : "#D9D9D9"}
            onClick={() => setRooms({...rooms, selected: 2})}
            stroke="#000"
            strokeWidth="0.2"
            d="M606.126 1089.26h664.804l94.44 320H679.416l-73.29-320z"
          ></path>
          <path
            className={styles.room}
            fill={rooms.selected == 3 ? "#FF00FF" : "#D9D9D9"}
            onClick={() => setRooms({...rooms, selected: 3})}
            stroke="#000"
            strokeWidth="0.2"
            d="M957.133 657.1h253.307l183.4 383.95-323.27 7.85-113.437-391.8z"
          ></path>
          <path
            className={styles.room}
            fill={rooms.selected == 4 ? "#FF00FF" : "#D9D9D9"}
            onClick={() => setRooms({...rooms, selected: 4})}

            d="M1890 464l160.96 163.993-374.99 2.553-61.99-105.023L1194 430.5l358-10 338 43.5z"
          ></path>
          <path
            className={styles.room}
            fill={rooms.selected == 5 ? "#FF00FF" : "#D9D9D9"}
            onClick={() => setRooms({...rooms, selected: 5})}

            d="M2063.49 645.908L2182.5 817l-396 19.904-98-188.442 374.99-2.554z"
          ></path>
          <path
            className={styles.room}
            fill={rooms.selected == 6 ? "#FF00FF" : "#D9D9D9"}
            onClick={() => setRooms({...rooms, selected: 6})}

            d="M2137 1210l49.5-368.5-379.5 21 54 126.5-355 27-104 264 503-47 232-23z"
          ></path>
          <path
            className={styles.room}
            fill={rooms.selected == 7 ? "#FF00FF" : "#D9D9D9"}
            onClick={() => setRooms({...rooms, selected: 7})}

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
