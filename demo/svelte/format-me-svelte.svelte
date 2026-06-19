<script>
  // Mis-formatted on purpose. Run "Format code file".
  let name="Ada";let roles=["admin","editor"];
  $: isAdmin=roles.includes("admin");
  $: summary=`${name} has ${roles.length} roles`;
  function addRole(role){roles=[...roles,role];}
</script>
<main class="card"><h1>{summary}</h1>{#if isAdmin}<span class="badge">Admin</span>{/if}
<ul>{#each roles as role}<li>{role}</li>{/each}</ul></main>
<style>.card{max-width:400px;margin:0 auto;}.badge{color:#0a84ff;}</style>
