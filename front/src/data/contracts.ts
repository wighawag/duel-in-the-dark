export default {
  "Game": {
    "abi": [
      {
        "name": null,
        "type": "constructor",
        "inputs": [],
        "payable": false,
        "stateMutability": "nonpayable",
        "gas": null,
        "_isFragment": true
      },
      {
        "type": "function",
        "name": "acceptAndMove",
        "constant": false,
        "inputs": [
          {
            "name": "prevHash",
            "type": "uint256",
            "indexed": null,
            "components": null,
            "arrayLength": null,
            "arrayChildren": null,
            "baseType": "uint256",
            "_isParamType": true
          },
          {
            "name": "proof",
            "type": "bytes",
            "indexed": null,
            "components": null,
            "arrayLength": null,
            "arrayChildren": null,
            "baseType": "bytes",
            "_isParamType": true
          },
          {
            "name": "hit",
            "type": "bool",
            "indexed": null,
            "components": null,
            "arrayLength": null,
            "arrayChildren": null,
            "baseType": "bool",
            "_isParamType": true
          },
          {
            "name": "new_hash",
            "type": "uint256",
            "indexed": null,
            "components": null,
            "arrayLength": null,
            "arrayChildren": null,
            "baseType": "uint256",
            "_isParamType": true
          },
          {
            "name": "shot",
            "type": "uint8",
            "indexed": null,
            "components": null,
            "arrayLength": null,
            "arrayChildren": null,
            "baseType": "uint8",
            "_isParamType": true
          }
        ],
        "outputs": [],
        "payable": true,
        "stateMutability": "payable",
        "gas": {
          "type": "BigNumber",
          "hex": "0x01ba8140"
        },
        "_isFragment": true
      },
      {
        "type": "function",
        "name": "enemy_shot",
        "constant": true,
        "inputs": [],
        "outputs": [
          {
            "name": null,
            "type": "uint8",
            "indexed": null,
            "components": null,
            "arrayLength": null,
            "arrayChildren": null,
            "baseType": "uint8",
            "_isParamType": true
          }
        ],
        "payable": false,
        "stateMutability": "view",
        "gas": {
          "type": "BigNumber",
          "hex": "0x01ba8140"
        },
        "_isFragment": true
      },
      {
        "type": "function",
        "name": "move",
        "constant": false,
        "inputs": [
          {
            "name": "proof",
            "type": "bytes",
            "indexed": null,
            "components": null,
            "arrayLength": null,
            "arrayChildren": null,
            "baseType": "bytes",
            "_isParamType": true
          },
          {
            "name": "hit",
            "type": "bool",
            "indexed": null,
            "components": null,
            "arrayLength": null,
            "arrayChildren": null,
            "baseType": "bool",
            "_isParamType": true
          },
          {
            "name": "new_hash",
            "type": "uint256",
            "indexed": null,
            "components": null,
            "arrayLength": null,
            "arrayChildren": null,
            "baseType": "uint256",
            "_isParamType": true
          },
          {
            "name": "shot",
            "type": "uint8",
            "indexed": null,
            "components": null,
            "arrayLength": null,
            "arrayChildren": null,
            "baseType": "uint8",
            "_isParamType": true
          }
        ],
        "outputs": [],
        "payable": false,
        "stateMutability": "nonpayable",
        "gas": {
          "type": "BigNumber",
          "hex": "0x01ba8140"
        },
        "_isFragment": true
      },
      {
        "type": "function",
        "name": "players",
        "constant": true,
        "inputs": [
          {
            "name": null,
            "type": "uint256",
            "indexed": null,
            "components": null,
            "arrayLength": null,
            "arrayChildren": null,
            "baseType": "uint256",
            "_isParamType": true
          }
        ],
        "outputs": [
          {
            "name": "previous_hash",
            "type": "uint256",
            "indexed": null,
            "components": null,
            "arrayLength": null,
            "arrayChildren": null,
            "baseType": "uint256",
            "_isParamType": true
          },
          {
            "name": "addr",
            "type": "address",
            "indexed": null,
            "components": null,
            "arrayLength": null,
            "arrayChildren": null,
            "baseType": "address",
            "_isParamType": true
          },
          {
            "name": "numHit",
            "type": "uint8",
            "indexed": null,
            "components": null,
            "arrayLength": null,
            "arrayChildren": null,
            "baseType": "uint8",
            "_isParamType": true
          }
        ],
        "payable": false,
        "stateMutability": "view",
        "gas": {
          "type": "BigNumber",
          "hex": "0x01ba8140"
        },
        "_isFragment": true
      },
      {
        "type": "function",
        "name": "start",
        "constant": false,
        "inputs": [
          {
            "name": "locationHash",
            "type": "uint256",
            "indexed": null,
            "components": null,
            "arrayLength": null,
            "arrayChildren": null,
            "baseType": "uint256",
            "_isParamType": true
          }
        ],
        "outputs": [],
        "payable": true,
        "stateMutability": "payable",
        "gas": {
          "type": "BigNumber",
          "hex": "0x01ba8140"
        },
        "_isFragment": true
      },
      {
        "type": "function",
        "name": "turn",
        "constant": true,
        "inputs": [],
        "outputs": [
          {
            "name": null,
            "type": "uint256",
            "indexed": null,
            "components": null,
            "arrayLength": null,
            "arrayChildren": null,
            "baseType": "uint256",
            "_isParamType": true
          }
        ],
        "payable": false,
        "stateMutability": "view",
        "gas": {
          "type": "BigNumber",
          "hex": "0x01ba8140"
        },
        "_isFragment": true
      },
      {
        "type": "function",
        "name": "withdraw",
        "constant": false,
        "inputs": [],
        "outputs": [],
        "payable": false,
        "stateMutability": "nonpayable",
        "gas": {
          "type": "BigNumber",
          "hex": "0x01ba8140"
        },
        "_isFragment": true
      }
    ],
    "address": "0x5FbDB2315678afecb367f032d93F642f64180aa3"
  }
} as const;