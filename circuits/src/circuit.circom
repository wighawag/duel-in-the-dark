pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

// from https://github.com/privacy-scaling-explorations/maci/blob/v1/circuits/circom/trees/calculateTotal.circom
// This circuit returns the sum of the inputs.
// n must be greater than 0.
template CalculateTotal(n) {
    signal input nums[n];
    signal output sum;

    signal sums[n];
    sums[0] <== nums[0];

    for (var i=1; i < n; i++) {
        sums[i] <== sums[i - 1] + nums[i];
    }

    sum <== sums[n - 1];
}

// mostly from https://github.com/privacy-scaling-explorations/maci/blob/v1/circuits/circom/trees/incrementalQuinTree.circom#L29
template ValidMove() {
    signal input index;
    signal output out;

    // this is a 2 dimensional array of dimension [8][4] with access [a][b]
    // with (a-1) * 4 + b
    // where a is the location and b is the move
    // this describe the possible moves player can make with one move action
    // there is in total 8 rooms
    var array[32] =  [
        0,2,5,0,
        0,3,4,1,
        0,0,8,2,
        2,0,7,0,
        1,7,6,0,
        5,7,8,0,
        4,8,6,5,
        7,3,0,6
    ];
    
    // Ensure that index < choices
    component lessThan = LessThan(5);
    lessThan.in[0] <== index;
    lessThan.in[1] <== 32;
    lessThan.out === 1;

    component calcTotal = CalculateTotal(32);
    component eqs[32];

    // For each item, check whether its index equals the input index.
    for (var i = 0; i < 32; i ++) {
        eqs[i] = IsEqual();
        eqs[i].in[0] <== i;
        eqs[i].in[1] <== index;

        // eqs[i].out is 1 if the index matches. As such, at most one input to
        // calcTotal is not 0.
        calcTotal.nums[i] <== eqs[i].out * array[i];
    }

    // ensure it is not zero
    component zero = IsZero();
    zero.in <== calcTotal.sum;
    zero.out === 0;

    // Returns 0 + 0 + ... + item
    out <== calcTotal.sum;
}

template MyTurn() {
    signal input enemy_shot;
    signal input hit;
    signal input previous_commit_hash;
    
    signal input previous_salt;
    signal input previous_location;
    signal input move; // TODO array of up to 3 element ?, for now just a 0,1,2,3 (N,E,S,W)
    signal input new_salt;
    signal input new_location;

    signal output new_commit_hash;


    component isValid = ValidMove();
    isValid.index <== (previous_location - 1) * 4 + move;
    isValid.out === new_location;

    // ensure hit
    component is_hit = IsZero();
    is_hit.in <== enemy_shot - previous_location;
    is_hit.out === hit;

    // We check if the private previous location match the previous hash
    component previous_hasher = Poseidon(2);
    previous_hasher.inputs[0] <== previous_salt;
    previous_hasher.inputs[1] <== previous_location;
    previous_hasher.out === previous_commit_hash;

    // We compute the new hash commiting the new location
    component new_hasher = Poseidon(2);
    new_hasher.inputs[0] <== new_salt;
    new_hasher.inputs[1] <== new_location;
    new_hasher.out ==> new_commit_hash;
}

component main {public [enemy_shot, hit, previous_commit_hash]} = MyTurn();
