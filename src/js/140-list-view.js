
// ════════════════════════════════════════════════════════════════
// LIST VIEW
// ════════════════════════════════════════════════════════════════
function toggleListView(){
  listView=!listView;document.body.classList.toggle('list-view',listView);
  document.getElementById('listViewBtn').classList.toggle('active',listView);
}
