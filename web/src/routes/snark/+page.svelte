<script lang="ts">
	import * as snarkjs from 'snarkjs';

	let proofToDisplay = '';
	let resultToDisplay = '';

	async function calculateProof() {
		const { proof, publicSignals } = await snarkjs.plonk.fullProve(
			{ a: 3, b: 11 },
			'circuit.wasm',
			'circuit_final.zkey'
		);

		proofToDisplay = JSON.stringify(proof, null, 1);

		const vkey = await fetch('verification_key.json').then(function (res) {
			return res.json();
		});

		const res = await snarkjs.plonk.verify(vkey, publicSignals, proof);

		resultToDisplay = res;
	}
</script>

<svelte:head>
	<title>Snarkjs client example</title>
</svelte:head>

<h1>Snarkjs client example</h1>
<button on:click={calculateProof}> Create proof </button>

<!-- JS-generated output will be added here. -->
<pre class="proof"> Proof: <code>{proofToDisplay}</code></pre>

<pre class="proof"> Result: <code>{resultToDisplay}</code></pre>
