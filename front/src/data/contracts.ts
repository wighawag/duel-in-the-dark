export default {
  "Game": {
    "abi": [
      {
        "inputs": [],
        "stateMutability": "nonpayable",
        "type": "constructor"
      },
      {
        "inputs": [
          {
            "internalType": "uint256",
            "name": "prevHash",
            "type": "uint256"
          },
          {
            "internalType": "bytes",
            "name": "proof",
            "type": "bytes"
          },
          {
            "internalType": "bool",
            "name": "hit",
            "type": "bool"
          },
          {
            "internalType": "uint256",
            "name": "new_hash",
            "type": "uint256"
          },
          {
            "internalType": "uint8",
            "name": "shot",
            "type": "uint8"
          }
        ],
        "name": "acceptAndMove",
        "outputs": [],
        "stateMutability": "payable",
        "type": "function"
      },
      {
        "inputs": [],
        "name": "enemy_shot",
        "outputs": [
          {
            "internalType": "uint8",
            "name": "",
            "type": "uint8"
          }
        ],
        "stateMutability": "view",
        "type": "function"
      },
      {
        "inputs": [
          {
            "internalType": "bytes",
            "name": "proof",
            "type": "bytes"
          },
          {
            "internalType": "bool",
            "name": "hit",
            "type": "bool"
          },
          {
            "internalType": "uint256",
            "name": "new_hash",
            "type": "uint256"
          },
          {
            "internalType": "uint8",
            "name": "shot",
            "type": "uint8"
          }
        ],
        "name": "move",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
      },
      {
        "inputs": [
          {
            "internalType": "uint256",
            "name": "",
            "type": "uint256"
          }
        ],
        "name": "players",
        "outputs": [
          {
            "internalType": "uint256",
            "name": "previous_hash",
            "type": "uint256"
          },
          {
            "internalType": "address payable",
            "name": "addr",
            "type": "address"
          },
          {
            "internalType": "uint8",
            "name": "numHit",
            "type": "uint8"
          }
        ],
        "stateMutability": "view",
        "type": "function"
      },
      {
        "inputs": [
          {
            "internalType": "uint256",
            "name": "locationHash",
            "type": "uint256"
          }
        ],
        "name": "start",
        "outputs": [],
        "stateMutability": "payable",
        "type": "function"
      },
      {
        "inputs": [],
        "name": "turn",
        "outputs": [
          {
            "internalType": "uint256",
            "name": "",
            "type": "uint256"
          }
        ],
        "stateMutability": "view",
        "type": "function"
      },
      {
        "inputs": [],
        "name": "withdraw",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
      }
    ],
    "address": "0x5FbDB2315678afecb367f032d93F642f64180aa3"
  }
} as const;