const fetch = require('node-fetch');

console.log('fetch: ');

fetch('http://jsonplaceholder.typicode.com/todos/1')
  .then(response => response.json())
  .then(json => console.log(json))
