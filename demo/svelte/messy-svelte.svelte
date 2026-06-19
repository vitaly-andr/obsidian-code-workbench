<script>
  let roles = ["admin", "editor"];
</script>

<!-- error: the {#each} block is never closed with {/each} -->
<ul>
  {#each roles as role}
    <li>{role}</li>
</ul>
