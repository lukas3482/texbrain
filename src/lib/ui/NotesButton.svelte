<script lang="ts">
  import { projectHandle, projectName } from '$lib/project/store';
  import { notesLinks } from '$lib/bridge/links';
  import { openInNotes } from '$lib/bridge/switch';

  // only there when the open project has a braiNOTES notebook linked to it
  $: notebook = $projectName && $projectHandle ? $notesLinks[$projectName] : undefined;
</script>

{#if notebook}
  <button class="action-btn" on:click={openInNotes} title="Open the linked notebook in braiNOTES">
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="3" y="1.5" width="10" height="13" rx="1" stroke="currentColor" stroke-width="1.3"/><path d="M5.5 1.5v13M8 5h3M8 7.5h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
    <span>braiNOTES</span>
  </button>
{/if}

<style>
  .action-btn { display: flex; align-items: center; gap: 5px; padding: 5px 10px; font-size: 11.5px; font-weight: 500; color: var(--text-secondary); }
  .action-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
  .action-btn span { display: none; }
  @media (min-width: 768px) { .action-btn span { display: inline; } }
</style>
