<script lang="ts">
	import {VIEWBOX, ROOM_SHAPES, DECOR} from './lib/ship';
	import type {RoomView, RoomKind} from './lib/view';

	let {rooms, onpick}: {rooms: RoomView[]; onpick: (room: number) => void} =
		$props();

	const FILL: Record<RoomKind, string> = {
		mine: 'fill-fuchsia-500',
		move: 'fill-zinc-400 hover:fill-zinc-200',
		shoot: 'fill-red-400 hover:fill-red-300',
		start: 'fill-zinc-400 hover:fill-zinc-200',
		revealed: 'fill-amber-400',
		shotAt: 'fill-orange-700',
		idle: 'fill-zinc-700',
	};
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	viewBox={VIEWBOX}
	class="w-full rounded-lg bg-black"
	aria-label="The ship"
>
	{#each rooms as r (r.room)}
		{@const shape = ROOM_SHAPES[r.room]}
		<g
			role="button"
			tabindex={r.pickable ? 0 : -1}
			aria-label={r.name}
			aria-disabled={!r.pickable}
			data-room={r.room}
			data-kind={r.kind}
			class={r.pickable ? 'cursor-pointer' : ''}
			onclick={() => r.pickable && onpick(r.room)}
			onkeydown={(e) => e.key === 'Enter' && r.pickable && onpick(r.room)}
		>
			<path
				d={shape.d}
				class="{r.selected ? 'fill-white' : FILL[r.kind]} stroke-black"
				stroke-width="6"
			/>
			<text
				x={shape.label[0]}
				y={shape.label[1] - 20}
				text-anchor="middle"
				class="pointer-events-none fill-black font-semibold"
				font-size="34"
			>
				{#each r.name.split(' ') as word, i (i)}
					<tspan x={shape.label[0]} dy={i === 0 ? 0 : 38}>{word}</tspan>
				{/each}
			</text>
		</g>
	{/each}
	{#each DECOR.stairs as d (d)}
		<path {d} fill="#B3ABAB" stroke="#000" stroke-width="0.2" />
	{/each}
	<g fill="#F2B7B7">
		{#each DECOR.hatches as d (d)}
			<path {d} />
		{/each}
	</g>
</svg>
