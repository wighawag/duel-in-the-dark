<script lang="ts">
	import {Spinner} from '$lib/shadcn/ui/spinner';
	import type {ActivityLine} from './lib/activity';

	let {line}: {line: ActivityLine | undefined} = $props();
</script>

{#if line}
	<p
		class="flex items-center gap-2 text-sm"
		class:text-destructive={line.tone === 'error'}
		class:text-muted-foreground={line.tone === 'ok'}
		data-testid="activity"
		role="status"
	>
		{#if line.tone === 'busy'}<Spinner />{/if}
		{line.text}
	</p>
{/if}
