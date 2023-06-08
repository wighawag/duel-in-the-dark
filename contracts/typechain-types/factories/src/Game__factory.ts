/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */
import {
  Contract,
  ContractFactory,
  ContractTransactionResponse,
  Interface,
} from "ethers";
import type { Signer, ContractDeployTransaction, ContractRunner } from "ethers";
import type { NonPayableOverrides } from "../../common";
import type { Game, GameInterface } from "../../src/Game";

const _abi = [
  {
    inputs: [],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "prevHash",
        type: "uint256",
      },
      {
        internalType: "bytes",
        name: "proof",
        type: "bytes",
      },
      {
        internalType: "bool",
        name: "hit",
        type: "bool",
      },
      {
        internalType: "uint256",
        name: "new_hash",
        type: "uint256",
      },
      {
        internalType: "uint8",
        name: "shot",
        type: "uint8",
      },
    ],
    name: "acceptAndMove",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [],
    name: "enemy_shot",
    outputs: [
      {
        internalType: "uint8",
        name: "",
        type: "uint8",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes",
        name: "proof",
        type: "bytes",
      },
      {
        internalType: "bool",
        name: "hit",
        type: "bool",
      },
      {
        internalType: "uint256",
        name: "new_hash",
        type: "uint256",
      },
      {
        internalType: "uint8",
        name: "shot",
        type: "uint8",
      },
    ],
    name: "move",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    name: "players",
    outputs: [
      {
        internalType: "uint256",
        name: "previous_hash",
        type: "uint256",
      },
      {
        internalType: "address payable",
        name: "addr",
        type: "address",
      },
      {
        internalType: "uint8",
        name: "numHit",
        type: "uint8",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "locationHash",
        type: "uint256",
      },
    ],
    name: "start",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [],
    name: "turn",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "withdraw",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const _bytecode =
  "0x60a060405234801561000f575f80fd5b5060405161001c9061006e565b604051809103905ff080158015610035573d5f803e3d5ffd5b5073ffffffffffffffffffffffffffffffffffffffff1660808173ffffffffffffffffffffffffffffffffffffffff168152505061007b565b6121a58061152b83390190565b6080516114986100935f395f61095a01526114985ff3fe60806040526004361061006f575f3560e01c8063bbd5c1c21161004d578063bbd5c1c2146100cf578063d0d330b1146100f7578063f71d96cb14610113578063ff5d662a146101515761006f565b80633ccfd60b146100735780638b2999031461008957806395805dad146100b3575b5f80fd5b34801561007e575f80fd5b5061008761017b565b005b348015610094575f80fd5b5061009d6102c8565b6040516100aa9190610b40565b60405180910390f35b6100cd60048036038101906100c89190610b8b565b6102ce565b005b3480156100da575f80fd5b506100f560048036038101906100f09190610c82565b6103f4565b005b610111600480360381019061010c9190610d06565b6105c1565b005b34801561011e575f80fd5b5061013960048036038101906101349190610b8b565b6107ea565b60405161014893929190610dea565b60405180910390f35b34801561015c575f80fd5b50610165610843565b6040516101729190610e1f565b60405180910390f35b5f60025f600281106101905761018f610e38565b5b6002020190505f60025f600281106101ab576101aa610e38565b5b600202019050600260ff168260010160149054906101000a900460ff1660ff161061023c57806001015f9054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff166108fc4790811502906040515f60405180830381858888f19350505050158015610236573d5f803e3d5ffd5b506102c4565b600260ff168160010160149054906101000a900460ff1660ff16106102c357816001015f9054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff166108fc4790811502906040515f60405180830381858888f193505050501580156102c1573d5f803e3d5ffd5b505b5b5050565b60015481565b5f73ffffffffffffffffffffffffffffffffffffffff1660026001600281106102fa576102f9610e38565b5b600202016001015f9054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1614610377576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161036e90610ebf565b60405180910390fd5b80600260016002811061038d5761038c610e38565b5b600202015f01819055503360026001600281106103ad576103ac610e38565b5b600202016001015f6101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff16021790555050565b5f60026001546104049190610f0a565b90505f6002826002811061041b5761041a610e38565b5b600202016040518060600160405290815f8201548152602001600182015f9054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020016001820160149054906101000a900460ff1660ff1660ff168152505090505f600154116104eb576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016104e290610f84565b60405180910390fd5b806020015173ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff161461055d576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161055490610fec565b60405180910390fd5b600260ff16816040015160ff16106105aa576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016105a190611054565b60405180910390fd5b6105b8818888888888610853565b50505050505050565b5f60015414610605576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016105fc906110bc565b60405180910390fd5b5f73ffffffffffffffffffffffffffffffffffffffff16600260016002811061063157610630610e38565b5b600202016001015f9054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16036106ae576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016106a590611124565b60405180910390fd5b5f60025f600281106106c3576106c2610e38565b5b600202016040518060600160405290815f8201548152602001600182015f9054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020016001820160149054906101000a900460ff1660ff1660ff1681525050905033816020019073ffffffffffffffffffffffffffffffffffffffff16908173ffffffffffffffffffffffffffffffffffffffff168152505086815f018181525050473410156107d3576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016107ca9061118c565b60405180910390fd5b6107e1818787878787610853565b50505050505050565b600281600281106107f9575f80fd5b600202015f91509050805f015490806001015f9054906101000a900473ffffffffffffffffffffffffffffffffffffffff16908060010160149054906101000a900460ff16905083565b5f8054906101000a900460ff1681565b5f60026001546108639190610f0a565b90505f600467ffffffffffffffff811115610881576108806111aa565b5b6040519080825280602002602001820160405280156108af5781602001602082028036833780820191505090505b50905083815f815181106108c6576108c5610e38565b5b6020026020010181815250505f8054906101000a900460ff1660ff16816001815181106108f6576108f5610e38565b5b6020026020010181815250508461090d575f610910565b60015b60ff168160028151811061092757610926610e38565b5b602002602001018181525050875f01518160038151811061094b5761094a610e38565b5b6020026020010181815250505f7f000000000000000000000000000000000000000000000000000000000000000073ffffffffffffffffffffffffffffffffffffffff16631e8e1e138989856040518463ffffffff1660e01b81526004016109b5939291906112e8565b602060405180830381865afa1580156109d0573d5f803e3d5ffd5b505050506040513d601f19601f820116820180604052508101906109f49190611333565b905080610a36576040517f08c379a0000000000000000000000000000000000000000000000000000000008152600401610a2d906113a8565b60405180910390fd5b8515610a5957886040018051809190610a4e906113f3565b60ff1660ff16815250505b84895f0181815250508860028460028110610a7757610a76610e38565b5b600202015f820151815f01556020820151816001015f6101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff16021790555060408201518160010160146101000a81548160ff021916908360ff160217905550905050835f806101000a81548160ff021916908360ff16021790555060015f815480929190610b189061141b565b9190505550505050505050505050565b5f819050919050565b610b3a81610b28565b82525050565b5f602082019050610b535f830184610b31565b92915050565b5f80fd5b5f80fd5b610b6a81610b28565b8114610b74575f80fd5b50565b5f81359050610b8581610b61565b92915050565b5f60208284031215610ba057610b9f610b59565b5b5f610bad84828501610b77565b91505092915050565b5f80fd5b5f80fd5b5f80fd5b5f8083601f840112610bd757610bd6610bb6565b5b8235905067ffffffffffffffff811115610bf457610bf3610bba565b5b602083019150836001820283011115610c1057610c0f610bbe565b5b9250929050565b5f8115159050919050565b610c2b81610c17565b8114610c35575f80fd5b50565b5f81359050610c4681610c22565b92915050565b5f60ff82169050919050565b610c6181610c4c565b8114610c6b575f80fd5b50565b5f81359050610c7c81610c58565b92915050565b5f805f805f60808688031215610c9b57610c9a610b59565b5b5f86013567ffffffffffffffff811115610cb857610cb7610b5d565b5b610cc488828901610bc2565b95509550506020610cd788828901610c38565b9350506040610ce888828901610b77565b9250506060610cf988828901610c6e565b9150509295509295909350565b5f805f805f8060a08789031215610d2057610d1f610b59565b5b5f610d2d89828a01610b77565b965050602087013567ffffffffffffffff811115610d4e57610d4d610b5d565b5b610d5a89828a01610bc2565b95509550506040610d6d89828a01610c38565b9350506060610d7e89828a01610b77565b9250506080610d8f89828a01610c6e565b9150509295509295509295565b5f73ffffffffffffffffffffffffffffffffffffffff82169050919050565b5f610dc582610d9c565b9050919050565b610dd581610dbb565b82525050565b610de481610c4c565b82525050565b5f606082019050610dfd5f830186610b31565b610e0a6020830185610dcc565b610e176040830184610ddb565b949350505050565b5f602082019050610e325f830184610ddb565b92915050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52603260045260245ffd5b5f82825260208201905092915050565b7f616c7265616479207374617274656400000000000000000000000000000000005f82015250565b5f610ea9600f83610e65565b9150610eb482610e75565b602082019050919050565b5f6020820190508181035f830152610ed681610e9d565b9050919050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52601260045260245ffd5b5f610f1482610b28565b9150610f1f83610b28565b925082610f2f57610f2e610edd565b5b828206905092915050565b7f4e4f545f535441525445440000000000000000000000000000000000000000005f82015250565b5f610f6e600b83610e65565b9150610f7982610f3a565b602082019050919050565b5f6020820190508181035f830152610f9b81610f62565b9050919050565b7f4e4f545f55525f5455524e0000000000000000000000000000000000000000005f82015250565b5f610fd6600b83610e65565b9150610fe182610fa2565b602082019050919050565b5f6020820190508181035f83015261100381610fca565b9050919050565b7f4e4f204d4f5245204c49464500000000000000000000000000000000000000005f82015250565b5f61103e600c83610e65565b91506110498261100a565b602082019050919050565b5f6020820190508181035f83015261106b81611032565b9050919050565b7f414c52454144595f5354415254454400000000000000000000000000000000005f82015250565b5f6110a6600f83610e65565b91506110b182611072565b602082019050919050565b5f6020820190508181035f8301526110d38161109a565b9050919050565b7f4e4f5f4f544845525f504c4159455200000000000000000000000000000000005f82015250565b5f61110e600f83610e65565b9150611119826110da565b602082019050919050565b5f6020820190508181035f83015261113b81611102565b9050919050565b7f4e4545445f4d4f524500000000000000000000000000000000000000000000005f82015250565b5f611176600983610e65565b915061118182611142565b602082019050919050565b5f6020820190508181035f8301526111a38161116a565b9050919050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52604160045260245ffd5b5f82825260208201905092915050565b828183375f83830152505050565b5f601f19601f8301169050919050565b5f61121083856111d7565b935061121d8385846111e7565b611226836111f5565b840190509392505050565b5f81519050919050565b5f82825260208201905092915050565b5f819050602082019050919050565b61126381610b28565b82525050565b5f611274838361125a565b60208301905092915050565b5f602082019050919050565b5f61129682611231565b6112a0818561123b565b93506112ab8361124b565b805f5b838110156112db5781516112c28882611269565b97506112cd83611280565b9250506001810190506112ae565b5085935050505092915050565b5f6040820190508181035f830152611301818587611205565b90508181036020830152611315818461128c565b9050949350505050565b5f8151905061132d81610c22565b92915050565b5f6020828403121561134857611347610b59565b5b5f6113558482850161131f565b91505092915050565b7f494e56414c49445f50524f4f46000000000000000000000000000000000000005f82015250565b5f611392600d83610e65565b915061139d8261135e565b602082019050919050565b5f6020820190508181035f8301526113bf81611386565b9050919050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52601160045260245ffd5b5f6113fd82610c4c565b915060ff82036114105761140f6113c6565b5b600182019050919050565b5f61142582610b28565b91507fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff8203611457576114566113c6565b5b60018201905091905056fea2646970667358221220a9f15bbdeb2636ef1a89255b26d2a330b284239463bb0d5bd02973a8829c6a8364736f6c63430008140033608060405234801561000f575f80fd5b506121888061001d5f395ff3fe608060405234801561000f575f80fd5b5060043610610029575f3560e01c80631e8e1e131461002d575b5f80fd5b610047600480360381019061004291906120a9565b61005d565b6040516100549190612139565b60405180910390f35b5f611dfc565b5f80600184845f805b8215610096578284059150848202860390508495508094508282028403905082935080925061006c565b60018411156100a3575f80fd5b5f8612156100b15788860195505b85965050505050505092915050565b6040518160208402830181516020830192505f5b82841015610117578185527f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f00000018451830991506020850194506020840193506100d4565b6101417f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000183610063565b91506020850394506020840393508592505b828411156101bd577f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f00000018551830990507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001845183099150808452602085039450602084039350610153565b81845250505050505050565b7f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000181106101f8575f805260205ff35b50565b61032081511461020d575f805260205ff35b61021b6102608201516101c9565b6102296102808201516101c9565b6102376102a08201516101c9565b6102456102c08201516101c9565b6102536102e08201516101c9565b6102616103008201516101c9565b61026f6103208201516101c9565b50565b5f80602085015161032085015260408501516103408501526060850151610360850152608085015161038085015260208301516103a0850152602080018301516103c085015260406020018301516103e08501526060602001830151610400850152608060200183015161042085015260a06020018301516104408501527f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f00000016101406103208601200690508060208501527f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f00000016020808601200660408501527f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001604060e0850120065f8501527f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000160c06101208501200691508160608501527f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000182820960a08501527f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000182830991507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000182830991507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000182830991507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000182830991507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000182830991507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000182830991507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000182830991507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000182830991507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000182830991507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000182830991507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000182830991507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000182830991507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000182830991508160808501527f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000180600184030106915081610260850152816102808501527f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000160e0610260850120068060c08601527f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000181820992508260e08601527f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f00000018184099250826101008601527f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f00000018184099250826101208601527f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f00000018184099250826101408601527f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f00000018184099250826101608601527f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000160806101e086012006610180860152505050505050565b60017f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001807f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001836060860151030106612000096102a08301527f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f00000017e6fab49b869ae62001deac878b2667bd31bf3e28e3a2d764aa49b8d9bbdd310820990507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001807f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001836060860151030106612000096102c08301527f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f00000017e6fab49b869ae62001deac878b2667bd31bf3e28e3a2d764aa49b8d9bbdd310820990507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001807f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001836060860151030106612000096102e08301527f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f00000017e6fab49b869ae62001deac878b2667bd31bf3e28e3a2d764aa49b8d9bbdd310820990507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001807f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000183606086015103010661200009610300830152610984600561028084016100c0565b610260820151600191507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001816102a0850151096102a08401527f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f00000017e6fab49b869ae62001deac878b2667bd31bf3e28e3a2d764aa49b8d9bbdd310830991507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000180826102c08601510983096102c08401527f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f00000017e6fab49b869ae62001deac878b2667bd31bf3e28e3a2d764aa49b8d9bbdd310830991507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000180826102e08601510983096102e08401527f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f00000017e6fab49b869ae62001deac878b2667bd31bf3e28e3a2d764aa49b8d9bbdd310830991507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f00000018082610300860151098309610300840152505050565b5f7f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001807f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000160208601516102a0860151098303010690507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001807f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000160408601516102c0860151098303010690507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001807f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000160608601516102e0860151098303010690507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001807f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001608086015161030086015109830301069050806101a0830152505050565b5f805f7f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f00000016101a08601516103208601510892507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000160208601516102c08601510991507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001610260850151830891507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f00000016040860151830891507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000160208601516102e08601510990507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001610280850151820890507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f00000016040860151820890507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000181830991507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000160408601516102a08601510890507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000181830991507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001610300850151830991507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f00000015f860151830991507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f00000015f8601516102a08701510990507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f00000015f860151820990507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000181830891507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001827f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f00000018501030692507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000161028086015184099250826101c08601525050505050565b81518152602082015160208201525050565b6040518151815260208201516020820152825160408201526020830151606082015260408260808360066107d05a03fa80610fe0575f805260205ff35b50505050565b5f604051835181526020840151602082015284604082015260408160608360076107d05a03fa91508161101b575f805260205ff35b825160408201526020830151606082015260408360808360066107d05a03fa915081611049575f805260205ff35b5050505050565b5f60405183815284602082015285604082015260408160608360076107d05a03fa915081611080575f805260205ff35b825160408201526020830151606082015260408360808360066107d05a03fa9150816110ae575f805260205ff35b505050505050565b5f60405183815284602082015285604082015260408360608360076107d05a03fa9150816110e6575f805260205ff35b505050505050565b6101e082016111016101e0830182610f91565b611115610180840151610220840183610fe6565b505050565b5f8061022084017f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000160c086015161026086015109925061119c837f2041579e2ef01cfff8a5fa5beed5193a4515dea9144efc57b22339f6f038564a7f1cd5412262cb1d1d287375137ed3f4e9df3c8a9c516647df4435163bbead0752846110b6565b7f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000161028085015184099250611213837f28ca53ef48461e20642e1253e3f86ee94781b562172375e6d2b40f35f2fc117e7f1b089d9d82776292623d307c295c4cd0d2db89ba113eeb786a261b1c2aea658484611050565b7f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000160c086015161028086015109925061128e837f0fae1808c61dcaf2b4d7600d26e6a2b7cde1d354f9f8327dbf943406bdf776667f01760e38638582df0cfdd86c5d319e0772755f6379c053d6fcad8f8e3355422f84611050565b7f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000160c08601516102a0860151099250611309837f1503f3f18b8265b6cd9c39b94db437ad802969a642b75ce6a88da93921b68a897f17b793fdbd7539fbe18dd22a53f08e26ee6d0354a81aa90cda0fc68a5f064a3c84611050565b60c0850151925061135c837f0e0eb334e5fc080ae584a32ecbe0764780cfd21f6051dab28f87caa296bab63d7f29273c8cf82a4de86f4689904f46af650284444bf91dda7a043e6485059da59784611050565b7f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000160a08601516102608601510892507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f00000016040860151840892507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000160a086015160020991507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001610280850151830891507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f00000016040860151830891507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000182840992507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000160a086015160030991507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f00000016102a0850151830891507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f00000016040860151830891507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000182840992507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f00000015f860151840992507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000160c0860151840992507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f00000015f8601516102a08701510991507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f00000015f860151830991507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000160c0860151830991507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000182840892507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001610180860151840892506116348360e0860183610fe6565b7f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f00000016102c085015160208701510992507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001610260850151840892507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f00000016040860151840892507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f00000016102e085015160208701510991507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001610280850151830891507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f00000016040860151830891507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000182840992507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f00000015f860151840992507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000160c0860151840992507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f00000016020860151840992507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001610300850151840992507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001837f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f00000010306925061189d837f14d051621bf3bc0dc7575ef66dcfb9e46375899400f2b1528229a376c9c65dad7f19262a4cc7ca4a899ac83e5eaa02fc6362c1b81c75ccb7a490f8335811dcdf9d84611050565b6118ab610120850182610fa3565b608085015192506118c183610160860183610fe6565b7f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000183840992506118f6836101a0860183610fe6565b61190860e08601516020860183610fe6565b61191b6101008601516060860183610fe6565b61192e61012086015160a0860183610fe6565b61197f6101408601517f294d00e74cf6ff6b409288cbd4b3bffdb0410a7ef6b3f654359f17b1e6c9d4747f011c65c93077e6c2a6abfc5a5a7a2f89b9895fad6cc0dcdafaef1a884072720d84611050565b6119d06101608601517f0e57b5c93f8bfa946d969fe69708520d8ece49cf75f7f5a0590a32586e984aad7f2727e3e2d874650e6d44aea4b0f65be01b5231e862e100e230c4024927128aa584611050565b6101c085015192507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f00000018060c087015161032087015109840892507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f00000018060e087015161026087015109840892507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f00000018061010087015161028087015109840892507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001806101208701516102a087015109840892507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001806101408701516102c087015109840892507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001806101608701516102e087015109840892507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f00000018061018087015161030087015109840892507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001837f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000103069250611b90836002600184611050565b60608501519250611ba6836101e0860183610fe6565b7f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f000000160608601516101808701510992507f30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f00000017e6fab49b869ae62001deac878b2667bd31bf3e28e3a2d764aa49b8d9bbdd31084099250611c2983610220860183610fe6565b5050505050565b5f6040516101e0830151815260206101e08401015160208201527f28b5deced45a672357ea60bb3eaabcd205ee75fb419d5281d0bbd8482e2a80b460408201527f262af6938471fd0a7ef3d8c53096d3d59cdd8352058fcfe578eced529c62155d60608201527f064974b668bd159403018b219b7632d650e2420665390809084b73ba98e68bba60808201527f256f6f2ba257abdb3d89d330226379510019ffda58ee89ef49c8574214127baf60a082015261022083015160c08201526020610220840101517f30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47817f30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47030690508060e08301527f198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c26101008301527f1800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed6101208301527f090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b6101408301527f12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa6101608301526020826101808460086107d05a03fa825181169350505050919050565b6040516103208101604052611e10846101fb565b611e1b838286610272565b611e248161074c565b611e2e8382610b27565b611e388185610c88565b611e4281856110ee565b611e4c818561111a565b611e5581611c30565b6103208203604052805f5260205ff35b5f604051905090565b5f80fd5b5f80fd5b5f80fd5b5f80fd5b5f601f19601f8301169050919050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52604160045260245ffd5b611ec482611e7e565b810181811067ffffffffffffffff82111715611ee357611ee2611e8e565b5b80604052505050565b5f611ef5611e65565b9050611f018282611ebb565b919050565b5f67ffffffffffffffff821115611f2057611f1f611e8e565b5b611f2982611e7e565b9050602081019050919050565b828183375f83830152505050565b5f611f56611f5184611f06565b611eec565b905082815260208101848484011115611f7257611f71611e7a565b5b611f7d848285611f36565b509392505050565b5f82601f830112611f9957611f98611e76565b5b8135611fa9848260208601611f44565b91505092915050565b5f67ffffffffffffffff821115611fcc57611fcb611e8e565b5b602082029050602081019050919050565b5f80fd5b5f819050919050565b611ff381611fe1565b8114611ffd575f80fd5b50565b5f8135905061200e81611fea565b92915050565b5f61202661202184611fb2565b611eec565b9050808382526020820190506020840283018581111561204957612048611fdd565b5b835b81811015612072578061205e8882612000565b84526020840193505060208101905061204b565b5050509392505050565b5f82601f8301126120905761208f611e76565b5b81356120a0848260208601612014565b91505092915050565b5f80604083850312156120bf576120be611e6e565b5b5f83013567ffffffffffffffff8111156120dc576120db611e72565b5b6120e885828601611f85565b925050602083013567ffffffffffffffff81111561210957612108611e72565b5b6121158582860161207c565b9150509250929050565b5f8115159050919050565b6121338161211f565b82525050565b5f60208201905061214c5f83018461212a565b9291505056fea2646970667358221220f2812d76bf3e1e3e20eeaf769ec166a6b38f53b787666ff03f8959c4a2c19db564736f6c63430008140033";

type GameConstructorParams =
  | [signer?: Signer]
  | ConstructorParameters<typeof ContractFactory>;

const isSuperArgs = (
  xs: GameConstructorParams
): xs is ConstructorParameters<typeof ContractFactory> => xs.length > 1;

export class Game__factory extends ContractFactory {
  constructor(...args: GameConstructorParams) {
    if (isSuperArgs(args)) {
      super(...args);
    } else {
      super(_abi, _bytecode, args[0]);
    }
  }

  override getDeployTransaction(
    overrides?: NonPayableOverrides & { from?: string }
  ): Promise<ContractDeployTransaction> {
    return super.getDeployTransaction(overrides || {});
  }
  override deploy(overrides?: NonPayableOverrides & { from?: string }) {
    return super.deploy(overrides || {}) as Promise<
      Game & {
        deploymentTransaction(): ContractTransactionResponse;
      }
    >;
  }
  override connect(runner: ContractRunner | null): Game__factory {
    return super.connect(runner) as Game__factory;
  }

  static readonly bytecode = _bytecode;
  static readonly abi = _abi;
  static createInterface(): GameInterface {
    return new Interface(_abi) as GameInterface;
  }
  static connect(address: string, runner?: ContractRunner | null): Game {
    return new Contract(address, _abi, runner) as unknown as Game;
  }
}
