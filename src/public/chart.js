function chart(data) {
  const ctx = document.getElementById("chart").getContext('2d');
  new Chart(ctx, data);
}

const xhr = new XMLHttpRequest();
xhr.open('GET', '/chart');
xhr.onload = function() {
  chart(JSON.parse(xhr.responseText));
};
xhr.send();
